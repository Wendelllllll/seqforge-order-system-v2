import assert from "node:assert/strict";
import test from "node:test";
import { blankOrder, blankReaction, orderSchema, sampleLimit } from "../src/lib/order-intake";
import { blankFragmentSettings, FRAGMENT_MAX_SAMPLES, fragmentSettingsSchema, isFragmentProductionBlocked } from "../src/lib/fragment-analysis";
import { fragmentTemplate, newFragmentSample, parseMappedFragment } from "../src/lib/fragment-entry";
import { inspectSangerSheet } from "../src/lib/sanger-column-mapping";
import { readDelimited } from "../src/lib/order-import";
import { priceOrder, pricingSchema } from "../src/lib/pricing";
import { orderReturnPath, readSavedOrder } from "../src/lib/order-resume";
import { parseOrderFilters } from "../src/lib/admin-order-filters";

export function fragmentDraft() {
  return { ...blankOrder(), service: "FRAGMENT_ANALYSIS" as const, submissionMode: "Fragment analysis" as const,
    fragmentAnalysis: { ...blankFragmentSettings(), dyes: "6-FAM, HEX", minSize: "100", maxSize: "500" },
    fulfillment: { ...blankOrder().fulfillment, deliveryMethod: "Ship to SeqForge" as const, contactName: "QA Scientist", contactPhone: "555-0100", billingOrganization: "Demo Lab", billingContactName: "Demo Finance", billingEmail: "finance@example.test", billingAddress: "1 Test Road" },
    samples: [{ ...newFragmentSample([], "Tubes"), sampleName: "Fragment-1" }],
  };
}
test("Fragment Analysis is a separate quote-pending service without Sanger primers", () => {
  const draft = fragmentDraft();
  assert.ok(orderSchema.safeParse(draft).success);
  const price = pricingSchema.parse(priceOrder(draft));
  assert.equal(price.subtotalCents, null); assert.equal(price.pendingQuote, true); assert.deepEqual(price.lines, []);
  assert.equal(orderSchema.safeParse({ ...draft, service: "SANGER" }).success, false);
  assert.equal(orderSchema.safeParse({ ...draft, submissionMode: "Pre-mixed" }).success, false);
  assert.equal(orderSchema.safeParse({ ...draft, samples: [{ ...draft.samples[0], reactions: [{ ...blankReaction(), primerName: "T7" }] }] }).success, false);
  for (const status of ["PROCESSING", "SEQUENCED", "QC", "COMPLETED"]) assert.ok(isFragmentProductionBlocked(draft.service, status));
  assert.equal(isFragmentProductionBlocked("SANGER", "PROCESSING"), false);
});
test("analysis requirements reject invalid or reversed ranges without inventing dye availability", () => {
  const settings = fragmentDraft().fragmentAnalysis;
  for (const invalid of [{ dyes: " " }, { minSize: "0" }, { minSize: "100 bp" }, { maxSize: "99" }, { maxSize: "1.2" }]) assert.equal(fragmentSettingsSchema.safeParse({ ...settings, ...invalid }).success, false);
  assert.ok(fragmentSettingsSchema.safeParse({ ...settings, dyes: "Unknown", sizeStandard: "" }).success);
  assert.equal(orderSchema.safeParse({ ...fragmentDraft(), priority: "Same day requested" }).success, false);
});
test("eight plates round-trip through CSV and Excel with all names, positions and notes", () => {
  const rows = readDelimited(fragmentTemplate("Plate", 768)).map(row => row.cells);
  for (let i = 1; i < rows.length; i++) { rows[i][0] = `Fragment-${i}`; rows[i][3] = i === 768 ? "Final sample" : ""; }
  for (const delimiter of [",", "\t", ";"]) {
    const text = rows.map(row => row.map(cell => `"${cell.replaceAll('"', '""')}"`).join(delimiter)).join("\r\n");
    const result = parseMappedFragment(inspectSangerSheet(text, "Plate", "FRAGMENT_ANALYSIS"), { ...fragmentDraft(), container: "Plate" });
    assert.deepEqual(result.errors, []); assert.equal(result.samples.length, 768);
    assert.equal(result.samples[767].plateLabel, "Plate-8"); assert.equal(result.samples[767].well, "H12"); assert.equal(result.samples[767].notes, "Final sample");
    assert.ok(result.samples.every(s => s.reactions.length === 0));
    assert.ok(orderSchema.safeParse({ ...fragmentDraft(), container: "Plate", samples: result.samples }).success);
  }
  assert.equal(sampleLimit("FRAGMENT_ANALYSIS"), FRAGMENT_MAX_SAMPLES);
  assert.equal(sampleLimit("WHOLE_PLASMID"), 250);
});
test("fragment imports require explicit extra-column decisions and reject duplicate wells", () => {
  const order = { ...fragmentDraft(), container: "Plate" as const };
  const sheet = inspectSangerSheet("Sample name,Plate label,Well,Primer\nA,P1,A1,T7\nB,P1,A1,T3", "Plate", order.service);
  assert.ok(parseMappedFragment(sheet, order).errors.some(e => e.includes("ignore or remap")));
  sheet.columns[3] = "";
  assert.ok(parseMappedFragment(sheet, order).errors.some(e => e.includes("already used")));
  sheet.rows[2].cells[2] = "A2";
  assert.deepEqual(parseMappedFragment(sheet, order).errors, []);
  sheet.columns[2] = "";
  assert.ok(parseMappedFragment(sheet, order).errors.some(e => e.includes("Plate label and Well")));
});
test("custom plate labels preserve all 1536 samples with short unique IDs in CSV, TSV and semicolon files", () => {
  const rows = readDelimited(fragmentTemplate("Plate", FRAGMENT_MAX_SAMPLES)).map(row => row.cells);
  rows.slice(1).forEach((row, i) => { row[0] = `Custom-${i + 1}`; row[1] = `Customer rack ${Math.floor(i / 96) + 1}`; });
  for (const delimiter of [",", "\t", ";"]) {
    const result = parseMappedFragment(inspectSangerSheet(rows.map(row => row.join(delimiter)).join("\n"), "Plate", "FRAGMENT_ANALYSIS"), { ...fragmentDraft(), container: "Plate" });
    assert.deepEqual(result.errors, []);
    assert.equal(result.samples.length, 1536);
    assert.equal(new Set(result.samples.map(s => s.sampleKey.toLowerCase())).size, 1536);
    assert.ok(result.samples.every(s => s.sampleKey.length <= 100));
    result.samples.forEach((sample, i) => {
      assert.equal(sample.sampleName, rows[i + 1][0]);
      assert.equal(sample.plateLabel, rows[i + 1][1]);
      assert.equal(sample.well, rows[i + 1][2]);
    });
  }
});
test("custom tubes and supplied IDs remain intact when generating the next Fragment sample", () => {
  const text = "Sample name,Tube label\n" + Array.from({ length: 768 }, (_, i) => `DNA-${i + 1},Custom tube ${i + 1}`).join("\n");
  const result = parseMappedFragment(inspectSangerSheet(text, "Tubes", "FRAGMENT_ANALYSIS"), fragmentDraft());
  assert.deepEqual(result.errors, []); assert.equal(result.samples.length, 768);
  assert.equal(result.samples[767].tubeLabel, "Custom tube 768");
  const existing = [{ ...result.samples[0], sampleKey: "f3" }, { ...result.samples[1], sampleKey: "F4" }];
  const next = newFragmentSample(existing, "Tubes");
  assert.equal(next.sampleKey, "F5"); assert.deepEqual(existing.map(s => s.sampleKey), ["f3", "F4"]);
});
test("unfinished fragment drafts retain settings and remain isolated from Sanger", () => {
  const now = Date.now();
  const raw = JSON.stringify({ version: 1, savedAt: now, ownerId: null, draft: { ...fragmentDraft(), fragmentAnalysis: blankFragmentSettings() } });
  const saved = readSavedOrder(raw, "Fragment analysis", null, now);
  assert.ok(saved); assert.deepEqual(saved.draft.fragmentAnalysis, blankFragmentSettings());
  assert.equal(readSavedOrder(raw, "Pre-mixed", null, now), null);
  assert.equal(orderReturnPath("Fragment analysis"), "/orders/new?service=fragment-analysis");
  assert.equal(parseOrderFilters({ service: "FRAGMENT_ANALYSIS", mode: "Fragment analysis" }).service, "FRAGMENT_ANALYSIS");
});
