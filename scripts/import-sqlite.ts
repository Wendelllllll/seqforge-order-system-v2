import "dotenv/config";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { transferSqlite } from "./sqlite-transfer";

async function main() {
  const source = process.argv[2];
  if (!source) throw new Error("Usage: npm run db:import-sqlite -- <path-to-V2-SQLite-file> [result-directory]");
  if (!/^postgres(?:ql)?:\/\//.test(process.env.DATABASE_URL || "")) throw new Error("Configure DATABASE_URL for the empty PostgreSQL target first.");
  const db = new PrismaClient();
  try {
    console.log("Importing V2 data into PostgreSQL. Source is read-only; prices are not backfilled.");
    console.log(await transferSqlite(db, resolve(source), resolve(process.argv[3] || "storage/results")));
    console.log("Transfer and row-count checks succeeded. Keep the SQLite backup and result files.");
  } finally { await db.$disconnect(); }
}
main().catch((error) => { console.error(error instanceof Error ? error.message.replace(/postgres(?:ql)?:\/\/[^\s]+/g, "[database URL]") : "Import failed."); process.exitCode = 1; });
