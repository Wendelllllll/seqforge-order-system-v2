import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
process.chdir(root);
function run(script, args) {
  const result = spawnSync(process.execPath, [join(root, script), ...args], { cwd: root, env: process.env, stdio: "inherit" });
  if (result.error || result.status !== 0) throw new Error("Setup stopped. Review the command output above.");
}
try {
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (major < 22 || (major === 22 && minor < 13)) throw new Error("Use Node.js 22.13 or later; 22.23.2 is verified.");
  if (!existsSync("node_modules/prisma/build/index.js")) throw new Error("Run npm ci first.");
  if (!existsSync(".env")) {
    writeFileSync(".env", readFileSync(".env.example", "utf8").replace("replace-with-at-least-32-random-characters", randomBytes(32).toString("hex")), { flag: "wx", mode: 0o600 });
    console.log("Created .env. Configure its PostgreSQL DATABASE_URL before continuing.");
  }
  process.loadEnvFile(".env");
  const databaseUrl = process.env.DATABASE_URL || "";
  if (!/^postgres(?:ql)?:\/\//.test(databaseUrl) || databaseUrl.includes("replace-with-")) throw new Error("V3 requires a configured PostgreSQL DATABASE_URL. SQLite sources are imported separately and remain unchanged.");
  const appUrl = new URL(process.env.BETTER_AUTH_URL || "");
  if (appUrl.origin !== process.env.BETTER_AUTH_URL) throw new Error("BETTER_AUTH_URL must be an origin without a trailing slash.");
  if (!process.env.BETTER_AUTH_SECRET || process.env.BETTER_AUTH_SECRET.length < 32 || process.env.BETTER_AUTH_SECRET.startsWith("replace-with-")) throw new Error("Configure a random BETTER_AUTH_SECRET of at least 32 characters.");
  if (!["localhost", "127.0.0.1"].includes(appUrl.hostname) && appUrl.protocol !== "https:") throw new Error("Use HTTPS for the hosted application.");
  mkdirSync("storage/results", { recursive: true });
  run("node_modules/prisma/build/index.js", ["generate"]);
  run("node_modules/prisma/build/index.js", ["migrate", "deploy"]);
  const importIndex = process.argv.indexOf("--import-sqlite");
  if (importIndex !== -1) {
    const source = process.argv[importIndex + 1];
    if (!source || source.startsWith("--")) throw new Error("Provide the V2 SQLite path after --import-sqlite.");
    run("node_modules/tsx/dist/cli.mjs", ["scripts/import-sqlite.ts", source]);
  }
  if (process.argv.includes("--seed-demo")) {
    run("node_modules/tsx/dist/cli.mjs", ["prisma/seed.ts"]);
  }
  console.log("V3 PostgreSQL setup complete. No accounts are seeded unless --seed-demo is supplied.");
} catch (error) {
  console.error(error instanceof Error ? error.message.replace(/postgres(?:ql)?:\/\/[^\s]+/g, "[database URL]") : "Setup failed.");
  process.exitCode = 1;
}
