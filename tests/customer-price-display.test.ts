import assert from "node:assert/strict";
import test from "node:test";
import { blankOrder, blankSample, type OrderDraft } from "../src/lib/order-intake";
import { composeCustomerRates } from "../src/lib/customer-pricing";
import { DEFAULT_SCHEDULE, rateScheduleSchema, type AddOn } from "../src/lib/rate-schedule";
import { priceOrder, pricingSchema } from "../src/lib/pricing";
import { readSavedOrder } from "../src/lib/order-resume";

test("Customer fixed rates are calculated per reaction and recorded with their source", () => {
  const draft = blankOrder();
  draft.samples[0].reactions.push({ ...draft.samples[0].reactions[0] });
  const schedule = composeCustomerRates(DEFAULT_SCHEDULE, { customerId: "customer-A", revision: 2, overrides: { "sanger-standard-tubes": 400 } });
  const price = priceOrder(draft, schedule);
  assert.equal(price.subtotalCents, 800);
  assert.equal(price.lines[0].unitCents, 400);
  assert.equal(price.lines[0].customPrice, true);
  assert.equal(price.customerPricingRevision, 2);
  assert.equal(pricingSchema.parse(price).lines[0].customPrice, true);
  assert.equal(priceOrder(draft, DEFAULT_SCHEDULE).subtotalCents, 1100);
});

test("Whole Plasmid mixes customer and inherited size-band prices without changing older snapshots", () => {
  const draft = { ...blankOrder(), service: "WHOLE_PLASMID" as const, submissionMode: "Whole plasmid" as const, samples: [{ ...blankSample(), templateLength: "12000", reactions: [] }, { ...blankSample("S2"), templateLength: "12001", reactions: [] }] };
  const original = priceOrder(draft, DEFAULT_SCHEDULE);
  const schedule = composeCustomerRates(DEFAULT_SCHEDULE, { customerId: "customer-A", revision: 1, overrides: { "plasmid-tubes": 350 } });
  const price = priceOrder(draft, schedule);
  assert.equal(price.subtotalCents, 1850);
  assert.deepEqual(price.lines.map(line => [line.unitCents, !!line.customPrice]), [[350, true], [1500, false]]);
  assert.equal(pricingSchema.parse(original).subtotalCents, 2000);
  assert.equal(original.lines.some(line => line.customPrice), false);
});

test("Saved drafts keep the quoted customer revision and rates for comparison after sign-in", () => {
  const now = 1_800_000_000_000;
  const schedule = composeCustomerRates(DEFAULT_SCHEDULE, { customerId: "customer-A", revision: 4, overrides: { "sanger-standard-tubes": 0 } });
  const raw = JSON.stringify({ version: 1, savedAt: now, ownerId: "customer-A", draft: blankOrder(), pricingSchedule: schedule, priceNotice: "Review updated price" });
  const saved = readSavedOrder(raw, "Standard", "customer-A", now)!;
  assert.deepEqual(rateScheduleSchema.parse(saved.pricingSchedule), schedule);
  assert.equal(saved.priceNotice, "Review updated price");
  assert.equal(readSavedOrder(raw, "Standard", "customer-B", now), null);
});

test("Oligo-only customer agreements mark the overridden tier, including zero, and retain inherited prices", () => {
  const draft = { ...blankOrder(), service: "OLIGO" as const, submissionMode: "Oligo standard" as const, samples: [], oligoShippingAddress: "1 Test Way", oligoFormat: "Dry" as const,
    oligos: [60, 61].map(length => ({ name: `Oligo-${length}`, sequence: "A".repeat(length), synthesisScale: "25 nmol", purification: "Desalted", modification5: "", modification3: "", modificationInternal: "", notes: "" })) } satisfies OrderDraft;
  const schedule = composeCustomerRates(DEFAULT_SCHEDULE, { customerId: "customer-A", revision: 3, overrides: {}, oligoOverrides: { shortUnitCents: 0 } });
  const price = pricingSchema.parse(priceOrder(draft, schedule));
  assert.equal(price.subtotalCents, 4270);
  assert.deepEqual(price.lines.map(line => [line.quantity, line.unitCents, !!line.customPrice]), [[60, 0, true], [61, 70, false]]);
  assert.equal(price.customerPricingRevision, 3);
  assert.deepEqual(schedule.overriddenOligoKeys, ["shortUnitCents"]);
  assert.deepEqual(schedule.overriddenKeys, []);
  assert.equal(priceOrder(draft, DEFAULT_SCHEDULE).subtotalCents, 5770);
  const modified = { ...draft, submissionMode: "Oligo modified" as const, oligos: [{ ...draft.oligos[0], modification5: "Phosphate" }] };
  const quote = priceOrder(modified, schedule);
  assert.equal(quote.pendingQuote, true);
  assert.equal(quote.subtotalCents, null, "A personal base price never prices a modified specification automatically");
  assert.equal(quote.lines.length, 0);
});

test("Add-on-only customer agreements label scoped zero prices and deduplicate automatic selections", () => {
  const addOns: AddOn[] = [
    { id: "cleanup", name: "PCR cleanup", service: "SANGER", scope: "sample", active: true, unitCents: 300, trigger: "PCR cleanup requested" },
    { id: "gc", name: "GC-rich sequencing", service: "SANGER", scope: "reaction", active: true, unitCents: 200, trigger: "GC-rich" },
  ];
  const global = { ...DEFAULT_SCHEDULE, addOns };
  const draft = blankOrder();
  Object.assign(draft.samples[0], { templateType: "PCR product", preparation: "PCR cleanup requested", addOnIds: ["cleanup"] });
  draft.samples[0].reactions = ["T7", "M13F"].map(primerName => ({ ...draft.samples[0].reactions[0], primerName, specialProtocol: "GC-rich" as const, addOnIds: ["gc"] }));
  const schedule = composeCustomerRates(global, { customerId: "customer-A", revision: 4, overrides: {}, addOnOverrides: { cleanup: 0, gc: 75 } });
  const price = pricingSchema.parse(priceOrder(draft, schedule));
  assert.equal(price.subtotalCents, 1250);
  assert.deepEqual(price.lines.map(line => [line.addOnId, line.quantity, line.unitCents, !!line.customPrice]), [[undefined, 2, 550, false], ["cleanup", 1, 0, true], ["gc", 2, 75, true]]);
  assert.equal(priceOrder(draft, global).subtotalCents, 1800);
  const inherited = composeCustomerRates(global, { customerId: "customer-A", revision: 5, overrides: {}, oligoOverrides: {}, addOnOverrides: {} });
  assert.equal(priceOrder(draft, inherited).subtotalCents, 1800);
  assert.ok(!priceOrder(draft, inherited).lines.some(line => line.customPrice));
  assert.equal(price.subtotalCents, 1250, "Resetting agreements leaves an already-created snapshot unchanged");
});

test("Saved drafts preserve effective Oligo and add-on price-source metadata", () => {
  const now = 1_800_000_000_000;
  const addOn: AddOn = { id: "handling", name: "Handling", service: "SANGER", scope: "order", unitCents: 300, active: true };
  const schedule = composeCustomerRates({ ...DEFAULT_SCHEDULE, addOns: [addOn] }, { customerId: "customer-A", revision: 6, overrides: {}, oligoOverrides: { longUnitCents: 55 }, addOnOverrides: { handling: 0 } });
  const raw = JSON.stringify({ version: 1, savedAt: now, ownerId: "customer-A", draft: { ...blankOrder(), addOnIds: ["handling"] }, pricingSchedule: schedule });
  const saved = readSavedOrder(raw, "Standard", "customer-A", now)!;
  assert.deepEqual(rateScheduleSchema.parse(saved.pricingSchedule), schedule);
  assert.deepEqual(saved.pricingSchedule?.overriddenOligoKeys, ["longUnitCents"]);
  assert.deepEqual(saved.pricingSchedule?.overriddenAddOnIds, ["handling"]);
  assert.equal(saved.pricingSchedule?.addOns?.[0].unitCents, 0);
});
