import assert from "node:assert/strict";
import { spawn, execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { cp, mkdtemp, rm, symlink } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import nextEnv from "@next/env";
import { PrismaClient } from "@prisma/client";

// A copied application, private PostgreSQL schema, result directory and random port
// keep every test write away from the working app, including failed test runs.
const root = process.cwd();
nextEnv.loadEnvConfig(root);
const database = new URL(process.env.DATABASE_URL || "");
assert.ok(["localhost", "127.0.0.1"].includes(database.hostname), "Smoke tests require local PostgreSQL");
const schema = `seqforge_smoke_${randomUUID().replaceAll("-", "")}`;
database.searchParams.set("schema", schema);
const directory = await mkdtemp(path.join(tmpdir(), "seqforge-smoke-"));
const db = new PrismaClient({ datasourceUrl: database.toString() });
const env = {
  ...process.env, NODE_ENV: "development", DATABASE_URL: database.toString(),
  BETTER_AUTH_SECRET: randomUUID() + randomUUID(),
  RESULT_STORAGE_PATH: path.join(directory, "results"),
  NEXT_TELEMETRY_DISABLED: "1", SEQFORGE_SMOKE_SCHEMA: schema,
  // Never let synthetic accounts/orders send through the developer's real mailbox.
  INTERNAL_MAIL_MODE: "preview", INTERNAL_MAIL_TO: "staff@example.test", INTERNAL_MAIL_FROM: "sender@example.test",
  CUSTOMER_MAIL_MODE: "preview", CUSTOMER_MAIL_FROM: "sender@example.test", CUSTOMER_MAIL_ALLOWED_RECIPIENTS: "",
  SMTP_HOST: "", SMTP_PORT: "", SMTP_USER: "", SMTP_PASSWORD: "",
};
let server;
let serverLog = "";

function run(args, overrides = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd: directory, env: { ...env, ...overrides }, stdio: "inherit", windowsHide: true });
    child.once("error", reject);
    child.once("exit", code => code === 0 ? resolve() : reject(new Error(`Test command failed (${code})`)));
  });
}

try {
  for (const entry of ["src", "prisma", "scripts", "package.json", "next.config.ts", "tsconfig.json", "postcss.config.mjs", "prisma.config.ts"]) {
    await cp(path.join(root, entry), path.join(directory, entry), { recursive: true });
  }
  for (const entry of ["node_modules", "public"]) {
    await symlink(path.join(root, entry), path.join(directory, entry), process.platform === "win32" ? "junction" : "dir");
  }
  await run(["node_modules/prisma/build/index.js", "migrate", "deploy"]);
  // Seed's existing local-only guard remains intact; it connects only to our schema.
  await run(["node_modules/tsx/dist/cli.mjs", "prisma/seed.ts"], { BETTER_AUTH_URL: "http://localhost:3000" });
  const port = await new Promise((resolve, reject) => {
    const socket = createServer();
    socket.once("error", reject);
    socket.listen(0, "127.0.0.1", () => { const address = socket.address(); socket.close(() => resolve(address.port)); });
  });
  assert.notEqual(port, 3000);
  env.BETTER_AUTH_URL = env.SEQFORGE_SMOKE_ORIGIN = `http://localhost:${port}`;
  server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--webpack", "--hostname", "localhost", "--port", String(port)], { cwd: directory, env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
  server.on("error", error => { serverLog += error.message; });
  for (const stream of [server.stdout, server.stderr]) stream.on("data", data => { serverLog = (serverLog + data).slice(-16000); });
  console.log("Starting isolated smoke application; the working localhost:3000 app is untouched.");
  let ready = false;
  const deadline = Date.now() + 180000;
  while (Date.now() < deadline && server.exitCode === null) {
    try {
      const response = await fetch(`${env.SEQFORGE_SMOKE_ORIGIN}/login`, { signal: AbortSignal.timeout(5000) });
      if (response.ok) { ready = true; break; }
    } catch { /* Wait for compilation. */ }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  assert.ok(ready, `Isolated server did not start. ${serverLog}`);
  await run(["node_modules/tsx/dist/cli.mjs", "scripts/smoke-ordering.ts"]);
} catch (error) {
  console.error(error);
  if (serverLog) console.error(serverLog);
  process.exitCode = 1;
} finally {
  if (server?.pid && server.exitCode === null) {
    if (process.platform === "win32") {
      try {
        await promisify(execFile)("taskkill", ["/PID", String(server.pid), "/T", "/F"], { windowsHide: true });
      } catch (error) {
        // taskkill can kill the server successfully but report a child that exited
        // before it was reached. Confirm the server is gone before accepting that race.
        let serverStillRunning = true;
        try { process.kill(server.pid, 0); } catch (checkError) {
          if (checkError.code === "ESRCH") serverStillRunning = false;
        }
        if (serverStillRunning) throw error;
      }
    } else {
      server.kill("SIGTERM");
      await new Promise(resolve => server.once("exit", resolve));
    }
  }
  try {
    assert.match(schema, /^seqforge_smoke_[a-f0-9]{32}$/);
    await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  } finally {
    await db.$disconnect();
    const relative = path.relative(path.resolve(tmpdir()), path.resolve(directory));
    assert.ok(!relative.startsWith("..") && !path.isAbsolute(relative) && relative.startsWith("seqforge-smoke-"));
    // Remove links first, so cleanup never traverses the real project dependencies.
    for (const entry of ["node_modules", "public"]) await rm(path.join(directory, entry), { force: true, recursive: true });
    await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
  }
  console.log("Isolated test database schema, uploaded results and application directory removed.");
}
