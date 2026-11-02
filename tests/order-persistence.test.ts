import assert from "node:assert/strict";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import "dotenv/config";
import { transferSqlite } from "../scripts/sqlite-transfer";
import { AccountChanged, createOrder, SubmissionConflict } from "../src/lib/create-order";
import { blankOrder, blankReaction, orderSchema } from "../src/lib/order-intake";
import { newPlasmidSample } from "../src/lib/whole-plasmid";
import { getRateSchedule, updateRateSchedule, PriceChanged } from "../src/lib/pricing-store";
import { DEFAULT_OLIGO_PRICING, type AddOn } from "../src/lib/rate-schedule";
import { pricingSchema } from "../src/lib/pricing";
import { pricingRecord } from "../src/lib/pricing-record";
import { orderFilterWhere, parseOrderFilters } from "../src/lib/admin-order-filters";
import { CustomerNotFound, CustomerPriceChanged, getCustomerPricing, getEffectiveRateSchedule, updateCustomerPricing } from "../src/lib/customer-pricing-store";

test("migration preserves legacy orders and new orders persist samples and reactions atomically", async (t) => {
  const prefix = join(tmpdir(), "seqforge-intake-test-");
  const directory = mkdtempSync(prefix);
  const path = join(directory, "test.db");
  const sqlite = new DatabaseSync(path);
  const migration = (name: string) => readFileSync(join(process.cwd(), "prisma/legacy-sqlite/migrations", name, "migration.sql"), "utf8");
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
  writeFileSync(join(directory, "old.txt"), "test");
  const schema = "seqforge_test_" + randomUUID().replaceAll("-", "");
  const url = new URL(process.env.DATABASE_URL!);
  assert.ok(["localhost", "127.0.0.1"].includes(url.hostname), "Persistence tests require local PostgreSQL");
  url.searchParams.set("schema", schema);
  const db = new PrismaClient({ datasourceUrl: url.toString() });
  execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], { env: { ...process.env, DATABASE_URL: url.toString() }, stdio: "pipe" });
  try {
    await transferSqlite(db, path, directory);
    await assert.rejects(transferSqlite(db, path, directory), /empty PostgreSQL/);
    const legacy = await db.order.findUniqueOrThrow({ where: { id: "old" }, include: { samples: { include: { reactions: true } }, result: true, statusHistory: true } });
    assert.equal(legacy.intakeVersion, 1);
    assert.equal(legacy.samples[0].notes, "Keep me");
    assert.equal(legacy.samples[0].concentration, "100 ng/uL");
    assert.equal(legacy.samples[0].reactions[0].primerName, "M13F");
    assert.equal(legacy.result?.id, "r1"); assert.equal(legacy.statusHistory.length, 1);
    const draft = blankOrder();
  draft.fulfillment = { deliveryMethod: "Pickup", pickupLocation: "Demo institute, building A, room 101", pickupInstructions: "Reception", contactName: "Demo Scientist", contactPhone: "555-0100", piName: "Demo PI", billingOrganization: "Demo University", billingContactName: "Demo Finance", billingEmail: "finance@demo.local", billingAddress: "1 Demo Way, Demo City", paymentMethod: "Invoice" };
    draft.sharedResultEmails = ["colleague@demo.local", "colleague@demo.local"];
    draft.orderName = "Plate sequencing";
    draft.container = "Plate";
    draft.priority = "Same day requested";
    Object.assign(draft.samples[0], { sampleName: "Clone", plateLabel: "P1", well: "a01", templateLength: "3200", concentration: "100" });
    Object.assign(draft.samples[0].reactions[0], { primerSource: "Stored at SeqForge", primerName: "Stored-R", storedPrimerReference: "DEMO-P123" });
    draft.samples[0].reactions.push({ ...blankReaction(), primerSource: "Customer supplied", primerName: "Custom-F", primerConcentration: "10", specialProtocol: "GC-rich" });
    const created = await createOrder(db, "u1", orderSchema.parse(draft));
    const saved = await db.order.findUniqueOrThrow({ where: { id: created.id }, include: { samples: { include: { reactions: { orderBy: { position: "asc" } } } }, statusHistory: true } });
    assert.equal(saved.intakeVersion, 4); assert.equal(saved.priority, draft.priority);
    assert.equal(saved.samples.length, 1); assert.equal(saved.samples[0].well, "A1");
    assert.equal(saved.samples[0].reactions.length, 2);
    assert.equal(saved.samples[0].reactions[0].storedPrimerReference, "DEMO-P123");
    assert.equal(saved.samples[0].reactions[1].primerConcentration, "10");
    assert.equal(saved.samples[0].reactions[1].specialProtocol, "GC-rich");
    assert.equal(saved.statusHistory.length, 1);
    assert.equal((saved.pricingSnapshot as { subtotalCents: number }).subtotalCents, 900);
    assert.equal(legacy.pricingSnapshot, null);
    const concurrent = await Promise.all(Array.from({ length: 30 }, (_, i) => createOrder(db, "u1", orderSchema.parse({ ...draft, orderName: `Concurrent ${i}` }))));
    assert.equal(new Set(concurrent.map((o) => o.orderNumber)).size, 30);
    const key = randomUUID();
    const retried = await Promise.all(Array.from({ length: 8 }, () => createOrder(db, "u1", orderSchema.parse({ ...draft, orderName: "Retried" }), key)));
    assert.equal(new Set(retried.map((o) => o.id)).size, 1);
    await assert.rejects(createOrder(db, "u1", orderSchema.parse({ ...draft, orderName: "Changed" }), key), SubmissionConflict);
    await createOrder(db, "u1", orderSchema.parse({ ...draft, orderName: "  PLATE   sequencing  " }));
    await createOrder(db, "u1", orderSchema.parse({ ...draft, orderName: "legacy" }));
    const raced = await Promise.allSettled(Array.from({ length: 8 }, () => createOrder(db, "u1", orderSchema.parse({ ...draft, orderName: "Same-name race" }))));
    assert.equal(raced.filter((r) => r.status === "fulfilled").length, 8);
    assert.equal(raced.filter((r) => r.status === "rejected").length, 0);
    const unnamed = await Promise.all(["", "   "].map(orderName => createOrder(db, "u1", orderSchema.parse({ ...draft, orderName }))));
    assert.notEqual(unnamed[0].orderNumber, unnamed[1].orderNumber);
    for (const order of unnamed) assert.equal((await db.order.findUniqueOrThrow({ where: { id: order.id } })).orderName, "Untitled order");
    await db.user.create({ data: { id: "u2", email: "u2@demo.local", name: "Other", firstName: "Other", lastName: "User", organization: "Other", labName: "Other" } });
    await createOrder(db, "u2", orderSchema.parse(draft));
    await db.user.update({ where: { id: "u1" }, data: { orderDefaults: { ...draft.fulfillment, pickupLocation: "Changed" } } });
    assert.deepEqual((await db.order.findUniqueOrThrow({ where: { id: created.id } })).fulfillmentSnapshot, { ...draft.fulfillment, sharedResultEmails: ["colleague@demo.local"] });
    const second = await createOrder(db, "u1", orderSchema.parse({ ...draft, orderName: "Second" }));
    assert.notEqual(second.orderNumber, created.orderNumber);
    const count = await db.order.count();
    await assert.rejects(createOrder(db, "missing-user", orderSchema.parse(draft)));
    assert.equal(await db.order.count(), count);
    const plasmid = orderSchema.parse({ ...draft, service: "WHOLE_PLASMID", submissionMode: "Whole plasmid", orderName: "Whole plasmid persistence", samples: [{ ...newPlasmidSample([], "Plate"), sampleName: "Entire plasmid", notes: "Preserve this" }] });
    const plasmidKey = randomUUID();
    const plasmidCreated = await createOrder(db, "u1", plasmid, plasmidKey);
    assert.equal((await createOrder(db, "u1", plasmid, plasmidKey)).id, plasmidCreated.id);
    const plasmidSaved = await db.order.findUniqueOrThrow({ where: { id: plasmidCreated.id }, include: { samples: { include: { reactions: true } } } });
    assert.equal(plasmidSaved.service, "WHOLE_PLASMID");
    assert.equal(plasmidSaved.samples[0].notes, "Preserve this");
    assert.equal(plasmidSaved.samples[0].reactions.length, 0);
    assert.equal(plasmidSaved.samples[0].primerName, "");
    assert.equal((plasmidSaved.pricingSnapshot as { subtotalCents: number }).subtotalCents, 500);
    const oligo = orderSchema.parse({ ...draft, service: "OLIGO", submissionMode: "Oligo modified", container: "Tubes", orderName: "Oligo quote request", samples: [], oligos: [{ name: "Modified-F", sequence: "acgt acgt", synthesisScale: "100 nmol", purification: "HPLC", modification5: "Phosphate", modification3: "", modificationInternal: "", notes: "Confirm feasibility" }], oligoShippingAddress: "123 Science Way, San Diego CA 92101 USA", oligoFormat: "Dry" });
    const oligoKey = randomUUID();
    const oligoCreated = await createOrder(db, "u1", oligo, oligoKey, (await getRateSchedule(db)).revision);
    const oligoSaved = await db.order.findUniqueOrThrow({ where: { id: oligoCreated.id }, include: { samples: true } });
    assert.equal(oligoSaved.service, "OLIGO");
    assert.equal(oligoSaved.samples.length, 0);
    assert.deepEqual(oligoSaved.oligoSnapshot, { items: oligo.oligos, shippingAddress: oligo.oligoShippingAddress, format: "Dry", searchNames: "Modified-F" });
    assert.equal((oligoSaved.pricingSnapshot as { subtotalCents: number | null }).subtotalCents, null);
    assert.equal((oligoSaved.pricingSnapshot as { pendingQuote: boolean }).pendingQuote, true);
    assert.equal((oligoSaved.pricingSnapshot as { quoteApprovalRequired: boolean }).quoteApprovalRequired, true);
    const oligoMatches = await db.order.findMany({ where: orderFilterWhere(parseOrderFilters({ service: "OLIGO", q: "modified-f" })), select: { id: true } });
    assert.deepEqual(oligoMatches, [{ id: oligoSaved.id }]);
    assert.equal((await createOrder(db, "u1", oligo, oligoKey)).id, oligoSaved.id);
    await assert.rejects(createOrder(db, "u1", { ...oligo, oligoShippingAddress: "Changed" }, oligoKey), SubmissionConflict);
    const standardOligo = orderSchema.parse({ ...oligo, submissionMode: "Oligo standard", oligos: [{ ...oligo.oligos![0], sequence: "acgt acgt acgt acgt acgt", synthesisScale: "25 nmol", purification: "Desalted", modification5: "" }] });
    const standardOligoKey = randomUUID();
    const standardOligoCreated = await createOrder(db, "u1", standardOligo, standardOligoKey);
    const standardOligoSaved = await db.order.findUniqueOrThrow({ where: { id: standardOligoCreated.id } });
    assert.equal((standardOligoSaved.pricingSnapshot as { subtotalCents: number }).subtotalCents, 500);
    assert.equal((standardOligoSaved.pricingSnapshot as { pendingQuote: boolean }).pendingQuote, false);
    assert.equal((standardOligoSaved.pricingSnapshot as { quoteApprovalRequired: boolean }).quoteApprovalRequired, true);
    assert.equal((standardOligoSaved.pricingSnapshot as { unit: string }).unit, "base");
    assert.equal((await createOrder(db, "u1", standardOligo, standardOligoKey)).id, standardOligoCreated.id);
    const initial = { ...await getRateSchedule(db), oligo: DEFAULT_OLIGO_PRICING };
    const updated = await updateRateSchedule(db, { id: "test-admin", name: "Test Admin" }, { ...initial, rates: { ...initial.rates, "plasmid-plate": 650 }, reason: "Test rate change" });
    assert.equal(updated.revision, initial.revision + 1);
    assert.equal(await db.pricingChange.count(), 2);
    await assert.rejects(updateRateSchedule(db, { id: "test-admin", name: "Test Admin" }, { ...initial, reason: "Stale update" }), PriceChanged);
    const beforeStale = await db.order.count();
    await assert.rejects(createOrder(db, "u1", plasmid, randomUUID(), initial.revision), PriceChanged);
    assert.equal(await db.order.count(), beforeStale);
    const repriced = await createOrder(db, "u1", plasmid, randomUUID(), updated.revision);
    assert.equal(((await db.order.findUniqueOrThrow({ where: { id: repriced.id } })).pricingSnapshot as { subtotalCents: number }).subtotalCents, 650);
    assert.deepEqual((await db.order.findUniqueOrThrow({ where: { id: plasmidSaved.id } })).pricingSnapshot, plasmidSaved.pricingSnapshot);
    assert.deepEqual((await db.order.findUniqueOrThrow({ where: { id: standardOligoSaved.id } })).pricingSnapshot, standardOligoSaved.pricingSnapshot);
    assert.deepEqual((await db.order.findUniqueOrThrow({ where: { id: oligoSaved.id } })).pricingSnapshot, oligoSaved.pricingSnapshot);
    assert.equal((await createOrder(db, "u1", plasmid, plasmidKey, initial.revision)).id, plasmidCreated.id);
    const largePlasmid = orderSchema.parse({ ...plasmid, samples: [{ ...plasmid.samples[0], templateLength: "12001" }] });
    const largeCreated = await createOrder(db, "u1", largePlasmid, randomUUID(), updated.revision);
    assert.equal(((await db.order.findUniqueOrThrow({ where: { id: largeCreated.id } })).pricingSnapshot as { subtotalCents: number }).subtotalCents, 1500);

    const actor = { id: "test-admin", name: "Test Admin" };
    assert.deepEqual(await getCustomerPricing(db, "u1"), { customerId: "u1", revision: 0, overrides: {}, oligoOverrides: {}, addOnOverrides: {} });
    await db.user.create({ data: { id: "admin", name: "Admin", email: "admin@demo.local", role: "admin", firstName: "Test", lastName: "Admin", organization: "Test", labName: "Test" } });
    for (const customerId of ["missing-user", "admin"]) {
      await assert.rejects(updateCustomerPricing(db, actor, customerId, { revision: 0, overrides: { "plasmid-plate": 400 }, reason: "Invalid target" }), CustomerNotFound);
    }
    const custom = await updateCustomerPricing(db, actor, "u1", { revision: 0, overrides: { "plasmid-plate": 400 }, reason: "Agreed lab price" });
    assert.equal(custom.revision, 1);
    assert.deepEqual(await updateCustomerPricing(db, actor, "u1", { revision: 1, overrides: custom.overrides, reason: "No changes" }), custom);
    assert.equal(await db.customerPricingChange.count(), 1);
    await assert.rejects(updateCustomerPricing(db, actor, "u1", { revision: 0, overrides: {}, reason: "Stale edit" }), error => error instanceof CustomerPriceChanged && error.current.revision === 1);
    const audit = await db.customerPricingChange.findFirstOrThrow();
    assert.equal(audit.actorId, actor.id); assert.equal(audit.actorName, actor.name); assert.equal(audit.reason, "Agreed lab price");
    assert.deepEqual(audit.previousOverrides, { format: 2, overrides: {}, oligoOverrides: {}, addOnOverrides: {} });
    assert.deepEqual(audit.overrides, { format: 2, overrides: { "plasmid-plate": 400 }, oligoOverrides: {}, addOnOverrides: {} });
    assert.equal((await getEffectiveRateSchedule(db, "u2")).rates["plasmid-plate"], 650);
    assert.equal((await getEffectiveRateSchedule(db, "u1")).rates["plasmid-large-plate"], 1500);
    const customOrderCount = await db.order.count();
    await assert.rejects(createOrder(db, "u1", plasmid, randomUUID(), updated.revision, 0), error => error instanceof PriceChanged && error.schedule.customerRevision === 1 && error.schedule.rates["plasmid-plate"] === 400);
    await assert.rejects(createOrder(db, "u1", plasmid, randomUUID(), updated.revision, 1, "u2"), AccountChanged);
    assert.equal(await db.order.count(), customOrderCount);
    const customKey = randomUUID();
    const customOrder = await createOrder(db, "u1", plasmid, customKey, updated.revision, 1, "u1");
    const customSaved = await db.order.findUniqueOrThrow({ where: { id: customOrder.id } });
    assert.equal((customSaved.pricingSnapshot as { subtotalCents: number }).subtotalCents, 400);
    assert.equal((customSaved.pricingSnapshot as { customerPricingRevision: number }).customerPricingRevision, 1);
    assert.equal((customSaved.pricingSnapshot as { lines: { customPrice: boolean }[] }).lines[0].customPrice, true);
    const otherCustomerOrder = await createOrder(db, "u2", plasmid, randomUUID(), updated.revision, 0, "u2");
    assert.equal(((await db.order.findUniqueOrThrow({ where: { id: otherCustomerOrder.id } })).pricingSnapshot as { subtotalCents: number }).subtotalCents, 650);
    const nextGlobal = await updateRateSchedule(db, actor, { ...updated, rates: { ...updated.rates, "plasmid-plate": 700, "plasmid-large-plate": 1600 }, reason: "Global update after custom pricing" });
    const inherited = await getEffectiveRateSchedule(db, "u1");
    assert.equal(inherited.rates["plasmid-plate"], 400); assert.equal(inherited.rates["plasmid-large-plate"], 1600);
    await assert.rejects(createOrder(db, "u1", plasmid, randomUUID(), updated.revision, 1), PriceChanged);
    const reset = await updateCustomerPricing(db, actor, "u1", { revision: 1, overrides: {}, reason: "Restore standard prices" });
    assert.equal(reset.revision, 2); assert.deepEqual(reset.overrides, {});
    assert.equal((await getEffectiveRateSchedule(db, "u1")).rates["plasmid-plate"], 700);
    assert.equal((await db.customerPricing.findUniqueOrThrow({ where: { userId: "u1" } })).revision, 2);
    assert.equal((await createOrder(db, "u1", plasmid, customKey, updated.revision, 0)).id, customOrder.id);
    assert.deepEqual((await db.order.findUniqueOrThrow({ where: { id: customOrder.id } })).pricingSnapshot, customSaved.pricingSnapshot);
    assert.equal((await createOrder(db, "u1", oligo, oligoKey, 99999, 99999)).id, oligoCreated.id);
    await assert.rejects(createOrder(db, "u1", oligo, randomUUID(), 99999, 99999), PriceChanged);
    const newOligo = await createOrder(db, "u1", oligo, randomUUID(), nextGlobal.revision, 2, "u1");
    assert.equal(((await db.order.findUniqueOrThrow({ where: { id: newOligo.id } })).pricingSnapshot as { pendingQuote: boolean }).pendingQuote, true);

    // A racing price edit and order either preserve the reviewed snapshot or require re-review.
    const race = await Promise.allSettled([
      createOrder(db, "u1", plasmid, randomUUID(), nextGlobal.revision, 2, "u1"),
      updateCustomerPricing(db, actor, "u1", { revision: 2, overrides: { "plasmid-plate": 300 }, reason: "Concurrent edit" }),
    ]);
    assert.equal(race[1].status, "fulfilled");
    if (race[0].status === "fulfilled") {
      const raceOrder = await db.order.findUniqueOrThrow({ where: { id: (race[0].value as { id: string }).id } });
      assert.equal((raceOrder.pricingSnapshot as { subtotalCents: number }).subtotalCents, 700);
      assert.equal((raceOrder.pricingSnapshot as { customerPricingRevision: number }).customerPricingRevision, 2);
    } else assert.ok(race[0].reason instanceof PriceChanged);
    assert.equal((await getCustomerPricing(db, "u1")).revision, 3);
    assert.equal(await db.customerPricingChange.count({ where: { customerId: "u1" } }), 3);

    // A failed audit write must roll back the rate row as well.
    await db.customerPricingChange.create({ data: { customerId: "u2", revision: 1, actorId: actor.id, actorName: actor.name, reason: "Audit collision fixture", previousOverrides: {}, overrides: {} } });
    await assert.rejects(updateCustomerPricing(db, actor, "u2", { revision: 0, overrides: { "plasmid-plate": 100 }, reason: "Must roll back" }));
    assert.deepEqual(await getCustomerPricing(db, "u2"), { customerId: "u2", revision: 0, overrides: {}, oligoOverrides: {}, addOnOverrides: {} });
    await db.customerPricingChange.deleteMany({ where: { customerId: "u2" } });

    // Replay this one additive migration against a populated legacy schedule in the disposable schema.
    const oldRates = Object.fromEntries(Object.entries(updated.rates).filter(([key]) => !key.startsWith("plasmid-large-")));
    oldRates["sanger-ready-plate"] = 300;
    const snapshots = await db.order.findMany({ select: { id: true, pricingSnapshot: true }, orderBy: { id: "asc" } });
    await db.pricingChange.delete({ where: { id: "migration-whole-plasmid-size-pricing" } });
    await db.pricingSchedule.update({ where: { id: "active" }, data: { revision: 10, rates: oldRates } });
    const tierMigration = readFileSync(join(process.cwd(), "prisma/migrations/20261014220000_whole_plasmid_size_pricing/migration.sql"), "utf8");
    await db.$executeRawUnsafe(tierMigration);
    const migrated = await getRateSchedule(db);
    assert.equal(migrated.revision, 11);
    for (const [key, value] of Object.entries(oldRates)) assert.equal(migrated.rates[key as keyof typeof migrated.rates], value);
    assert.equal(migrated.rates["plasmid-large-tubes"], 1500);
    assert.equal(migrated.rates["plasmid-large-plate"], 1500);
    assert.deepEqual(await db.order.findMany({ select: { id: true, pricingSnapshot: true }, orderBy: { id: "asc" } }), snapshots);
    const change = await db.pricingChange.findUniqueOrThrow({ where: { revision: 11 } });
    assert.deepEqual(change.previousRates, oldRates);
    assert.deepEqual(change.rates, migrated.rates);
    await db.$executeRawUnsafe(tierMigration);
    assert.equal((await getRateSchedule(db)).revision, 11);
    await assert.rejects(createOrder(db, "u1", largePlasmid, randomUUID(), 10), PriceChanged);
    // Catalog choices survive in the immutable price snapshot without leaking
    // client-only addOnIds into Prisma Sample or Reaction columns.
    const addOns: AddOn[] = [
      { id: "pcr-cleanup", name: "PCR cleanup", service: "SANGER", scope: "sample", unitCents: 200, active: true, trigger: "PCR cleanup requested" },
      { id: "gc-rich", name: "GC-rich sequencing", service: "SANGER", scope: "reaction", unitCents: 125, active: true, trigger: "GC-rich" },
      { id: "handling", name: "Special handling", service: "SANGER", scope: "order", unitCents: 100, active: true },
    ];
    // Catalog definitions are developer-provisioned, never added through the
    // administrator price API. Only this test's disposable schema is writable.
    assert.match(schema, /^seqforge_test_[a-f0-9]{32}$/);
    const [actual] = await db.$queryRaw<{ schema: string }[]>`SELECT current_schema() AS schema`;
    assert.equal(actual.schema, schema);
    const fixtureAddOns = [...migrated.addOns ?? [], { ...addOns[2], active: false, unitCents: null }];
    await db.pricingSchedule.update({ where: { id: "active" }, data: { rates: pricingRecord({ ...migrated, addOns: fixtureAddOns }) } });
    const pricedAddOns = fixtureAddOns.map(item => addOns.find(value => value.id === item.id) ?? item);
    const extrasSchedule = await updateRateSchedule(db, actor, { ...migrated, oligo: DEFAULT_OLIGO_PRICING, addOns: pricedAddOns, reason: "Isolated extra-service persistence check" });
    const extrasDraft = orderSchema.parse({ ...draft, priority: "Standard", addOnIds: ["handling"], samples: [{ ...draft.samples[0], templateType: "PCR product", preparation: "PCR cleanup requested", addOnIds: ["pcr-cleanup"], reactions: [{ ...blankReaction(), primerSource: "Customer supplied", primerName: "PCR-F", specialProtocol: "GC-rich", addOnIds: ["gc-rich"] }] }] });
    const extrasCreated = await createOrder(db, "u1", extrasDraft, randomUUID(), extrasSchedule.revision, 3, "u1");
    const extrasSaved = await db.order.findUniqueOrThrow({ where: { id: extrasCreated.id }, include: { samples: { include: { reactions: true } } } });
    const extraPrice = pricingSchema.parse(extrasSaved.pricingSnapshot);
    assert.equal(extraPrice.lines.filter(line => line.addOnId).length, 3);
    for (const line of extraPrice.lines.filter(line => line.addOnId)) assert.equal(line.quantity, 1, "Automatic and explicit choices charge only once");
    assert.ok(extraPrice.lines.find(line => line.addOnId === "gc-rich")?.targets?.[0].includes("PCR-F"));
    assert.equal("addOnIds" in extrasSaved.samples[0], false);
    assert.equal("addOnIds" in extrasSaved.samples[0].reactions[0], false);

    // Preview queues persist mail content in this disposable schema without
    // reading SMTP credentials or sending anything, regardless of local config.
    const previewMailEnvironment = {
      CUSTOMER_MAIL_MODE: "preview", CUSTOMER_MAIL_FROM: "notifications@example.invalid",
      INTERNAL_MAIL_MODE: "preview", INTERNAL_MAIL_FROM: "notifications@example.invalid", INTERNAL_MAIL_TO: "staff@example.invalid",
    };
    const previousMailEnvironment = Object.fromEntries(Object.keys(previewMailEnvironment).map(key => [key, process.env[key]]));
    t.after(() => {
      for (const [key, value] of Object.entries(previousMailEnvironment)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    });
    Object.assign(process.env, previewMailEnvironment);
    const bulk = orderSchema.parse({ ...extrasDraft, orderName: "Eight plates with two reactions per sample", samples: Array.from({ length: 768 }, (_, index) => ({
      ...extrasDraft.samples[0], sampleKey: `B${index + 1}`, sampleName: `Bulk-DNA-${index + 1}`, plateLabel: `Bulk-Plate-${Math.floor(index / 96) + 1}`,
      well: `${"ABCDEFGH"[index % 8]}${Math.floor((index % 96) / 8) + 1}`,
      reactions: ["Forward", "Reverse"].map(primerName => ({ ...extrasDraft.samples[0].reactions[0], primerName })),
    })) });
    const bulkKey = randomUUID();
    const bulkStarted = performance.now();
    const bulkCreated = await createOrder(db, "u1", bulk, bulkKey, extrasSchedule.revision, 3, "u1");
    t.diagnostic(`Isolated 768-sample / 1536-reaction bulk submission: ${Math.round(performance.now() - bulkStarted)} ms`);
    const bulkSaved = await db.order.findUniqueOrThrow({ where: { id: bulkCreated.id }, include: { samples: { orderBy: { position: "asc" }, include: { reactions: { orderBy: { position: "asc" } } } }, statusHistory: true } });
    assert.match(bulkSaved.orderNumber, /^SF-\d{8,}$/);
    assert.equal(bulkSaved.samples.length, 768);
    assert.equal(new Set(bulkSaved.samples.map(sample => sample.plateLabel)).size, 8);
    assert.equal(bulkSaved.samples.reduce((total, sample) => total + sample.reactions.length, 0), 1536);
    assert.equal(bulkSaved.statusHistory.length, 1);
    for (const [index, sample] of bulkSaved.samples.entries()) {
      assert.equal(sample.sampleKey, bulk.samples[index].sampleKey); assert.equal(sample.sampleName, bulk.samples[index].sampleName);
      assert.equal(sample.plateLabel, bulk.samples[index].plateLabel); assert.equal(sample.well, bulk.samples[index].well);
      assert.equal(sample.position, index + 1);
      assert.deepEqual(sample.reactions.map(reaction => [reaction.position, reaction.primerName, reaction.specialProtocol]), [[1, "Forward", "GC-rich"], [2, "Reverse", "GC-rich"]]);
    }
    const bulkPrice = pricingSchema.parse(bulkSaved.pricingSnapshot);
    assert.equal(bulkPrice.subtotalCents, 1536 * extrasSchedule.rates["sanger-standard-plate"] + 768 * 200 + 1536 * 125 + 100);
    assert.equal(bulkPrice.lines.find(line => line.addOnId === "gc-rich")?.targets?.length, 1536);
    const bulkRetries = await Promise.all(Array.from({ length: 4 }, () => createOrder(db, "u1", bulk, bulkKey, 1, 0, "u1")));
    assert.ok(bulkRetries.every(order => order.id === bulkCreated.id && order.orderNumber === bulkCreated.orderNumber));
    assert.equal(await db.order.count({ where: { userId: "u1", submissionKey: bulkKey } }), 1);
    for (const messages of await Promise.all([
      db.customerNotification.findMany({ where: { eventKey: `order:${bulkCreated.id}` } }),
      db.internalNotification.findMany({ where: { eventKey: `order:${bulkCreated.id}` } }),
    ])) {
      assert.equal(messages.length, 1);
      assert.equal(messages[0].status, "PREVIEW");
      assert.ok(messages[0].bodyText.includes("1536 reactions. See the order link"));
      assert.ok(!messages[0].bodyText.includes("Bulk-DNA-768"), "Large mail summaries link to complete details instead of expanding every target");
    }

    // Force the final reaction batch to fail after earlier sample/reaction
    // batches have been inserted. The public API rejects null before this
    // point; this fixture verifies transaction rollback on a database failure.
    const invalidBulk = structuredClone(bulk);
    invalidBulk.samples[767].reactions[1].primerName = null as unknown as string;
    const failedKey = randomUUID();
    const counts = async () => Promise.all([db.order.count(), db.sample.count(), db.reaction.count(), db.statusHistory.count(), db.customerNotification.count(), db.internalNotification.count()]);
    const beforeFailure = await counts();
    const countersBeforeFailure = await db.orderCounter.findMany({ orderBy: { month: "asc" } });
    await assert.rejects(createOrder(db, "u1", invalidBulk, failedKey, extrasSchedule.revision, 3, "u1"));
    assert.deepEqual(await counts(), beforeFailure);
    assert.deepEqual(await db.orderCounter.findMany({ orderBy: { month: "asc" } }), countersBeforeFailure);
    assert.equal(await db.order.count({ where: { orderNumber: { startsWith: "pending-" } } }), 0);
    assert.equal(await db.order.findUnique({ where: { userId_submissionKey: { userId: "u1", submissionKey: failedKey } } }), null);
  } finally {
    assert.match(schema, /^seqforge_test_[a-f0-9]{32}$/);
    await db.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    await db.$disconnect();
    assert.ok(resolve(directory).startsWith(resolve(prefix)));
    rmSync(directory, { recursive: true, force: true });
  }
});
