import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { dropboxSnapshot, type DropboxInput, type DropboxLocation } from "./dropboxes";

type Db = PrismaClient | Prisma.TransactionClient;
type Row = DropboxInput & { id: string; revision: number; updatedAt: Date };
const serialize = (row: Row): DropboxLocation => ({ ...row, updatedAt: row.updatedAt.toISOString() });
export class DropboxChanged extends Error {
  constructor(readonly location: DropboxLocation | null) { super(location?.active ? "This dropbox's details changed. Review and select it again before submitting." : "This dropbox is no longer available. Choose another location or delivery method."); }
}
export async function listDropboxes(db: Db, includeInactive = false): Promise<DropboxLocation[]> {
  const rows = await db.$queryRaw<Row[]>`SELECT "id", "name", "address", "placementInstructions", "pickupSchedule", "accessNotes", "latitude", "longitude", "active", "revision", "updatedAt" FROM "DropboxLocation" WHERE (${includeInactive} OR "active" = true) ORDER BY "name", "id"`;
  return rows.map(serialize);
}
export async function createDropbox(db: Db, data: DropboxInput) {
  const id = randomUUID();
  const rows = await db.$queryRaw<Row[]>`INSERT INTO "DropboxLocation" ("id", "name", "address", "placementInstructions", "pickupSchedule", "accessNotes", "latitude", "longitude", "active", "updatedAt") VALUES (${id}, ${data.name}, ${data.address}, ${data.placementInstructions}, ${data.pickupSchedule}, ${data.accessNotes}, ${data.latitude}, ${data.longitude}, ${data.active}, CURRENT_TIMESTAMP) RETURNING *`;
  return serialize(rows[0]);
}
export async function updateDropbox(db: Db, id: string, data: DropboxInput, expectedRevision: number) {
  const rows = await db.$queryRaw<Row[]>`UPDATE "DropboxLocation" SET "name"=${data.name}, "address"=${data.address}, "placementInstructions"=${data.placementInstructions}, "pickupSchedule"=${data.pickupSchedule}, "accessNotes"=${data.accessNotes}, "latitude"=${data.latitude}, "longitude"=${data.longitude}, "active"=${data.active}, "revision"="revision"+1, "updatedAt"=CURRENT_TIMESTAMP WHERE "id"=${id} AND "revision"=${expectedRevision} RETURNING *`;
  if (!rows.length) throw new DropboxChanged(null);
  return serialize(rows[0]);
}
export async function lockDropboxSnapshot(db: Prisma.TransactionClient, id: string, revision?: number) {
  const rows = await db.$queryRaw<Row[]>`SELECT * FROM "DropboxLocation" WHERE "id"=${id} FOR SHARE`;
  const location = rows[0] ? serialize(rows[0]) : null;
  if (!location?.active || location.revision !== revision) throw new DropboxChanged(location);
  return dropboxSnapshot(location);
}
