import { DatabaseSync } from "node:sqlite";
import { existsSync } from "node:fs";
import path from "node:path";
import type { PrismaClient } from "@prisma/client";

export const TABLES = ["User", "Account", "Session", "Verification", "Order", "Sample", "Reaction", "Result", "StatusHistory"] as const;
const DATE_FIELDS = new Set(["createdAt", "updatedAt", "expiresAt", "accessTokenExpiresAt", "refreshTokenExpiresAt", "completedAt", "uploadedAt"]);

export async function transferSqlite(db: PrismaClient, sourcePath: string, resultsDirectory: string) {
  if (!existsSync(sourcePath)) throw new Error("Source SQLite file does not exist.");
  const source = new DatabaseSync(sourcePath, { readOnly: true });
  const data: Record<string, Record<string, unknown>[]> = {};
  try {
    source.exec("BEGIN");
    for (const table of TABLES) {
      data[table] = source.prepare(`SELECT * FROM "${table}"`).all().map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => {
        if (value !== null && DATE_FIELDS.has(key)) {
          const text = String(value);
          const date = new Date(typeof value === "number" || /^\d+$/.test(text) ? Number(value) : /(?:Z|[+-]\d\d:\d\d)$/.test(text) ? text : text.replace(" ", "T") + "Z");
          if (Number.isNaN(date.getTime())) throw new Error(`Invalid date in ${table}.${key}.`);
          return [key, date];
        }
        return [key, key === "emailVerified" ? Boolean(value) : value];
      })));
    }
    source.exec("COMMIT");
  } finally { source.close(); }
  for (const result of data.Result) {
    const name = String(result.storedName);
    if (path.basename(name) !== name || !existsSync(path.join(resultsDirectory, name))) throw new Error("A referenced result file is missing or has an invalid storage name. Copy the result directory before importing.");
  }
  return db.$transaction(async (tx) => {
    // Keep accidental concurrent imports or writes out during this one-time transfer.
    await tx.$executeRawUnsafe('LOCK TABLE "User", "Account", "Session", "Verification", "Order", "Sample", "Reaction", "Result", "StatusHistory", "OrderCounter" IN ACCESS EXCLUSIVE MODE');
    for (const table of [...TABLES, "OrderCounter"]) {
      const rows = await tx.$queryRawUnsafe<{ count: bigint }[]>(`SELECT count(*) FROM "${table}"`);
      if (Number(rows[0].count) !== 0) throw new Error("Import requires an empty PostgreSQL target. Existing data was not changed.");
    }
    for (const table of TABLES) {
      for (const row of data[table]) {
        const columns = Object.keys(row);
        if (columns.some((column) => !/^[a-zA-Z][a-zA-Z0-9]*$/.test(column))) throw new Error("Unexpected source column.");
        const placeholders = columns.map((_, i) => `$${i + 1}`).join(",");
        await tx.$executeRawUnsafe(`INSERT INTO "${table}" (${columns.map((column) => `"${column}"`).join(",")}) VALUES (${placeholders})`, ...Object.values(row));
      }
      const rows = await tx.$queryRawUnsafe<{ count: bigint }[]>(`SELECT count(*) FROM "${table}"`);
      if (Number(rows[0].count) !== data[table].length) throw new Error(`Row count mismatch for ${table}.`);
    }
    const counters = new Map<string, number>();
    for (const order of data.Order) {
      const match = String(order.orderNumber).match(/^(SF-\d{4})(\d+)$/);
      if (match) counters.set(match[1], Math.max(counters.get(match[1]) || 0, Number(match[2])));
    }
    for (const [month, value] of counters) await tx.orderCounter.create({ data: { month, value } });
    return Object.fromEntries(TABLES.map((table) => [table, data[table].length]));
  }, { maxWait: 10_000, timeout: 120_000 });
}
