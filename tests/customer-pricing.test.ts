import assert from "node:assert/strict";
import { test } from "node:test";
import { composeCustomerRates, customerPriceUpdateSchema, customerPricingRecord, customerPricingSchema, readCustomerPricingRecord, sameCustomerOverrides, sameCustomerPricing } from "../src/lib/customer-pricing";
import { ACTIVE_RATE_ITEMS, DEFAULT_SCHEDULE, RATE_ITEMS, priceUpdateSchema, type AddOn, type RateSchedule } from "../src/lib/rate-schedule";
import { blankOrder } from "../src/lib/order-intake";
import { priceOrder } from "../src/lib/pricing";
import type { PrismaClient } from "@prisma/client";
import { CustomerDefaultsChanged, CustomerPriceChanged, getCustomerPricing, getEffectiveRateSchedule, InvalidCustomerPriceUpdate, updateCustomerPricing } from "../src/lib/customer-pricing-store";
import { pricingRecord } from "../src/lib/pricing-record";

test("customer rates inherit unspecified prices and preserve explicit zero prices", () => {
  const schedule = composeCustomerRates(DEFAULT_SCHEDULE, { customerId: "one", revision: 3, overrides: { "sanger-standard-tubes": 425, "plasmid-large-plate": 0 } });
  assert.equal(schedule.rates["sanger-standard-tubes"], 425);
  assert.equal(schedule.rates["plasmid-large-plate"], 0);
  assert.equal(schedule.rates["plasmid-tubes"], DEFAULT_SCHEDULE.rates["plasmid-tubes"]);
  assert.equal(schedule.customerId, "one");
  assert.equal(schedule.customerRevision, 3);
  assert.deepEqual(schedule.overriddenKeys, ["sanger-standard-tubes", "plasmid-large-plate"]);
  assert.equal(DEFAULT_SCHEDULE.rates["sanger-standard-tubes"], 550);
  const reset = composeCustomerRates(DEFAULT_SCHEDULE, { customerId: "one", revision: 4, overrides: {} });
  assert.deepEqual(reset.rates, DEFAULT_SCHEDULE.rates);
  assert.deepEqual(reset.overriddenKeys, []);
  assert.equal(reset.customerRevision, 4);
});

test("only active fixed prices can be overridden and updates require a reason and revision", () => {
  assert.equal(RATE_ITEMS.length, 10);
  assert.equal(ACTIVE_RATE_ITEMS.length, 8);
  const valid = { revision: 0, overrides: { "plasmid-tubes": 350 }, reason: "Agreed lab rate" };
  assert.equal(customerPriceUpdateSchema.safeParse(valid).success, true);
  assert.equal(customerPriceUpdateSchema.safeParse({ ...valid, overrides: {} }).success, true);
  for (const overrides of [{ "sanger-ready-tubes": 300 }, { oligo: 25 }, { "plasmid-tubes": null }, { "plasmid-tubes": -1 }, { "plasmid-tubes": 2.5 }, { "plasmid-tubes": 1_000_001 }]) {
    assert.equal(customerPriceUpdateSchema.safeParse({ ...valid, overrides }).success, false);
  }
  for (const patch of [{ revision: -1 }, { revision: 1.5 }, { reason: " " }, { reason: "x".repeat(501) }, { customerId: "other" }]) {
    assert.equal(customerPriceUpdateSchema.safeParse({ ...valid, ...patch }).success, false);
  }
  assert.equal(customerPricingSchema.safeParse({ customerId: "one", revision: 0, overrides: {} }).success, true);
  assert.equal(sameCustomerOverrides({}, { "plasmid-tubes": 0 }), false);
  assert.equal(sameCustomerOverrides({ "plasmid-tubes": 350 }, { "plasmid-tubes": 350 }), true);
  assert.equal(priceUpdateSchema.safeParse({ ...DEFAULT_SCHEDULE, customerId: "one", reason: "Global change" }).success, false);
});

test("customer price snapshots record the custom rate and revision without changing public pricing", () => {
  const schedule = composeCustomerRates(DEFAULT_SCHEDULE, { customerId: "one", revision: 2, overrides: { "sanger-standard-tubes": 400 } });
  const snapshot = priceOrder(blankOrder(), schedule);
  assert.equal(snapshot.subtotalCents, 400);
  assert.equal(snapshot.customerPricingRevision, 2);
  assert.equal(snapshot.lines[0].customPrice, true);
  assert.equal(priceOrder(blankOrder(), DEFAULT_SCHEDULE).subtotalCents, 550);
});

const enabledAddOn: AddOn = { id: "customer-gc", name: "GC-rich sequencing", service: "SANGER", scope: "reaction", unitCents: 300, active: true, trigger: "GC-rich" };
const disabledAddOn: AddOn = { id: "disabled-addon", name: "Disabled service", service: "SANGER", scope: "sample", unitCents: 500, active: false };
const unpricedAddOn: AddOn = { id: "unpriced-addon", name: "Unpriced service", service: "SANGER", scope: "sample", unitCents: null, active: false };
const globalSchedule: RateSchedule = { ...DEFAULT_SCHEDULE, revision: 10, addOns: [enabledAddOn, disabledAddOn, unpricedAddOn] };

test("customer price records read legacy maps and preserve independent zero-valued overrides", () => {
  assert.deepEqual(readCustomerPricingRecord({ "plasmid-tubes": 0 }), { format: 1, overrides: { "plasmid-tubes": 0 }, oligoOverrides: {}, addOnOverrides: {} });
  const record = customerPricingRecord({ overrides: {}, oligoOverrides: { shortUnitCents: 0 }, addOnOverrides: { "customer-gc": 0 } });
  assert.deepEqual(readCustomerPricingRecord(record), record);
  assert.equal(record.format, 2);
  assert.equal(sameCustomerPricing({ overrides: {} }, { overrides: {}, oligoOverrides: {}, addOnOverrides: {} }), true);
  assert.equal(sameCustomerPricing({ overrides: {} }, { overrides: {}, oligoOverrides: { shortUnitCents: 0 } }), false);
  assert.equal(sameCustomerPricing({ overrides: {} }, { overrides: {}, addOnOverrides: { "customer-gc": 0 } }), false);
  assert.equal(sameCustomerPricing({ overrides: {}, addOnOverrides: { a: 0, b: 50 } }, { overrides: {}, addOnOverrides: { b: 50, a: 0 } }), true);
  assert.throws(() => readCustomerPricingRecord({ format: 3, overrides: {} }));
});

test("extended customer input accepts zero prices but cannot redefine thresholds, availability or service metadata", () => {
  const input = { revision: 0, globalRevision: 10, overrides: {}, oligoOverrides: { shortUnitCents: 0, longUnitCents: 50 }, addOnOverrides: { "customer-gc": 0 }, reason: "Customer agreement" };
  assert.equal(customerPriceUpdateSchema.safeParse(input).success, true);
  for (const oligoOverrides of [{ shortMaxBases: 100 }, { shortUnitCents: -1 }, { longUnitCents: null }, { longUnitCents: 0.5 }, { longUnitCents: 1_000_001 }]) {
    assert.equal(customerPriceUpdateSchema.safeParse({ ...input, oligoOverrides }).success, false);
  }
  for (const addOnOverrides of [{ "customer-gc": null }, { "customer-gc": -1 }, { "customer-gc": 1.5 }, { "customer-gc": { active: true, unitCents: 0 } }, { "bad/id": 0 }]) {
    assert.equal(customerPriceUpdateSchema.safeParse({ ...input, addOnOverrides }).success, false);
  }
  for (const globalRevision of [0, -1, 1.5]) assert.equal(customerPriceUpdateSchema.safeParse({ ...input, globalRevision }).success, false);
});

test("effective customer Oligo and extra prices inherit global definitions and ignore unavailable saved overrides", () => {
  const original = structuredClone(globalSchedule);
  const effective = composeCustomerRates(globalSchedule, { customerId: "one", revision: 4, overrides: {},
    oligoOverrides: { shortUnitCents: 0, longUnitCents: 50 },
    addOnOverrides: { "customer-gc": 0, "disabled-addon": 0, "unpriced-addon": 0, "removed-addon": 0 },
  });
  assert.deepEqual(effective.oligo, { shortMaxBases: 60, shortUnitCents: 0, longUnitCents: 50 });
  assert.deepEqual(effective.overriddenOligoKeys, ["shortUnitCents", "longUnitCents"]);
  assert.deepEqual(effective.overriddenAddOnIds, ["customer-gc"]);
  assert.deepEqual(effective.addOns, [{ ...enabledAddOn, unitCents: 0 }, disabledAddOn, unpricedAddOn]);
  assert.deepEqual(globalSchedule, original, "Composition cannot mutate default prices or definitions");
  const legacy = composeCustomerRates({ ...globalSchedule, oligo: { shortMaxBases: 59, shortUnitCents: 25, longUnitCents: null } }, { customerId: "one", revision: 4, overrides: {}, oligoOverrides: { longUnitCents: 0 } });
  assert.equal(legacy.oligo?.longUnitCents, null);
  assert.deepEqual(legacy.overriddenOligoKeys, []);
  const reset = composeCustomerRates(globalSchedule, { customerId: "one", revision: 5, overrides: {}, oligoOverrides: {}, addOnOverrides: {} });
  assert.deepEqual(reset.oligo, globalSchedule.oligo);
  assert.deepEqual(reset.addOns, globalSchedule.addOns);
});

test("customer Oligo tiers and add-on charges feed order totals while old snapshots and other accounts stay unchanged", () => {
  const oligo = { ...blankOrder(), service: "OLIGO" as const, submissionMode: "Oligo standard" as const, samples: [], oligos: [60, 61].map(length => ({ name: `Primer-${length}`, sequence: "A".repeat(length), synthesisScale: "25 nmol" as const, purification: "Desalted" as const, modification5: "", modification3: "", modificationInternal: "", notes: "" })) };
  const original = priceOrder(oligo, globalSchedule);
  const effective = composeCustomerRates(globalSchedule, { customerId: "one", revision: 2, overrides: {}, oligoOverrides: { shortUnitCents: 0, longUnitCents: 50 }, addOnOverrides: { "customer-gc": 0 } });
  const customerPrice = priceOrder(oligo, effective);
  assert.equal(customerPrice.subtotalCents, 3050);
  assert.equal(customerPrice.customerPricingRevision, 2);
  assert.deepEqual(customerPrice.lines.map(line => [line.quantity, line.unitCents, line.customPrice]), [[60, 0, true], [61, 50, true]]);
  assert.equal(original.subtotalCents, 5770);
  assert.deepEqual(priceOrder(oligo, globalSchedule), original);
  const sanger = blankOrder();
  sanger.samples[0].reactions[0].specialProtocol = "GC-rich";
  assert.equal(priceOrder(sanger, effective).subtotalCents, 550);
  assert.equal(priceOrder(sanger, globalSchedule).subtotalCents, 850);
  const modified = { ...oligo, oligos: [{ ...oligo.oligos[0], purification: "HPLC" as const }] };
  assert.equal(priceOrder(modified, effective).pendingQuote, true, "Custom per-base prices cannot price special specifications");
});

function customerStoreFixture(stored: unknown = {}, schedule: RateSchedule = globalSchedule, revision = 0) {
  const row: { userId: string; revision: number; overrides: unknown } = { userId: "one", revision, overrides: structuredClone(stored) };
  const globalRow = { revision: schedule.revision, rates: pricingRecord(schedule) };
  const changes: Record<string, unknown>[] = [];
  const locks: string[] = [];
  const tx = {
    $executeRaw: async () => { locks.push("customer"); return 1; },
    $queryRaw: async () => { locks.push("global"); return [{ id: "active" }]; },
    user: { findFirst: async () => ({ id: "one" }) },
    pricingSchedule: { findUniqueOrThrow: async () => structuredClone(globalRow) },
    customerPricing: {
      findUnique: async () => structuredClone(row),
      upsert: async ({ update }: { update: { revision: number; overrides: unknown } }) => { Object.assign(row, structuredClone(update)); return row; },
    },
    customerPricingChange: { create: async ({ data }: { data: Record<string, unknown> }) => { changes.push(structuredClone(data)); return data; } },
  };
  const db = { ...tx, $transaction: async (work: (db: typeof tx) => Promise<unknown>) => work(tx) } as unknown as PrismaClient;
  return { db, row, globalRow, changes, locks };
}
const actor = { id: "admin", name: "Administrator" };

test("customer store saves versioned audited agreements, preserves omitted maps and resets only explicitly cleared groups", async () => {
  const fixture = customerStoreFixture({ "plasmid-tubes": 400 });
  const initial = await getCustomerPricing(fixture.db, "one");
  assert.deepEqual(initial, { customerId: "one", revision: 0, overrides: { "plasmid-tubes": 400 }, oligoOverrides: {}, addOnOverrides: {} });
  const first = await updateCustomerPricing(fixture.db, actor, "one", { revision: 0, globalRevision: 10, overrides: initial.overrides,
    oligoOverrides: { shortUnitCents: 0, longUnitCents: 50 }, addOnOverrides: { "customer-gc": 0 }, reason: "Agreed customer prices" });
  assert.equal(first.revision, 1);
  assert.deepEqual(fixture.locks, ["customer", "global"]);
  assert.deepEqual(fixture.row.overrides, customerPricingRecord(first));
  assert.equal(fixture.changes.length, 1);
  assert.deepEqual(fixture.changes[0].previousOverrides, customerPricingRecord(initial));
  assert.deepEqual(fixture.changes[0].overrides, customerPricingRecord(first));
  const legacyEdit = await updateCustomerPricing(fixture.db, actor, "one", { revision: 1, overrides: { "plasmid-tubes": 350 }, reason: "Sequencing-only editor" });
  assert.deepEqual(legacyEdit.oligoOverrides, first.oligoOverrides);
  assert.deepEqual(legacyEdit.addOnOverrides, first.addOnOverrides);
  const noOp = await updateCustomerPricing(fixture.db, actor, "one", { revision: 2, overrides: legacyEdit.overrides, reason: "No changes" });
  assert.equal(noOp.revision, 2); assert.equal(fixture.changes.length, 2);
  const reset = await updateCustomerPricing(fixture.db, actor, "one", { revision: 2, overrides: {}, oligoOverrides: {}, addOnOverrides: {}, reason: "Use defaults" });
  assert.equal(reset.revision, 3);
  assert.deepEqual((await getEffectiveRateSchedule(fixture.db, "one")).oligo, globalSchedule.oligo);
  assert.deepEqual((await getEffectiveRateSchedule(fixture.db, "one")).addOns, globalSchedule.addOns);
});

test("unknown, disabled and unpriced custom extras are rejected without changing the customer agreement or audit", async () => {
  for (const id of ["forged-new-service", "disabled-addon", "unpriced-addon"]) {
    const fixture = customerStoreFixture();
    const before = structuredClone(fixture.row);
    await assert.rejects(updateCustomerPricing(fixture.db, actor, "one", { revision: 0, overrides: {}, addOnOverrides: { [id]: 0 }, reason: "Invalid extra" }), InvalidCustomerPriceUpdate);
    assert.deepEqual(fixture.row, before); assert.equal(fixture.changes.length, 0);
  }
});

test("saved unavailable overrides can remain unchanged or be cleared but cannot be altered or used for billing", async () => {
  const schedule = { ...globalSchedule, oligo: { shortMaxBases: 60, shortUnitCents: 25, longUnitCents: null } };
  const saved = customerPricingRecord({ overrides: {}, oligoOverrides: { longUnitCents: 40 }, addOnOverrides: { "removed-service": 0, "disabled-addon": 125, "unpriced-addon": 300 } });
  const fixture = customerStoreFixture(saved, schedule, 1);
  const next = await updateCustomerPricing(fixture.db, actor, "one", { revision: 1, overrides: { "plasmid-tubes": 375 }, reason: "Keep unavailable agreements" });
  assert.deepEqual(next.addOnOverrides, saved.addOnOverrides);
  assert.equal((await getEffectiveRateSchedule(fixture.db, "one")).oligo?.longUnitCents, null);
  assert.deepEqual((await getEffectiveRateSchedule(fixture.db, "one")).overriddenAddOnIds, []);
  await assert.rejects(updateCustomerPricing(fixture.db, actor, "one", { revision: 2, overrides: next.overrides, addOnOverrides: { ...saved.addOnOverrides, "removed-service": 100 }, reason: "Changed unavailable agreement" }), InvalidCustomerPriceUpdate);
  await assert.rejects(updateCustomerPricing(fixture.db, actor, "one", { revision: 2, overrides: next.overrides, oligoOverrides: { longUnitCents: 0 }, reason: "Priced unavailable tier" }), InvalidCustomerPriceUpdate);
  assert.equal(fixture.changes.length, 1);
  const reset = await updateCustomerPricing(fixture.db, actor, "one", { revision: 2, overrides: next.overrides, oligoOverrides: {}, addOnOverrides: {}, reason: "Remove stale agreements" });
  assert.deepEqual(reset.oligoOverrides, {}); assert.deepEqual(reset.addOnOverrides, {});
  const fresh = customerStoreFixture({}, schedule);
  await assert.rejects(updateCustomerPricing(fresh.db, actor, "one", { revision: 0, overrides: {}, oligoOverrides: { longUnitCents: 0 }, reason: "New unavailable tier" }), InvalidCustomerPriceUpdate);
});

test("customer or global revision conflicts return current context without saving price changes", async () => {
  const fixture = customerStoreFixture({}, globalSchedule, 2);
  await assert.rejects(updateCustomerPricing(fixture.db, actor, "one", { revision: 1, overrides: {}, reason: "Stale customer" }), CustomerPriceChanged);
  await assert.rejects(updateCustomerPricing(fixture.db, actor, "one", { revision: 2, globalRevision: 9, overrides: {}, reason: "Stale defaults" }), error => {
    assert.ok(error instanceof CustomerDefaultsChanged);
    assert.equal(error.current.revision, 2); assert.equal(error.schedule.revision, 10);
    return true;
  });
  assert.equal(fixture.row.revision, 2); assert.equal(fixture.changes.length, 0);
});
