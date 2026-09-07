import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// Use Node directly so setup also works in Windows PowerShell without cp/touch.
const root = dirname(dirname(fileURLToPath(import.meta.url)));
process.chdir(root);

function run(relativeScript, args) {
  const result = spawnSync(process.execPath, [join(root, relativeScript), ...args], {
    cwd: root,
    env: process.env,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Setup stopped: ${args.join(" ")} failed. Review the output above.`);
  }
}

try {
  if (Number(process.versions.node.split(".")[0]) < 22) {
    throw new Error("Install Node.js 22 or later first. Node.js 22 is recommended for this demo.");
  }
  if (!existsSync(join(root, "node_modules/prisma/build/index.js"))) {
    throw new Error("Dependencies are missing. Run npm ci first.");
  }

  const envPath = join(root, ".env");
  if (!existsSync(envPath)) {
    const template = readFileSync(join(root, ".env.example"), "utf8");
    writeFileSync(
      envPath,
      template.replace("replace-with-at-least-32-random-characters", randomBytes(32).toString("hex")),
      { flag: "wx", mode: 0o600 },
    );
    console.log("Created .env with a new local authentication secret.");
  } else {
    console.log("Keeping your existing .env.");
  }
  process.loadEnvFile(envPath);

  if (process.env.NODE_ENV === "production" || process.env.DATABASE_URL !== "file:./dev.db") {
    throw new Error('This setup is for the local demo only. Use DATABASE_URL="file:./dev.db" and a non-production environment. Existing settings were not changed.');
  }
  if (!process.env.BETTER_AUTH_SECRET || process.env.BETTER_AUTH_SECRET.length < 32 || process.env.BETTER_AUTH_SECRET === "replace-with-at-least-32-random-characters") {
    throw new Error("Set BETTER_AUTH_SECRET in your existing .env to a random value of at least 32 characters, then rerun setup.");
  }
  if (process.env.BETTER_AUTH_URL !== "http://localhost:3000") {
    throw new Error('Use BETTER_AUTH_URL="http://localhost:3000" for this demo; authentication trusts that origin.');
  }

  mkdirSync(join(root, "prisma"), { recursive: true });
  mkdirSync(join(root, "storage/results"), { recursive: true });
  const databasePath = join(root, "prisma/dev.db");
  if (!existsSync(databasePath)) {
    writeFileSync(databasePath, "", { flag: "wx" });
  }

  run("node_modules/prisma/build/index.js", ["generate"]);
  run("node_modules/prisma/build/index.js", ["migrate", "deploy"]);
  run("node_modules/tsx/dist/cli.mjs", ["prisma/seed.ts"]);
  console.log("Local demo is ready. Run npm run dev, then open http://localhost:3000.");
  console.log("Demo account credentials are documented in README.md.");
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
