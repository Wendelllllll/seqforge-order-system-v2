/* Build a standalone manual-test worksheet. No application or database access. */
const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");

const sourcePath = path.join(__dirname, "TEST_CHECKLIST_ZH.md");
const outputPath = path.join(__dirname, "TEST_CHECKLIST_ZH.html");
const markdown = fs.readFileSync(sourcePath, "utf8").replace(/^\uFEFF/, "");
const groups = [];
const introduction = [];
const ids = new Set();
let current = null;
for (const line of markdown.replace(/\r\n?/g, "\n").split("\n")) {
  const heading = /^##\s+(.+)$/.exec(line);
  if (heading) {
    current = { title: heading[1], notes: [], items: [] };
    groups.push(current);
    continue;
  }
  const checkbox = /^\s*-\s+\[[ xX]\]\s+\*\*(.+?)\*\*\s*(.*)$/.exec(line);
  if (checkbox) {
    const label = /^([A-Za-z][A-Za-z0-9_-]*)\s+\[(P[012])\]$/.exec(checkbox[1]);
    if (!label || !checkbox[2].trim()) throw new Error(`Invalid checklist entry: ${line}`);
    if (ids.has(label[1])) throw new Error(`Duplicate checklist ID: ${label[1]}`);
    ids.add(label[1]);
    if (!current) {
      current = { title: "测试项目", notes: [], items: [] };
      groups.push(current);
    }
    current.items.push({ id: label[1], priority: label[2], text: checkbox[2].trim() });
  } else {
    if (/^\s*-\s+\[[ xX]\]/.test(line)) throw new Error(`Unrecognized checklist entry: ${line}`);
    (current ? current.notes : introduction).push(line);
  }
}
if (!ids.size) throw new Error("No checklist entries found; refusing to generate an empty worksheet.");
const payload = {
  title: "SeqForge 网站测试清单",
  sourceName: path.basename(sourcePath),
  sourceDigest: createHash("sha256").update(markdown).digest("hex"),
  introduction: introduction.join("\n").trim(),
  groups: groups.map(group => ({ ...group, notes: group.notes.join("\n").trim() })),
};
const json = JSON.stringify(payload).replace(/[<>&\u2028\u2029]/g, character => `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`);

const html = String.raw`<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'none'; base-uri 'none'; form-action 'none'">
<title>SeqForge 网站测试清单</title>
<style>
:root{color-scheme:light;--ink:#183341;--muted:#536b77;--line:#cfdee3;--teal:#006f73;--paper:#fff;--back:#f1f6f7;font-family:system-ui,-apple-system,"Segoe UI","Microsoft YaHei",sans-serif}*{box-sizing:border-box}body{margin:0;background:var(--back);color:var(--ink);line-height:1.65}button,input,select,textarea{font:inherit}button,select,input[type=checkbox],summary{cursor:pointer}button{min-height:42px;border:1px solid #8faab3;background:#fff;color:var(--ink);border-radius:8px;padding:7px 13px}button:hover{background:#e9f4f4}button.primary{background:var(--teal);color:#fff;border-color:var(--teal)}button:disabled{cursor:not-allowed;opacity:.5}a{color:#00666c}main{max-width:1180px;margin:auto;padding:28px 20px 70px}header{margin-bottom:22px}h1{font-size:clamp(1.7rem,4vw,2.5rem);line-height:1.25;margin:8px 0 14px}h2{font-size:1.15rem}p{margin:9px 0}.eyebrow{font-size:.77rem;font-weight:800;letter-spacing:.17em;color:var(--teal)}.muted{color:var(--muted)}.box{background:var(--paper);border:1px solid var(--line);border-radius:12px;padding:18px;margin:15px 0}.notice{border-left:4px solid var(--teal);background:#e5f3f1;padding:13px 16px;border-radius:5px}.warning{background:#fff0d8;border-color:#e8c382;color:#674300}.error{background:#fff0ef;border-color:#e4b1ad;color:#8c2b25}.success{background:#e4f4ec;border-color:#9acdb3;color:#165334}.controls{display:flex;gap:12px;flex-wrap:wrap;align-items:end}.controls label{display:flex;flex-direction:column;gap:4px;font-size:.86rem;font-weight:650}.controls .search{flex:1 1 280px}.controls select,.controls input{min-height:43px;max-width:100%;border:1px solid #9bb2ba;border-radius:7px;background:#fff;padding:8px 11px;color:var(--ink)}.toolbar{position:sticky;top:0;z-index:5;box-shadow:0 4px 14px #16374510}.toolbar p{margin:10px 0 0;font-size:.86rem}.metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.metric{background:#fff;border:1px solid var(--line);border-radius:10px;padding:14px}.metric strong{display:block;font-size:1.65rem;line-height:1.3;font-variant-numeric:tabular-nums}.metric span{font-size:.8rem;color:var(--muted)}.progress-grid{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-top:14px}.progress-grid label{font-size:.85rem}.progress-grid progress{display:block;width:100%;height:12px;accent-color:var(--teal);margin-top:5px}.actions{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0}.group{padding:0;overflow:hidden}.group>summary{padding:17px 20px;font-weight:750;background:#f9fcfc;display:list-item;list-style-position:inside}.group>summary:hover{background:#edf6f5}.group-count{float:right;font-weight:450;font-size:.8rem;color:var(--muted);margin:4px 0 0 15px}.group-notes{margin:16px 20px}.item{border-top:1px solid var(--line);padding:18px 20px;display:grid;grid-template-columns:28px 1fr;gap:12px}.item[hidden],.group[hidden],[hidden]{display:none!important}.item input[type=checkbox]{width:22px;height:22px;margin:5px 0 0;accent-color:var(--teal)}.item-head{display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:6px}.item-id{font-weight:800;font-size:.88rem;font-variant-numeric:tabular-nums}.pill{font-size:.73rem;font-weight:700;padding:1px 8px;border-radius:20px;background:#edf2f4}.p-P0{background:#fff0dc;color:#8b4d00}.p-P1{background:#e6effb;color:#285789}.p-P2{background:#eeedf6;color:#65508e}.status-pass{background:#dcefe5;color:#17613c}.status-fail{background:#ffe6e4;color:#a1261d}.status-blocked{background:#fff0d9;color:#865009}.status-na{background:#eeeaf6;color:#644c80}.item-text{white-space:pre-wrap;overflow-wrap:anywhere;margin:0 0 12px}.item-tools{display:grid;grid-template-columns:150px 1fr;gap:12px;align-items:start}.item-tools label{font-size:.8rem;color:var(--muted);display:flex;flex-direction:column;gap:4px}.item-tools select,.item-tools textarea,textarea.run-notes{width:100%;border:1px solid #a8bcc3;border-radius:7px;padding:7px 9px;background:#fff;color:var(--ink)}textarea{resize:vertical;min-height:70px}textarea.run-notes{margin-top:7px;min-height:90px}.source-text{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit;font-size:.88rem;margin:0;line-height:1.8}.source-text table{font-size:inherit}.intro-content{padding-top:12px}.doc-heading{margin:16px 0 7px;font-size:1rem}.table-scroll{overflow-x:auto;margin:12px 0}.doc-table{border-collapse:collapse;width:100%;font-size:.83rem;min-width:580px}.doc-table td,.doc-table th{border:1px solid var(--line);padding:8px;text-align:left;vertical-align:top}.doc-table th{background:#eef5f6}.doc-paragraph{white-space:pre-wrap;overflow-wrap:anywhere;font-size:.9rem}.empty{padding:35px;text-align:center;border:1px dashed #a4bbc1;border-radius:10px}.footer{font-size:.82rem;color:var(--muted);margin-top:28px}:focus-visible{outline:3px solid #e99c36;outline-offset:3px}.file-label{display:inline-flex;align-items:center;gap:10px;flex-wrap:wrap;font-size:.88rem}.file-label input{max-width:100%}.screen-reader{position:absolute;width:1px;height:1px;padding:0;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}@media(max-width:700px){main{padding:18px 12px 45px}.metrics{grid-template-columns:1fr 1fr}.progress-grid{grid-template-columns:1fr;gap:8px}.item{padding:16px 12px;gap:8px}.item-tools{grid-template-columns:1fr}.group>summary{padding:14px 12px}.group-count{float:none;display:block;margin-left:20px}.toolbar{position:static}.box{padding:14px}.group{padding:0}.controls label{flex:1 1 130px}.controls .search{flex-basis:100%}}@media print{body{background:#fff}.toolbar,.actions,.import-controls,.footer,button{display:none!important}main{max-width:none;padding:0}.box{box-shadow:none;break-inside:avoid}.item{break-inside:avoid}.group{break-inside:auto}.group>summary{background:#fff}.item-tools textarea{height:auto}.notice{background:#fff}.metrics{grid-template-columns:repeat(4,1fr)}}
</style>
</head>
<body><main>
<header><div class="eyebrow">SEQFORGE / MANUAL QA</div><h1>网站测试勾选清单</h1><p class="muted">逐项实测、记录证据，让订单从客户提交走到真正交付。</p><p class="notice"><strong>勾选只代表实测通过。</strong>失败、阻塞、不适用请使用状态菜单。默认全未测试；打开本文件不会测试网站、提交订单或发送邮件。清单更新后，旧版通过记录须按新预期复核；当日自动化和云端证据见第 27 组。</p></header>
<noscript><p class="box error">需要启用 JavaScript 才能勾选和保存进度。原始清单见同目录 TEST_CHECKLIST_ZH.md。</p></noscript>
<details class="box" open><summary><strong>开始前必读 · 使用方法、环境约束与功能边界</strong></summary><div id="intro" class="intro-content"></div><p><a href="TEST_CHECKLIST_ZH.md">打开完整原始 Markdown 清单</a> · 原文中的限制和待实现功能同样属于验收依据。</p></details>
<section class="box" aria-label="本轮测试记录"><label for="runNotes"><strong>本轮记录</strong><span class="muted"> · 执行人、日期、代码版本、隔离环境、浏览器/设备、账号代号、邮件模式</span></label><textarea id="runNotes" class="run-notes" maxlength="20000" placeholder="填写本轮环境与证据位置；不要记录密码、SMTP 密钥、验证 token 或真实客户资料。"></textarea><p class="muted">进度仅尝试保存在当前浏览器。换设备、移动本文件、更换浏览器或清理浏览器数据前，请导出 JSON 备份；本地文件的存储支持可能因浏览器而异。</p><p id="storageMessage" role="status" aria-live="polite"></p><div class="actions"><button id="exportJson" type="button" class="primary">导出 JSON 备份</button><button id="exportMarkdown" type="button">导出 Markdown 报告</button></div><div class="import-controls"><label class="file-label" for="importFile">导入已有 JSON 备份<input id="importFile" type="file" accept=".json,application/json"></label><p class="muted">导入只匹配本清单已有 ID，不根据条目文字猜测，不把未测试条目自动标为通过。先查看预览，再应用。</p><div id="importPreview" hidden class="box warning"><p id="importMessage"></p><div class="actions"><button id="applyImport" type="button">应用这份备份</button><button id="cancelImport" type="button">取消导入</button></div></div><p id="importError" role="alert"></p></div></section>
<section class="box" aria-label="全局测试进度"><div class="metrics"><div class="metric"><strong id="totalCount">0</strong><span>全部条目</span></div><div class="metric"><strong id="passCount">0</strong><span>实测通过</span></div><div class="metric"><strong id="processedCount">0</strong><span>已处理（所有非未测试状态）</span></div><div class="metric"><strong id="pendingCount">0</strong><span>未测试</span></div></div><div class="progress-grid"><label><span id="passProgressLabel"></span><progress id="passProgress" max="1" value="0"></progress></label><label><span id="processedProgressLabel"></span><progress id="processedProgress" max="1" value="0"></progress></label></div><p id="globalCounts" class="muted"></p><p class="muted">失败、阻塞、不适用均计入已处理，均不计入通过。通过率的分母始终是全部条目。</p></section>
<section class="box toolbar" aria-label="筛选测试项目"><div class="controls"><label class="search" for="search">搜索（中文、ID、步骤、预期、分组或备注）<input id="search" type="search" placeholder="例如：邮箱、客户价格、文件名、E2ES-001" autocomplete="off"></label><label for="priority">优先级<select id="priority"><option value="all">全部优先级</option><option value="P0">P0 · 核心检查</option><option value="P1">P1 · 重要检查</option><option value="P2">P2 · 体验检查</option></select></label><label for="status">测试状态<select id="status"><option value="all">全部状态</option><option value="pending">未测试</option><option value="pass">通过</option><option value="fail">失败</option><option value="blocked">阻塞</option><option value="na">不适用</option></select></label></div><p id="filteredCounts" role="status" aria-live="polite"></p><div class="actions"><button id="expandGroups" type="button">展开筛选内分组</button><button id="collapseGroups" type="button">折叠筛选内分组</button></div></section>
<div id="groups"></div><p id="empty" class="empty" hidden>没有符合筛选条件的项目。可调整关键词、优先级或状态。</p><p class="footer">这是独立的本地测试记录工具，无外部依赖或网络请求，不改变 SeqForge 网站。条目变动后重新运行 build-checklist.cjs 生成；保留稳定 ID 可继续使用既有备份。</p>
</main>
<script id="checklistData" type="application/json">__CHECKLIST_DATA__</script>
<script>
"use strict";
const DATA = JSON.parse(document.getElementById("checklistData").textContent);
const STORAGE_KEY = "seqforge:manual-qa-checklist:v1";
const APP_ID = "seqforge-manual-qa";
const STATUS = { pending: "未测试", pass: "通过", fail: "失败", blocked: "阻塞", na: "不适用" };
const allItems = DATA.groups.flatMap(group => group.items.map(item => ({ ...item, group: group.title })));
const knownItems = new Map(allItems.map(item => [item.id, item]));
const records = new Map(allItems.map(item => [item.id, { id: item.id, status: "pending", note: "", updatedAt: null }]));
const rows = new Map();
const groupNodes = [];
const ui = id => document.getElementById(id);
let imported = null;
let runNotes = "";
let savedTimer;
let storageConflict = false;
function node(tag, text, className) { const element = document.createElement(tag); if (text !== undefined) element.textContent = text; if (className) element.className = className; return element; }
function appendPlainMarkdown(parent, source) {
  const lines = source.split(/\r?\n/); let paragraph = [];
  const flush = () => { if (paragraph.length) { parent.append(node("p", paragraph.join("\n").replace(/\*\*/g, "").replace(/\x60/g, ""), "doc-paragraph")); paragraph = []; } };
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (!line.trim()) { flush(); continue; }
    if (/^\|/.test(line) && /^\|[\s:|-]+\|\s*$/.test(lines[index + 1] || "")) {
      flush(); const wrap = node("div", undefined, "table-scroll"); const table = node("table", undefined, "doc-table");
      const cells = value => value.trim().replace(/^\||\|$/g, "").split("|").map(cell => cell.trim());
      const head = node("thead"); const header = node("tr"); cells(line).forEach(cell => header.append(node("th", cell))); head.append(header); table.append(head);
      const body = node("tbody"); index += 2;
      while (index < lines.length && /^\|/.test(lines[index])) { const row = node("tr"); cells(lines[index]).forEach(cell => row.append(node("td", cell))); body.append(row); index++; }
      index--; table.append(body); wrap.append(table); parent.append(wrap); continue;
    }
    if (/^#{1,6}\s/.test(line)) { flush(); parent.append(node("h2", line.replace(/^#{1,6}\s+/, ""), "doc-heading")); continue; }
    paragraph.push(line);
  }
  flush();
}
function validateBackup(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) || value.app !== APP_ID || value.version !== 1 || !Array.isArray(value.records)) throw new Error("备份格式不正确：需要本工具导出的 version 1 JSON。");
  if (value.records.length > 10000) throw new Error("备份条目过多，未导入。");
  if (value.runNotes !== undefined && (typeof value.runNotes !== "string" || value.runNotes.length > 20000)) throw new Error("本轮记录格式或长度不正确。");
  if (value.sourceDigest !== undefined && (typeof value.sourceDigest !== "string" || !/^[a-f0-9]{64}$/.test(value.sourceDigest))) throw new Error("清单来源校验值格式不正确。");
  const seen = new Set(); const valid = []; let unknown = 0;
  for (const record of value.records) {
    if (!record || typeof record !== "object" || Array.isArray(record) || typeof record.id !== "string" || !/^[A-Za-z][A-Za-z0-9_-]{0,99}$/.test(record.id)) throw new Error("备份包含无效条目 ID。");
    if (seen.has(record.id)) throw new Error("备份有重复 ID：" + record.id);
    seen.add(record.id);
    if (typeof record.status !== "string" || !Object.hasOwn(STATUS, record.status) || typeof record.note !== "string" || record.note.length > 20000) throw new Error("条目 " + record.id + " 的状态或备注格式不正确。");
    if (record.updatedAt !== undefined && record.updatedAt !== null && (typeof record.updatedAt !== "string" || record.updatedAt.length > 64 || Number.isNaN(Date.parse(record.updatedAt)))) throw new Error("条目 " + record.id + " 的记录时间格式不正确。");
    if (!knownItems.has(record.id)) { unknown++; continue; }
    valid.push({ id: record.id, status: record.status, note: record.note, updatedAt: record.updatedAt || null });
  }
  return { records: valid, unknown, runNotes: value.runNotes, differentSource: !!value.sourceDigest && value.sourceDigest !== DATA.sourceDigest };
}
function backup() { return { app: APP_ID, version: 1, sourceName: DATA.sourceName, sourceDigest: DATA.sourceDigest, exportedAt: new Date().toISOString(), runNotes, records: Array.from(records.values()) }; }
function storageMessage(message, warning) { const element = ui("storageMessage"); element.textContent = message; element.className = warning ? "notice warning" : "muted"; }
function save() {
  if (storageConflict) { storageMessage("另一个标签页更新了进度，本页已暂停自动写入，避免覆盖。请导出当前 JSON 后重新打开页面，或明确导入要保留的备份。", true); return; }
  try {
    const value = JSON.stringify(backup()); localStorage.setItem(STORAGE_KEY, value);
    if (localStorage.getItem(STORAGE_KEY) !== value) throw new Error("Storage write not confirmed");
    storageMessage("已保存到当前浏览器 · " + new Date().toLocaleTimeString("zh-CN") + "。建议在每轮结束时导出 JSON。", false);
  } catch { storageMessage("浏览器未能保存进度。当前页面中的记录仍在，请保持页面打开并立即导出 JSON；关闭或刷新可能丢失未备份内容。", true); }
}
function scheduleSave() { clearTimeout(savedTimer); savedTimer = setTimeout(() => { savedTimer = null; save(); }, 220); }
function restore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) { storageMessage("尚无本地测试记录：全部项目未测试。编辑后会尝试自动保存。", false); return; }
    const saved = validateBackup(JSON.parse(raw)); saved.records.forEach(record => records.set(record.id, record)); runNotes = saved.runNotes || "";
    storageMessage("已恢复当前浏览器保存的 " + saved.records.length + " 项记录；新增条目仍为未测试。" + (saved.differentSource ? "清单原文已更新，请复核既有通过记录是否仍适用。" : ""), saved.differentSource);
  } catch { storageMessage("本地进度不可读取或格式不兼容，未据此标记任何条目。原存储未被主动清除；可先导入有效 JSON 备份。", true); }
}
function counts(items) { const result = { total: items.length, pending: 0, pass: 0, fail: 0, blocked: 0, na: 0 }; items.forEach(item => result[records.get(item.id).status]++); return result; }
function countsText(count) { return "通过 " + count.pass + " · 失败 " + count.fail + " · 阻塞 " + count.blocked + " · 不适用 " + count.na + " · 未测试 " + count.pending; }
function refreshRow(id) {
  const record = records.get(id); const row = rows.get(id); if (!row) return;
  row.check.checked = record.status === "pass"; row.select.value = record.status; row.badge.textContent = STATUS[record.status]; row.badge.className = "pill status-" + record.status;
  if (row.note.value !== record.note) row.note.value = record.note;
}
function changed(id, patch) { records.set(id, { ...records.get(id), ...patch, updatedAt: new Date().toISOString() }); refreshRow(id); updateCountsAndFilters(); scheduleSave(); }
function updateCountsAndFilters() {
  const total = counts(allItems); const processed = total.total - total.pending;
  ui("totalCount").textContent = total.total; ui("passCount").textContent = total.pass; ui("processedCount").textContent = processed; ui("pendingCount").textContent = total.pending;
  ui("passProgress").max = total.total || 1; ui("passProgress").value = total.pass; ui("processedProgress").max = total.total || 1; ui("processedProgress").value = processed;
  ui("passProgressLabel").textContent = "实测通过 " + total.pass + " / " + total.total + "（" + Math.round(total.pass / total.total * 100) + "%）";
  ui("processedProgressLabel").textContent = "已处理 " + processed + " / " + total.total + "（" + Math.round(processed / total.total * 100) + "%）";
  ui("globalCounts").textContent = "全局：" + countsText(total);
  const query = ui("search").value.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean); const priority = ui("priority").value; const status = ui("status").value; const visible = [];
  for (const group of groupNodes) {
    let shown = 0;
    for (const item of group.items) {
      const record = records.get(item.id); const haystack = [item.id, item.priority, item.text, item.group, record.note, STATUS[record.status]].join(" ").toLocaleLowerCase();
      const match = (priority === "all" || item.priority === priority) && (status === "all" || record.status === status) && query.every(term => haystack.includes(term));
      rows.get(item.id).root.hidden = !match; if (match) { shown++; visible.push(item); }
    }
    group.root.hidden = shown === 0; const groupCount = counts(group.items);
    group.count.textContent = "本组 " + group.items.length + " 项 · 显示 " + shown + " · 通过 " + groupCount.pass;
  }
  ui("filteredCounts").textContent = "当前筛选：" + visible.length + " / " + total.total + " 项 · " + countsText(counts(visible)); ui("empty").hidden = visible.length !== 0;
}
function render() {
  appendPlainMarkdown(ui("intro"), DATA.introduction);
  DATA.groups.filter(group => !group.items.length).forEach(group => { ui("intro").append(node("h2", group.title, "doc-heading")); appendPlainMarkdown(ui("intro"), group.notes); });
  for (const group of DATA.groups.filter(group => group.items.length)) {
    const root = node("details", undefined, "box group"); root.open = groupNodes.length < 4;
    const summary = node("summary", group.title); const count = node("span", "", "group-count"); summary.append(count); root.append(summary);
    if (group.notes) { const notes = node("div", undefined, "group-notes"); appendPlainMarkdown(notes, group.notes); root.append(notes); }
    const items = group.items.map(item => knownItems.get(item.id));
    for (const item of items) {
      const entry = node("article", undefined, "item"); entry.id = "entry-" + item.id;
      const check = node("input"); check.type = "checkbox"; check.id = "check-" + item.id; check.setAttribute("aria-label", item.id + " 实测通过（勾选仅表示通过）"); check.setAttribute("aria-describedby", "text-" + item.id); entry.append(check);
      const content = node("div"); const head = node("div", undefined, "item-head"); const identifier = node("label", item.id, "item-id"); identifier.htmlFor = check.id;
      const badge = node("span", "", "pill"); head.append(identifier, node("span", item.priority, "pill p-" + item.priority), badge); content.append(head);
      const text = node("p", item.text, "item-text"); text.id = "text-" + item.id; content.append(text);
      const fields = node("div", undefined, "item-tools"); const stateLabel = node("label", "测试状态"); const select = node("select"); select.setAttribute("aria-label", item.id + " 测试状态");
      Object.entries(STATUS).forEach(([value, name]) => { const option = node("option", name); option.value = value; select.append(option); }); stateLabel.append(select);
      const noteLabel = node("label", "备注 / 实际结果 / 证据位置"); const note = node("textarea"); note.rows = 2; note.maxLength = 20000; note.placeholder = "失败原因、阻塞条件、订单号或证据文件位置；不记录敏感信息。"; note.setAttribute("aria-label", item.id + " 备注"); noteLabel.append(note); fields.append(stateLabel, noteLabel); content.append(fields); entry.append(content); root.append(entry);
      rows.set(item.id, { root: entry, check, select, note, badge }); refreshRow(item.id);
      check.addEventListener("change", () => changed(item.id, { status: check.checked ? "pass" : "pending" }));
      select.addEventListener("change", () => changed(item.id, { status: select.value })); note.addEventListener("input", () => changed(item.id, { note: note.value }));
    }
    groupNodes.push({ root, count, items }); ui("groups").append(root);
  }
  ui("runNotes").value = runNotes; updateCountsAndFilters();
}
function download(filename, text, mime) {
  const blob = new Blob([text], { type: mime }); const url = URL.createObjectURL(blob); const link = node("a"); link.href = url; link.download = filename; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
}
function dateSuffix() { const now = new Date(); return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, "0"), String(now.getDate()).padStart(2, "0")].join("-"); }
ui("exportJson").addEventListener("click", () => { clearTimeout(savedTimer); savedTimer = null; save(); download("SeqForge-测试进度-" + dateSuffix() + ".json", JSON.stringify(backup(), null, 2), "application/json;charset=utf-8"); });
ui("exportMarkdown").addEventListener("click", () => {
  const total = counts(allItems); const lines = ["# SeqForge 人工测试记录", "", "导出时间：" + new Date().toLocaleString("zh-CN"), "", "全部 " + total.total + " 项；" + countsText(total), "", "勾选仅代表通过；失败、阻塞、不适用均不计入通过。", "", "## 本轮记录", "", runNotes || "未填写", ""];
  if (DATA.introduction) lines.push("## 原始说明", "", DATA.introduction, "");
  DATA.groups.forEach(group => { lines.push("## " + group.title, ""); if (group.notes) lines.push(group.notes, ""); group.items.forEach(item => { const record = records.get(item.id); lines.push("- [" + (record.status === "pass" ? "x" : " ") + "] **" + item.id + " [" + item.priority + "]** " + item.text + " — 状态：" + STATUS[record.status]); if (record.note) lines.push(...record.note.split(/\r?\n/).map(line => "  > " + line)); if (record.updatedAt) lines.push("  > 记录时间：" + record.updatedAt); lines.push(""); }); });
  download("SeqForge-测试报告-" + dateSuffix() + ".md", lines.join("\n"), "text/markdown;charset=utf-8");
});
ui("importFile").addEventListener("change", async event => {
  imported = null; ui("importPreview").hidden = true; ui("importError").textContent = ""; const file = event.target.files[0]; if (!file) return;
  try {
    if (file.size > 20 * 1024 * 1024) throw new Error("备份超过 20 MiB，未读取。");
    const value = validateBackup(JSON.parse((await file.text()).replace(/^\uFEFF/, ""))); if (!value.records.length) throw new Error("备份没有与本清单匹配的 ID，未导入。"); imported = value;
    const pass = value.records.filter(record => record.status === "pass").length;
    ui("importMessage").textContent = "将更新 " + value.records.length + " 个已知 ID（其中 " + pass + " 项在备份中明确标为通过），忽略 " + value.unknown + " 个未知 ID。未出现在备份中的条目保持当前状态。匹配条目的现有状态与备注将被备份替换，请先导出现有 JSON 留底。" + (value.runNotes !== undefined ? "本轮记录也将使用备份内容。" : "") + (value.differentSource ? "这份备份来自不同版本的清单，请检查条目含义是否变化。" : "");
    ui("importPreview").hidden = false;
  } catch (error) { ui("importError").textContent = error instanceof Error ? error.message : "无法读取备份。"; }
  event.target.value = "";
});
ui("cancelImport").addEventListener("click", () => { imported = null; ui("importPreview").hidden = true; });
ui("applyImport").addEventListener("click", () => {
  if (!imported) return; const count = imported.records.length; imported.records.forEach(record => records.set(record.id, { ...record })); if (imported.runNotes !== undefined) { runNotes = imported.runNotes; ui("runNotes").value = runNotes; }
  imported = null; rows.forEach((_row, id) => refreshRow(id)); ui("importPreview").hidden = true; ui("importError").textContent = "已应用 " + count + " 项明确记录。未自动新增任何通过项目；请复核导入结果。"; updateCountsAndFilters(); clearTimeout(savedTimer); savedTimer = null; storageConflict = false; save();
});
ui("runNotes").addEventListener("input", () => { runNotes = ui("runNotes").value; scheduleSave(); });
["search", "priority", "status"].forEach(id => ui(id).addEventListener(id === "search" ? "input" : "change", updateCountsAndFilters));
ui("expandGroups").addEventListener("click", () => groupNodes.filter(group => !group.root.hidden).forEach(group => { group.root.open = true; }));
ui("collapseGroups").addEventListener("click", () => groupNodes.filter(group => !group.root.hidden).forEach(group => { group.root.open = false; }));
window.addEventListener("pagehide", () => { if (savedTimer) { clearTimeout(savedTimer); savedTimer = null; save(); } });
window.addEventListener("storage", event => { if (event.key === STORAGE_KEY) { storageConflict = true; clearTimeout(savedTimer); savedTimer = null; storageMessage("另一个标签页更新了测试进度，本页已暂停自动保存。请先导出当前记录，再重新打开页面或明确导入所需版本；本页不会自动合并或覆盖。", true); } });
restore(); render();
</script>
</body></html>`;

fs.writeFileSync(outputPath, html.replace("__CHECKLIST_DATA__", () => json), "utf8");
console.log(`Generated ${path.basename(outputPath)} with ${ids.size} unchecked test items across ${groups.filter(group => group.items.length).length} groups.`);
