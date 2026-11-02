import assert from "node:assert/strict";
import { test } from "node:test";
import { blankOrder, blankReaction, MAX_SANGER_REACTIONS, MAX_SANGER_SAMPLES } from "../src/lib/order-intake";
import { AddOnSelectionError, priceOrder, RATE_CENTS, formatMoney, pricingSchema } from "../src/lib/pricing";
import { ACTIVE_RATE_ITEMS, addOnsSchema, DEFAULT_ADD_ONS, DEFAULT_SCHEDULE, dollarsToCents, historicalRatesSchema, priceUpdateSchema, rateScheduleSchema, type AddOn } from "../src/lib/rate-schedule";
import { orderFilterWhere, parseOrderFilters } from "../src/lib/admin-order-filters";
import type { PrismaClient } from "@prisma/client";
import { getRateSchedule, InvalidPriceUpdate, updateRateSchedule } from "../src/lib/pricing-store";
import { pricingRecord } from "../src/lib/pricing-record";
for (const container of ["Plate", "Tubes"] as const) {
  for (const submissionMode of ["Standard", "Pre-mixed"] as const) {
    test(`${container} ${submissionMode} uses the confirmed per-reaction rate`, () => {
      const draft = { ...blankOrder(), container, submissionMode };
      assert.equal(priceOrder(draft).subtotalCents, RATE_CENTS[container][submissionMode]);
    });
  }
}

test("Only currently offered services appear in price management while historical rates remain readable", () => {
  assert.equal(ACTIVE_RATE_ITEMS.length, 8);
  assert.ok(ACTIVE_RATE_ITEMS.every(item => !item.key.startsWith("sanger-ready-")));
  assert.equal(historicalRatesSchema.parse(DEFAULT_SCHEDULE.rates)["sanger-ready-tubes"], 350);
});
test("96 pre-mixed plate reactions cost $336 and multiple primers count separately", () => {
  const draft = blankOrder(); draft.container = "Plate"; draft.submissionMode = "Pre-mixed";
  draft.samples = Array.from({ length: 96 }, () => structuredClone(draft.samples[0]));
  assert.equal(priceOrder(draft).subtotalCents, 33600);
  assert.equal(formatMoney(33600), "$336.00");
  draft.samples = [draft.samples[0]]; draft.submissionMode = "Standard";
  draft.samples[0].reactions.push(blankReaction());
  assert.equal(priceOrder(draft).subtotalCents, 900);
});
test("extras need review, and empty orders cannot receive a price", () => {
  const draft = blankOrder();
  draft.priority = "Same day requested";
  draft.samples[0].reactions[0].primerSource = "SeqForge synthesized primer";
  assert.equal(priceOrder(draft).reviewReasons.length, 2);
  draft.samples = [];
  assert.throws(() => priceOrder(draft), /1–3072/);
});

test("managed prices use cents and reject missing, negative or fractional-cent rates", () => {
  assert.equal(dollarsToCents("6.50"), 650);
  assert.equal(dollarsToCents("0"), 0);
  for (const input of ["-1", "NaN", "1.001", "1e2", "10000.01"]) assert.throws(() => dollarsToCents(input));
  const rates = { ...DEFAULT_SCHEDULE.rates, "sanger-standard-tubes": 725 };
  assert.equal(priceOrder(blankOrder(), { revision: 2, rates }).subtotalCents, 725);
  assert.equal(priceUpdateSchema.safeParse({ revision: 2, rates, reason: "Adjusted" }).success, true);
  assert.equal(priceUpdateSchema.safeParse({ revision: 2, rates: {}, reason: "Adjusted" }).success, false);
  for (const cents of [-1, 2.5, 1000001]) assert.equal(priceUpdateSchema.safeParse({ revision: 2, rates: { ...rates, "plasmid-tubes": cents }, reason: "Adjusted" }).success, false);
});

test("admin order filters compose search and exact filters and normalize bad parameters", () => {
  const filters = parseOrderFilters({ q: "  Sample-X ", service: "WHOLE_PLASMID", status: "SUBMITTED", customer: "u1", page: "2" });
  const where = orderFilterWhere(filters);
  assert.equal(filters.q, "Sample-X"); assert.equal(filters.page, 2);
  assert.equal(where.service, "WHOLE_PLASMID"); assert.equal(where.userId, "u1"); assert.equal(where.status, "SUBMITTED");
  assert.equal(where.OR?.length, 9);
  assert.equal(parseOrderFilters({ page: "-1", service: "invalid", status: ["QC"] }).page, 1);
  assert.deepEqual(orderFilterWhere(parseOrderFilters({})), {});
});

test("Active schedules require both size tiers while historical eight-rate audits remain readable", () => {
  const oldRates = Object.fromEntries(Object.entries(DEFAULT_SCHEDULE.rates).filter(([key]) => !key.startsWith("plasmid-large-")));
  assert.deepEqual(historicalRatesSchema.parse(oldRates), oldRates);
  assert.equal(rateScheduleSchema.safeParse({ revision: 1, rates: oldRates }).success, false);
  assert.equal(priceUpdateSchema.safeParse({ revision: 1, rates: oldRates, reason: "Incomplete update" }).success, false);
  assert.equal(rateScheduleSchema.safeParse(DEFAULT_SCHEDULE).success, true);
});

const pcrCharge: AddOn = { id: "pcr-cleanup", name: "PCR cleanup", service: "SANGER", scope: "sample", unitCents: 200, active: true, trigger: "PCR cleanup requested" };
const gcCharge: AddOn = { id: "gc-rich", name: "GC-rich sequencing", service: "SANGER", scope: "reaction", unitCents: 300, active: true, trigger: "GC-rich" };

test("large Sanger plate estimates and immutable add-on target snapshots support the full reaction limit", () => {
  const order = blankOrder(); order.container = "Plate";
  const sample = { ...order.samples[0], templateType: "PCR product" as const, preparation: "PCR cleanup requested" as const, reactions: ["Forward", "Reverse"].map(primerName => ({ ...blankReaction(), primerName, specialProtocol: "GC-rich" as const })) };
  const samples = (count: number) => Array.from({ length: count }, (_, i) => ({ ...sample, sampleKey: `S${i + 1}`, sampleName: `DNA-${i + 1}`, plateLabel: `P${Math.floor(i / 96) + 1}`, well: `${"ABCDEFGH"[i % 8]}${Math.floor((i % 96) / 8) + 1}` }));
  order.samples = samples(768);
  const schedule = { ...DEFAULT_SCHEDULE, addOns: [pcrCharge, gcCharge] };
  const saved = pricingSchema.parse(JSON.parse(JSON.stringify(priceOrder(order, schedule))));
  assert.equal(saved.subtotalCents, 1536 * 450 + 768 * 200 + 1536 * 300);
  assert.equal(saved.lines.find(line => line.addOnId === "pcr-cleanup")?.targets?.length, 768);
  assert.equal(saved.lines.find(line => line.addOnId === "gc-rich")?.targets?.length, 1536);
  order.samples = samples(MAX_SANGER_SAMPLES);
  assert.equal(pricingSchema.parse(priceOrder(order, schedule)).lines.find(line => line.addOnId === "gc-rich")?.targets?.length, MAX_SANGER_REACTIONS);
  order.samples[0] = { ...order.samples[0], reactions: [...order.samples[0].reactions, blankReaction()] };
  assert.throws(() => priceOrder(order, schedule), /1–3072/);
  order.samples = samples(MAX_SANGER_SAMPLES + 1).map(sample => ({ ...sample, reactions: [sample.reactions[0]] }));
  assert.throws(() => priceOrder(order, schedule), /1536 physical/);
  assert.equal(saved.subtotalCents, 1_305_600, "Later edits do not mutate a saved price snapshot");
});

function pricingStoreFixture(legacy = false) {
  const existing: AddOn = { id: "existing-customer-service", name: "Existing 测试 service", service: "SANGER", scope: "sample", unitCents: null, active: false, trigger: null };
  const schedule = rateScheduleSchema.parse({ ...DEFAULT_SCHEDULE, revision: 9, addOns: [...DEFAULT_ADD_ONS, existing] });
  const row: { revision: number; rates: unknown } = { revision: schedule.revision, rates: legacy ? schedule.rates : pricingRecord(schedule) };
  const changes: Record<string, unknown>[] = [];
  const transaction = {
    $queryRaw: async () => [{ id: "active" }],
    pricingSchedule: {
      findUniqueOrThrow: async () => structuredClone(row),
      update: async ({ data }: { data: { revision: number; rates: unknown } }) => { Object.assign(row, structuredClone(data)); return row; },
    },
    pricingChange: { create: async ({ data }: { data: Record<string, unknown> }) => { changes.push(structuredClone(data)); return data; } },
  };
  const db = { ...transaction, $transaction: async (work: (tx: typeof transaction) => Promise<unknown>) => work(transaction) } as unknown as PrismaClient;
  return { db, schedule, row, changes };
}

test("administrator API storage rejects creating, deleting or redefining existing additional services without writes", async () => {
  const transformations: ((items: AddOn[]) => AddOn[])[] = [
    items => [...items, { id: "forged-new-service", name: "New service", service: "SANGER", scope: "order", unitCents: 100, active: true }],
    items => items.filter(item => item.id !== "existing-customer-service"),
    ...[
      { id: "replacement-service" }, { name: "Renamed service" }, { service: "WHOLE_PLASMID" as const },
      { scope: "order" as const }, { trigger: "PCR cleanup requested" as const },
    ].map(patch => (items: AddOn[]) => items.map(item => item.id === "existing-customer-service" ? { ...item, ...patch } : item)),
  ];
  for (const transform of transformations) {
    const fixture = pricingStoreFixture();
    const before = structuredClone(fixture.row);
    const input = { ...fixture.schedule, addOns: transform(fixture.schedule.addOns!), reason: "Attempted definition change" };
    assert.equal(priceUpdateSchema.safeParse(input).success, true, "The new restriction applies even to structurally valid old-editor requests");
    await assert.rejects(updateRateSchedule(fixture.db, { id: "admin", name: "Admin" }, input), error => error instanceof InvalidPriceUpdate && /development update/.test(error.message));
    assert.deepEqual(fixture.row, before);
    assert.equal(fixture.changes.length, 0);
  }
});

test("administrators can update existing service prices and availability alongside sequencing and Oligo prices", async () => {
  const fixture = pricingStoreFixture();
  const input = {
    ...fixture.schedule, rates: { ...fixture.schedule.rates, "sanger-standard-tubes": 625 },
    oligo: { shortMaxBases: 75, shortUnitCents: 20, longUnitCents: 60 },
    addOns: fixture.schedule.addOns!.map(item => item.id === "existing-customer-service" ? { ...item, unitCents: 99, active: true } : item).reverse(),
    reason: "Update rates and enable an existing service",
  };
  const saved = await updateRateSchedule(fixture.db, { id: "admin", name: "Admin" }, input);
  assert.equal(saved.revision, 10);
  assert.equal(saved.rates["sanger-standard-tubes"], 625);
  assert.deepEqual(saved.oligo, input.oligo);
  assert.deepEqual(saved.addOns?.map(item => item.id), fixture.schedule.addOns?.map(item => item.id), "Administrative payload ordering cannot rewrite the catalog definition order");
  assert.deepEqual(saved.addOns?.at(-1), { ...fixture.schedule.addOns!.at(-1), unitCents: 99, active: true });
  assert.equal(fixture.changes.length, 1);
  assert.deepEqual(fixture.changes[0].previousRates, pricingRecord(fixture.schedule));
  assert.deepEqual(fixture.changes[0].rates, pricingRecord(saved));
  assert.equal(fixture.changes[0].actorId, "admin");
  assert.equal(fixture.changes[0].reason, input.reason);
});

test("omitted catalog fields preserve existing definitions and unchanged catalog requests do not add revisions", async () => {
  const fixture = pricingStoreFixture();
  const unchanged = await updateRateSchedule(fixture.db, { id: "admin", name: "Admin" }, { ...fixture.schedule, addOns: [...fixture.schedule.addOns!].reverse(), reason: "Same catalog" });
  assert.equal(unchanged.revision, 9);
  assert.equal(fixture.changes.length, 0);
  const saved = await updateRateSchedule(fixture.db, { id: "admin", name: "Admin" }, { revision: 9, rates: { ...fixture.schedule.rates, "sanger-standard-tubes": 600 }, reason: "Legacy sequencing-only update" });
  assert.deepEqual(saved.addOns, fixture.schedule.addOns);
  assert.deepEqual(saved.oligo, fixture.schedule.oligo);
  assert.equal(saved.revision, 10);
});

test("legacy initialization remains compatible with developer-defined default services", async () => {
  const fixture = pricingStoreFixture(true);
  const legacy = await getRateSchedule(fixture.db);
  assert.deepEqual(legacy.addOns, DEFAULT_ADD_ONS);
  const initialized = await updateRateSchedule(fixture.db, { id: "system:pricing-catalog-v2", name: "Owner-requested pricing configuration" }, {
    revision: legacy.revision, rates: legacy.rates, oligo: DEFAULT_SCHEDULE.oligo, addOns: DEFAULT_ADD_ONS, reason: "Owner-approved initial policy",
  });
  assert.equal(initialized.revision, 10);
  assert.deepEqual(initialized.rates, legacy.rates);
  assert.deepEqual(initialized.addOns, DEFAULT_ADD_ONS);
  assert.deepEqual(initialized.oligo, DEFAULT_SCHEDULE.oligo);
  assert.equal(fixture.changes.length, 1);
});

test("additional service catalog cannot activate unpriced fees or duplicate automatic charges", () => {
  assert.equal(addOnsSchema.safeParse(DEFAULT_ADD_ONS).success, true);
  assert.equal(addOnsSchema.safeParse([{ ...pcrCharge, unitCents: null }]).success, false);
  assert.equal(addOnsSchema.safeParse([{ ...pcrCharge, active: false, unitCents: null }]).success, true);
  assert.equal(addOnsSchema.safeParse([pcrCharge, { ...pcrCharge, name: "Duplicate ID" }]).success, false);
  assert.equal(addOnsSchema.safeParse([pcrCharge, { ...pcrCharge, id: "pcr-second" }]).success, false);
  for (const patch of [{ scope: "order" }, { service: "OLIGO" }, { unitCents: -1 }, { unitCents: 2.5 }, { id: "bad id" }]) assert.equal(addOnsSchema.safeParse([{ ...pcrCharge, ...patch }]).success, false);
  assert.equal(priceUpdateSchema.safeParse({ ...DEFAULT_SCHEDULE, oligo: { shortMaxBases: 60, shortUnitCents: 25, longUnitCents: null }, reason: "Invalid new policy" }).success, false);
});

test("PCR cleanup charges once per physical sample while special protocols charge per reaction", () => {
  const order = blankOrder();
  order.samples[0].sampleName = "PCR-A";
  order.samples[0].templateType = "PCR product";
  order.samples[0].preparation = "PCR cleanup requested";
  order.samples[0].addOnIds = [pcrCharge.id];
  order.samples[0].reactions = [blankReaction(), blankReaction()];
  order.samples[0].reactions.forEach(reaction => { reaction.specialProtocol = "GC-rich"; reaction.addOnIds = [gcCharge.id]; });
  const price = priceOrder(order, { ...DEFAULT_SCHEDULE, addOns: [pcrCharge, gcCharge] });
  assert.equal(price.subtotalCents, 1100 + 200 + 600);
  const pcr = price.lines.find(line => line.addOnId === pcrCharge.id)!;
  const gc = price.lines.find(line => line.addOnId === gcCharge.id)!;
  assert.equal(pcr.quantity, 1);
  assert.equal(pcr.unit, "sample");
  assert.equal(gc.quantity, 2);
  assert.equal(gc.unit, "reaction");
  assert.ok(gc.targets?.every(target => target.includes("PCR-A") && target.includes("reaction")));
  assert.deepEqual(price.reviewReasons, []);
  assert.equal(pricingSchema.safeParse(price).success, true);
});

test("unconfigured protocols retain quote review without an invented surcharge", () => {
  const order = blankOrder();
  order.samples[0].templateType = "PCR product";
  order.samples[0].preparation = "PCR cleanup requested";
  order.samples[0].reactions[0].specialProtocol = "PolyA";
  const price = priceOrder(order, DEFAULT_SCHEDULE);
  assert.equal(price.subtotalCents, 550);
  assert.equal(price.lines.length, 1);
  assert.ok(price.reviewReasons.some(reason => reason.includes("preparation")));
  assert.ok(price.reviewReasons.some(reason => reason.includes("protocols")));
});

test("forged, retired, duplicated and wrong-target add-ons are rejected before billing", () => {
  const order = blankOrder();
  const schedule = { ...DEFAULT_SCHEDULE, addOns: [pcrCharge, gcCharge] };
  assert.throws(() => priceOrder({ ...order, addOnIds: [pcrCharge.id] }, schedule), AddOnSelectionError);
  assert.throws(() => priceOrder({ ...order, addOnIds: ["unknown"] }, schedule), AddOnSelectionError);
  order.samples[0].addOnIds = [pcrCharge.id];
  assert.throws(() => priceOrder(order, schedule), /does not apply/);
  order.samples[0].templateType = "PCR product";
  assert.doesNotThrow(() => priceOrder(order, schedule));
  assert.throws(() => priceOrder({ ...order, submissionMode: "Pre-mixed" }, schedule), /does not apply/);
  assert.throws(() => priceOrder(order, { ...schedule, addOns: [{ ...pcrCharge, active: false }] }), /no longer available/);
  order.samples[0].addOnIds = [pcrCharge.id, pcrCharge.id];
  assert.throws(() => priceOrder(order, schedule), /only once/);
});

test("manual per-order add-ons, customer base rates and historical snapshots keep distinct quantities", () => {
  const extra: AddOn = { id: "special-handling", name: "Special handling", service: "SANGER", scope: "order", unitCents: 700, active: true };
  const order = { ...blankOrder(), addOnIds: [extra.id] };
  const schedule = { ...DEFAULT_SCHEDULE, revision: 3, rates: { ...DEFAULT_SCHEDULE.rates, "sanger-standard-tubes": 400 }, customerId: "u1", customerRevision: 2, overriddenKeys: ["sanger-standard-tubes" as const], addOns: [extra] };
  const snapshot = priceOrder(order, schedule);
  assert.equal(snapshot.subtotalCents, 1100);
  assert.equal(snapshot.lines[0].customPrice, true);
  assert.equal(snapshot.lines[1].quantity, 1);
  assert.equal(snapshot.lines[1].unitCents, 700);
  extra.name = "Changed name";
  extra.unitCents = 9900;
  assert.equal(pricingSchema.parse(snapshot).subtotalCents, 1100);
  assert.equal(snapshot.lines[1].description, "Special handling · per order");
});

test("Whole Plasmid sample add-ons count samples and cannot accept a Sanger reaction charge", () => {
  const base = blankOrder();
  const extra: AddOn = { id: "plasmid-prep", name: "Plasmid preparation", service: "WHOLE_PLASMID", scope: "sample", unitCents: 450, active: true };
  const order = { ...base, service: "WHOLE_PLASMID" as const, submissionMode: "Whole plasmid" as const, samples: [{ ...base.samples[0], sampleName: "P1", templateLength: "6000", reactions: [], addOnIds: [extra.id] }, { ...base.samples[0], sampleName: "P2", templateLength: "13000", reactions: [], addOnIds: [extra.id] }] };
  const price = priceOrder(order, { ...DEFAULT_SCHEDULE, addOns: [extra, gcCharge] });
  assert.equal(price.subtotalCents, 500 + 1500 + 2 * 450);
  assert.equal(price.lines.find(line => line.addOnId === extra.id)?.quantity, 2);
  order.samples[0].addOnIds = [gcCharge.id];
  assert.throws(() => priceOrder(order, { ...DEFAULT_SCHEDULE, addOns: [extra, gcCharge] }), /does not apply/);
});
