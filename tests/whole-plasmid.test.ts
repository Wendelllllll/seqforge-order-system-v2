import assert from "node:assert/strict";
import test from "node:test";
import { blankOrder, blankReaction, orderSchema, type OrderDraft } from "../src/lib/order-intake";
import { newPlasmidSample, parseMappedPlasmid, plasmidTemplate } from "../src/lib/whole-plasmid";
import { inspectSangerSheet } from "../src/lib/sanger-column-mapping";
import { priceOrder } from "../src/lib/pricing";
import { DEFAULT_SCHEDULE } from "../src/lib/rate-schedule";
import { orderLoginUrl, readSavedOrder, safeOrderReturn } from "../src/lib/order-resume";

function order(container: OrderDraft["container"] = "Tubes"): OrderDraft {
  const draft = blankOrder();
  return { ...draft, service: "WHOLE_PLASMID", submissionMode: "Whole plasmid", container, samples: [{ ...newPlasmidSample([], container), sampleName: "Plasmid-A" }], fulfillment: { ...draft.fulfillment, pickupLocation: "Synthetic lab", contactName: "Test", contactPhone: "555-0100", billingOrganization: "Demo", billingContactName: "Finance", billingEmail: "finance@demo.local", billingAddress: "Synthetic address" } };
}

test("Whole plasmid accepts a primer-free sample and keeps Sanger validation intact", () => {
  assert.ok(orderSchema.safeParse(order()).success);
  const draft = order();
  assert.equal(orderSchema.safeParse({ ...draft, service: "SANGER" }).success, false);
  assert.equal(orderSchema.safeParse({ ...draft, submissionMode: "Standard" }).success, false);
  assert.equal(orderSchema.safeParse({ ...draft, service: "FORGED" }).success, false);
  assert.equal(orderSchema.safeParse({ ...draft, service: "SANGER", submissionMode: "Standard" }).success, false);
  for (const change of [{ reactions: [{ ...blankReaction(), primerName: "T7" }] }, { templateType: "PCR product" }, { preparation: "Miniprep requested" }]) {
    assert.equal(orderSchema.safeParse({ ...draft, samples: [{ ...draft.samples[0], ...change }] }).success, false);
  }
});

test("Whole plasmid samples up to 12 kb cost $5 for both tubes and plates, without counting reactions", () => {
  for (const container of ["Tubes", "Plate"] as const) {
    const draft = order(container);
    draft.samples.push({ ...newPlasmidSample(draft.samples, container), sampleName: "Plasmid-B" });
    draft.samples.forEach(sample => { sample.templateLength = "12000"; });
    const price = priceOrder(orderSchema.parse(draft));
    assert.equal(price.subtotalCents, 1000);
    assert.equal(price.unit, "sample");
    assert.equal(price.lines[0].quantity, 2);
    assert.equal(price.lines[0].unitCents, 500);
    assert.deepEqual(price.reviewReasons, []);
    assert.ok(draft.samples.every(sample => sample.reactions.length === 0));
  }
});

test("Whole plasmid prices 12,000 bp at the base rate and 12,001 bp at $15, for tubes and plates", () => {
  for (const container of ["Tubes", "Plate"] as const) {
    for (const [size, expected] of [["12000", 500], ["12001", 1500], ["20000", 1500]] as const) {
      const draft = order(container);
      draft.samples[0].templateLength = size;
      assert.equal(priceOrder(orderSchema.parse(draft)).subtotalCents, expected);
      assert.equal(priceOrder(orderSchema.parse(draft), DEFAULT_SCHEDULE).subtotalCents, expected);
    }
  }
});

test("Mixed Whole plasmid orders show each size tier and distinguish unknown-size estimates", () => {
  const draft = order();
  draft.samples = ["12000", "12001", "5000", ""].map((size, index) => ({ ...newPlasmidSample([], "Tubes"), sampleKey: `S${index + 1}`, tubeLabel: `T${index + 1}`, sampleName: `Plasmid-${index + 1}`, templateLength: size }));
  const price = priceOrder(orderSchema.parse(draft));
  assert.equal(price.subtotalCents, 3000);
  assert.deepEqual(price.lines.map(line => [line.quantity, line.unitCents, line.amountCents]), [[2, 500, 1000], [1, 1500, 1500], [1, 500, 500]]);
  assert.match(price.lines[2].description, /not confirmed.*estimate/i);
  assert.match(price.reviewReasons[0], /lab must confirm size and the applicable price/);
  const custom = { ...DEFAULT_SCHEDULE, rates: { ...DEFAULT_SCHEDULE.rates, "plasmid-tubes": 650, "plasmid-large-tubes": 1800 } };
  assert.equal(priceOrder(draft, custom).subtotalCents, 3750);
  draft.samples = [draft.samples[3]];
  assert.equal(priceOrder(orderSchema.parse(draft)).subtotalCents, 500);
  assert.equal(priceOrder(draft).reviewReasons.length, 1);
  draft.samples[0].templateLength = "12000.5";
  assert.equal(orderSchema.safeParse(draft).success, false);
  assert.match(priceOrder(draft).lines[0].description, /estimate/i);
});

test("Whole plasmid CSV and TSV mapping preserve data and ignore extra columns", () => {
  for (const delimiter of [",", "\t"]) {
    const text = [["Project", "Sample name", "Tube label", "Length (bp)", "Concentration", "Notes"], ["Ignored", "Clone A", "DNA-1", "5000", "100", "Keep note"], ["Ignored", "Clone B", "DNA-2", "", "", ""]].map(row => row.join(delimiter)).join("\n");
    const result = parseMappedPlasmid(inspectSangerSheet(text, "Tubes"), order());
    assert.deepEqual(result.errors, []);
    assert.equal(result.samples[0].templateLength, "5000");
    assert.equal(result.samples[0].concentration, "100");
    assert.equal(result.samples[0].notes, "Keep note");
    assert.equal(result.samples[1].tubeLabel, "DNA-2");
    assert.ok(!JSON.stringify(result.samples).includes("Ignored"));
    assert.ok(orderSchema.safeParse({ ...order(), samples: result.samples }).success);
  }
});

test("Whole plasmid templates preserve all wells across plate boundaries", () => {
  const draft = order("Plate");
  const sheet = inspectSangerSheet(plasmidTemplate("Plate", 97), "Plate");
  assert.ok(parseMappedPlasmid(sheet, draft).errors.length);
  sheet.rows.slice(1).forEach((row, i) => { row.cells[0] = `Plasmid-${i + 1}`; });
  const result = parseMappedPlasmid(sheet, draft);
  assert.deepEqual(result.errors, []);
  assert.deepEqual([result.samples[95].well, result.samples[96].well, result.samples[96].plateLabel], ["H12", "A1", "Plate-2"]);
  assert.equal(priceOrder({ ...draft, samples: result.samples }).subtotalCents, 48500);
});

test("Whole plasmid rejects conflicting labels, invalid numbers and unignored primer columns", () => {
  for (const text of ["Sample name,Tube label\nA,T1\nB,T1", "Sample name,Length (bp)\nA,1.5", "Sample name,Concentration\nA,-10", "Sample name,DNA type\nA,PCR", "Sample name,Primer\nA,T7"]) {
    const result = parseMappedPlasmid(inspectSangerSheet(text, "Tubes"), order());
    assert.ok(result.errors.length, text);
    assert.equal(result.samples.length, 0);
  }
});

test("Whole plasmid drafts remain isolated from Sanger and return to their own service after login", () => {
  const raw = JSON.stringify({ version: 1, savedAt: Date.now(), ownerId: null, draft: order(), step: "details" });
  const restored = readSavedOrder(raw, "Whole plasmid", "demo-customer");
  assert.ok(restored);
  assert.equal(restored.draft.samples[0].reactions.length, 0);
  assert.equal(readSavedOrder(raw, "Standard", null), null);
  const next = new URL(orderLoginUrl("Whole plasmid"), "http://localhost").searchParams.get("next");
  assert.equal(safeOrderReturn(next), "/orders/new?service=whole-plasmid");
});
