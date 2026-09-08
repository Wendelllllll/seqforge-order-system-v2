import assert from "node:assert/strict";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { createOrder } from "../src/lib/create-order";
import { blankOrder, blankReaction, orderSchema } from "../src/lib/order-intake";

test("migration preserves legacy orders and new orders persist samples and reactions atomically", async () => {
  const prefix = join(tmpdir(), "seqforge-intake-test-");
  const directory = mkdtempSync(prefix);
  const path = join(directory, "test.db");
  const sqlite = new DatabaseSync(path);
  const migration = (name: string) => readFileSync(join(process.cwd(), "prisma/migrations", name, "migration.sql"), "utf8");
  sqlite.exec(migration("20260904190152_init"));
  sqlite.exec(migration("20260904190347_add_account_issuer"));
  sqlite.exec(`
    INSERT INTO "User" (id,name,email,updatedAt,firstName,lastName,organization,labName) VALUES ('u1','Demo','u1@demo.local',CURRENT_TIMESTAMP,'Demo','User','Demo Org','Demo Lab');
    INSERT INTO "Order" (id,orderNumber,userId,orderName,updatedAt) VALUES ('old','SF-26080001','u1','Legacy',CURRENT_TIMESTAMP);
    INSERT INTO "Sample" (id,orderId,position,sampleName,templateType,concentration,primerName,primerSource,notes) VALUES ('s1','old',1,'Old clone','Plasmid DNA','100 ng/uL','M13F','SeqForge universal primer','Keep me');
    INSERT INTO "Result" (id,orderId,originalName,storedName,mimeType,size) VALUES ('r1','old','old.txt','old.txt','text/plain',4);
    INSERT INTO "StatusHistory" (id,orderId,status) VALUES ('h1','old','SUBMITTED');
  `);
  sqlite.exec(migration("20260908040000_customer_intake"));
  sqlite.close();
  const db = new PrismaClient({ datasourceUrl: `file:${path.replaceAll("\\", "/")}` });
  try {
    const legacy = await db.order.findUniqueOrThrow({ where: { id: "old" }, include: { samples: { include: { reactions: true } }, result: true, statusHistory: true } });
    assert.equal(legacy.intakeVersion, 1);
    assert.equal(legacy.samples[0].notes, "Keep me");
    assert.equal(legacy.samples[0].concentration, "100 ng/uL");
    assert.equal(legacy.samples[0].reactions[0].primerName, "M13F");
    assert.equal(legacy.result?.id, "r1"); assert.equal(legacy.statusHistory.length, 1);
    const draft = blankOrder();
    draft.orderName = "Plate sequencing";
    draft.container = "Plate";
    draft.priority = "Same day requested";
    Object.assign(draft.samples[0], { sampleName: "Clone", plateLabel: "P1", well: "a01", templateLength: "3200", concentration: "100" });
    Object.assign(draft.samples[0].reactions[0], { primerSource: "Stored at SeqForge", primerName: "Stored-R", storedPrimerReference: "DEMO-P123" });
    draft.samples[0].reactions.push({ ...blankReaction(), primerSource: "SeqForge synthesized primer", primerName: "Custom-F", primerSequence: "acgtacgtn", purification: "HPLC", synthesisScale: "100 nmol", modification5: "Requested modification", specialProtocol: "GC-rich" });
    const created = await createOrder(db, "u1", orderSchema.parse(draft));
    const saved = await db.order.findUniqueOrThrow({ where: { id: created.id }, include: { samples: { include: { reactions: { orderBy: { position: "asc" } } } }, statusHistory: true } });
    assert.equal(saved.intakeVersion, 2); assert.equal(saved.priority, draft.priority);
    assert.equal(saved.samples.length, 1); assert.equal(saved.samples[0].well, "A1");
    assert.equal(saved.samples[0].reactions.length, 2);
    assert.equal(saved.samples[0].reactions[0].storedPrimerReference, "DEMO-P123");
    assert.equal(saved.samples[0].reactions[1].primerSequence, "ACGTACGTN");
    assert.equal(saved.samples[0].reactions[1].modification5, "Requested modification");
    assert.equal(saved.statusHistory.length, 1);
    const second = await createOrder(db, "u1", orderSchema.parse(draft));
    assert.notEqual(second.orderNumber, created.orderNumber);
    const count = await db.order.count();
    await assert.rejects(createOrder(db, "missing-user", orderSchema.parse(draft)));
    assert.equal(await db.order.count(), count);
  } finally {
    await db.$disconnect();
    assert.ok(resolve(directory).startsWith(resolve(prefix)));
    rmSync(directory, { recursive: true, force: true });
  }
});
