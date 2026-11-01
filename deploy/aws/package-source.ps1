[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$Destination
)

# Packages current working files, including intended uncommitted source.
# No git archive, credential loading, dependency installation or app execution.
$ErrorActionPreference = 'Stop'
$repositoryRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$repositoryPrefix = $repositoryRoot.TrimEnd('\', '/') + [IO.Path]::DirectorySeparatorChar

# OneDrive files legitimately carry ReparsePoint without redirecting the path.
# Open the reparse point itself and accept only Microsoft's CLOUD tag family;
# never infer safety from an empty LinkType/Target alone.
if (-not ('SeqForge.Deploy.SourcePathInfo' -as [type])) {
    Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;
namespace SeqForge.Deploy {
    public static class SourcePathInfo {
        [StructLayout(LayoutKind.Sequential)]
        private struct AttributeTagInfo { public uint Attributes; public uint Tag; }
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern SafeFileHandle CreateFileW(string path, uint access, uint share,
            IntPtr security, uint disposition, uint flags, IntPtr template);
        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool GetFileInformationByHandleEx(SafeFileHandle handle,
            int infoClass, out AttributeTagInfo info, uint size);
        public static uint GetReparseTag(string path) {
            // OPEN_EXISTING; OPEN_REPARSE_POINT | BACKUP_SEMANTICS also works for directories.
            using (var handle = CreateFileW(path, 0, 7, IntPtr.Zero, 3, 0x02200000, IntPtr.Zero)) {
                if (handle.IsInvalid) throw new Win32Exception(Marshal.GetLastWin32Error());
                AttributeTagInfo info;
                if (!GetFileInformationByHandleEx(handle, 9, out info, 8))
                    throw new Win32Exception(Marshal.GetLastWin32Error());
                return info.Tag;
            }
        }
        public static bool IsCloudFileTag(uint tag) {
            // IO_REPARSE_TAG_CLOUD and CLOUD_1 through CLOUD_F; no name-surrogate bit.
            return (tag & 0xFFFF0FFFu) == 0x9000001Au;
        }
    }
}
'@
}
function Assert-SafeSourceItem([IO.FileSystemInfo]$Item) {
    foreach ($property in @('LinkType', 'Target', 'LinkTarget')) {
        if ($Item.PSObject.Properties[$property] -and
            @($Item.$property | Where-Object { -not [string]::IsNullOrWhiteSpace([string]$_) }).Count -gt 0) {
            throw "Linked source paths are not accepted: $($Item.FullName)"
        }
    }
    if ($Item.Attributes -band [IO.FileAttributes]::ReparsePoint) {
        $tag = [SeqForge.Deploy.SourcePathInfo]::GetReparseTag($Item.FullName)
        if (-not [SeqForge.Deploy.SourcePathInfo]::IsCloudFileTag($tag)) {
            throw ("Unsupported reparse tag 0x{0:X8}: {1}" -f $tag, $Item.FullName)
        }
    }
}
Assert-SafeSourceItem (Get-Item -LiteralPath $repositoryRoot -Force)
$archivePath = [IO.Path]::GetFullPath($Destination)
if ([IO.Path]::GetExtension($archivePath) -ne '.zip') { throw 'Destination must be a .zip file.' }
if ($archivePath.StartsWith($repositoryPrefix, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Choose an archive destination outside the source repository.'
}
if (Test-Path -LiteralPath $archivePath) { throw 'Destination already exists; choose a new filename.' }
if (-not (Test-Path -LiteralPath ([IO.Path]::GetDirectoryName($archivePath)) -PathType Container)) {
    throw 'Create the destination directory first.'
}

$sourceFiles = [Collections.Generic.List[IO.FileInfo]]::new()
function Add-SourceItem([string]$LiteralPath) {
    $item = Get-Item -LiteralPath $LiteralPath -Force
    Assert-SafeSourceItem $item
    if (-not $item.FullName.StartsWith($repositoryPrefix, [StringComparison]::OrdinalIgnoreCase)) {
        throw 'Source path escaped the repository.'
    }
    $ancestor = if ($item.PSIsContainer) { $item.Parent } else { $item.Directory }
    while ($ancestor -and $ancestor.FullName -ne $repositoryRoot) {
        Assert-SafeSourceItem (Get-Item -LiteralPath $ancestor.FullName -Force)
        $ancestor = $ancestor.Parent
    }
    if ($item.PSIsContainer) {
        foreach ($child in (Get-ChildItem -LiteralPath $item.FullName -Force)) {
            Add-SourceItem $child.FullName
        }
        return
    }
    $relative = $item.FullName.Substring($repositoryPrefix.Length).Replace('\', '/')
    $isTemplate = $relative -in @('deploy/aws/app.env.example', 'deploy/aws/deploy.env.example')
    if (($item.Name -match '^\.env($|\.)' -and -not $isTemplate) -or
        $relative -match '(^|/)(node_modules|\.next|\.git|storage|tmp|temp)(/|$)' -or
        $item.Name -match '(?i)\.(pem|key|p12|pfx|db|sqlite[0-9]*|zip|tar|gz|bak|log)$') {
        throw "Unexpected private/generated file in an allowed source directory: $relative"
    }
    # A final high-confidence check supplements the path allowlist. Never print
    # a matched value. This is not a substitute for reviewing source for secrets.
    if ($item.Extension -match '^\.(ts|tsx|js|mjs|cjs|json|html|css|sql|yaml|yml|md|ps1|example)$' -or
        $item.Name -in @('Dockerfile', 'Caddyfile')) {
        $content = [IO.File]::ReadAllText($item.FullName)
        if ($content -match '-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----' -or
            $content -match '\b(?:AKIA|ASIA)[A-Z0-9]{16}\b') {
            throw "Possible secret detected; review this file before packaging: $relative"
        }
    }
    $sourceFiles.Add($item)
}

# This list intentionally excludes all local environment files, data, personal
# documents, git history, QA exports and generated dependencies/build output.
$allowedFiles = @(
    'package.json', 'package-lock.json', 'next.config.ts', 'postcss.config.mjs',
    'tsconfig.json', 'prisma.config.ts', 'prisma/schema.prisma',
    'scripts/seed-dropboxes.ts', 'scripts/internal-mail.ts'
)
$allowedDirectories = @('src', 'public', 'prisma/migrations', 'deploy/aws')
foreach ($relative in $allowedFiles + $allowedDirectories) {
    Add-SourceItem (Join-Path $repositoryRoot $relative)
}

Add-Type -AssemblyName System.IO.Compression
$archiveStream = $null
$archive = $null
$archiveCreated = $false
$hashes = @{}
try {
    $archiveStream = [IO.File]::Open($archivePath, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write)
    $archiveCreated = $true
    $archive = [IO.Compression.ZipArchive]::new($archiveStream, [IO.Compression.ZipArchiveMode]::Create, $true)
    foreach ($file in ($sourceFiles | Sort-Object FullName)) {
        $relative = $file.FullName.Substring($repositoryPrefix.Length).Replace('\', '/')
        $bytes = [IO.File]::ReadAllBytes($file.FullName)
        $sha = [Security.Cryptography.SHA256]::Create()
        try { $hashes[$relative] = [BitConverter]::ToString($sha.ComputeHash($bytes)).Replace('-', '').ToLowerInvariant() }
        finally { $sha.Dispose() }
        $entry = $archive.CreateEntry($relative, [IO.Compression.CompressionLevel]::Optimal)
        $entryStream = $entry.Open()
        try { $entryStream.Write($bytes, 0, $bytes.Length) }
        finally { $entryStream.Dispose() }
    }
    # Fail rather than claim one coherent release if a file changed mid-copy.
    foreach ($file in $sourceFiles) {
        $relative = $file.FullName.Substring($repositoryPrefix.Length).Replace('\', '/')
        Assert-SafeSourceItem (Get-Item -LiteralPath $file.FullName -Force)
        if ((Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant() -ne $hashes[$relative]) {
            throw "Source changed during packaging; retry after edits finish: $relative"
        }
    }
    $manifest = (($hashes.Keys | Sort-Object | ForEach-Object { $hashes[$_] + '  ' + $_ }) -join "`n") + "`n"
    $manifestEntry = $archive.CreateEntry('SOURCE-MANIFEST.sha256')
    $writer = [IO.StreamWriter]::new($manifestEntry.Open(), [Text.UTF8Encoding]::new($false))
    try { $writer.Write($manifest) }
    finally { $writer.Dispose() }
    $archive.Dispose()
    $archive = $null
    $archiveStream.Dispose()
    $archiveStream = $null
    Write-Output "Created $archivePath with $($sourceFiles.Count) allowlisted source files and a SHA-256 manifest."
    Write-Output 'Review this snapshot before upload. It contains current working source, not necessarily a committed release.'
} catch {
    if ($archive) { $archive.Dispose() }
    if ($archiveStream) { $archiveStream.Dispose() }
    if ($archiveCreated) { Remove-Item -LiteralPath $archivePath }
    throw
}
