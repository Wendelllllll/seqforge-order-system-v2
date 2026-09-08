import assert from "node:assert/strict";
import { test } from "node:test";
import { blankOrder, blankReaction, blankSample, orderSchema, reactionCount } from "../src/lib/order-intake";
import { importSamples, readDelimited, templateCsv } from "../src/lib/order-import";

function validOrder() {
  const order = blankOrder();
  order.orderName = "Synthetic sequencing project";
  Object.assign(order.samples[0], { sampleName: "Clone 1", tubeLabel: "Tube-1" });
  Object.assign(order.samples[0].reactions[0], { primerSource: "SeqForge universal primer", primerName: "M13F" });
  return order;
}
test("one physical sample can have multiple sequencing reactions", () => {
  const order = validOrder();
  order.samples[0].reactions.push({ ...blankReaction(), primerName: "Reverse custom", primerConcentration: "5" });
  const parsed = orderSchema.parse(order);
  assert.equal(parsed.samples.length, 1);
  assert.equal(reactionCount(parsed.samples), 2);
});
test("rejects forged service, primer catalogue, numeric and preparation values", () => {
  for (const change of [
    (o: ReturnType<typeof validOrder>) => { o.samples[0].reactions[0].primerName = "Unknown universal"; },
    (o: ReturnType<typeof validOrder>) => { o.samples[0].concentration = "-10"; },
    (o: ReturnType<typeof validOrder>) => { o.samples[0].concentration = "1e999"; },
    (o: ReturnType<typeof validOrder>) => { o.samples[0].templateLength = "12.5"; },
    (o: ReturnType<typeof validOrder>) => { o.samples[0].preparation = "PCR cleanup requested"; },
  ]) { const order = validOrder(); change(order); assert.equal(orderSchema.safeParse(order).success, false); }
  assert.equal(orderSchema.safeParse({ ...validOrder(), priority: "Guaranteed in one hour" }).success, false);
});
test("requires real container labels, unique sample IDs and unique canonical wells per plate", () => {
  const order = validOrder();
  order.container = "Plate";
  Object.assign(order.samples[0], { plateLabel: "P1", well: "a01" });
  assert.equal(orderSchema.parse(order).samples[0].well, "A1");
  const second = structuredClone(order.samples[0]);
  Object.assign(second, { sampleKey: "S2", well: "A1" });
  order.samples.push(second);
  assert.equal(orderSchema.safeParse(order).success, false);
  second.plateLabel = "P2";
  assert.equal(orderSchema.safeParse(order).success, true);
  second.sampleKey = "s1";
  assert.equal(orderSchema.safeParse(order).success, false);
  second.sampleKey = "S2"; second.well = "I1";
  assert.equal(orderSchema.safeParse(order).success, false);
  order.container = "Tubes";
  assert.equal(orderSchema.safeParse(order).success, false);
});
test("stored and synthesized primers require appropriate details", () => {
  const order = validOrder(), r = order.samples[0].reactions[0];
  r.primerSource = "Stored at SeqForge";
  assert.equal(orderSchema.safeParse(order).success, false);
  r.storedPrimerReference = "STORED-DEMO-1";
  assert.equal(orderSchema.safeParse(order).success, true);
  r.primerSource = "SeqForge synthesized primer";
  r.primerSequence = "acgtnry";
  assert.equal(orderSchema.parse(order).samples[0].reactions[0].primerSequence, "ACGTNRY");
  for (const sequence of ["", "ACGT U", "ACGT-5mod"]) {
    r.primerSequence = sequence; assert.equal(orderSchema.safeParse(order).success, false);
  }
});
test("premixed and ready-to-load submissions use one included-primer reaction per location", () => {
  for (const mode of ["Pre-mixed", "Ready to load"] as const) {
    const order = validOrder();
    order.submissionMode = mode;
    assert.equal(orderSchema.safeParse(order).success, false);
    order.samples[0].reactions[0].primerSource = "Included in mix";
    assert.equal(orderSchema.safeParse(order).success, true);
    order.samples[0].reactions.push({ ...blankReaction(), primerSource: "Included in mix", primerName: "M13R" });
    assert.equal(orderSchema.safeParse(order).success, false);
  }
});
test("demo reaction cap applies across all samples", () => {
  const order = validOrder();
  order.samples[0].reactions = Array.from({ length: 250 }, () => structuredClone(order.samples[0].reactions[0]));
  assert.equal(orderSchema.safeParse(order).success, true);
  order.samples.push({ ...blankSample("S2"), sampleName: "Second", tubeLabel: "Tube-2", reactions: [order.samples[0].reactions[0]] });
  assert.equal(orderSchema.safeParse(order).success, false);
});
test("CSV reader supports BOM, quoted commas, escaped quotes, multiline fields and TSV", () => {
  assert.deepEqual(readDelimited('\uFEFFid,notes\r\nS1,"a,b ""quote""\r\nnext"\r\n'), [
    { line: 1, cells: ["id", "notes"] }, { line: 2, cells: ["S1", 'a,b "quote"\nnext'] },
  ]);
  assert.deepEqual(readDelimited("id\tnotes\nS1\thello\n")[1].cells, ["S1", "hello"]);
  assert.throws(() => readDelimited('id,notes\nS1,"oops'), /Row 2/);
  assert.throws(() => readDelimited('id,notes\nS1,"oops"extra'), /Row 2/);
});
test("all generated templates round-trip for tube/plate and every mode", () => {
  for (const container of ["Tubes", "Plate"] as const) for (const submissionMode of ["Standard", "Pre-mixed", "Ready to load"] as const) {
    const order = { ...validOrder(), container, submissionMode };
    const result = importSamples(templateCsv(container, submissionMode), order);
    assert.deepEqual(result.errors, []);
    assert.equal(result.samples.length, 1);
    assert.equal(orderSchema.safeParse({ ...order, samples: result.samples }).success, true);
  }
});
test("spreadsheet import groups primers, rejects metadata conflicts, and reports source row", () => {
  const header = "sampleKey,sampleName,tubeLabel,templateType,primerSource,primerName";
  const line = "S1,Clone 1,T1,Plasmid DNA,SeqForge universal primer,M13F";
  const good = importSamples([header, line, line.replace("M13F", "M13R")].join("\n"), validOrder());
  assert.deepEqual(good.errors, []);
  assert.equal(good.samples.length, 1); assert.equal(good.samples[0].reactions.length, 2);
  const bad = importSamples([header, line, line.replace("T1", "T2")].join("\n"), validOrder());
  assert.equal(bad.samples.length, 0); assert.match(bad.errors.join(), /Row 3.*conflicts/);
  const unknown = importSamples([header, line.replace("M13F", "unknown")].join("\n"), validOrder());
  assert.match(unknown.errors.join(), /Row 2.*catalogue/);
});
test("invalid imports never return a partial sample list", () => {
  const order = validOrder(), template = templateCsv("Tubes", "Standard");
  for (const input of [
    "", template.replace("primerName", "badHeader"),
    template.replace("sampleName", "sampleKey"),
    template + "wrong,column,count",
    "x".repeat(1_000_001),
  ]) { const result = importSamples(input, order); assert.ok(result.errors.length); assert.equal(result.samples.length, 0); }
  const original = structuredClone(order);
  importSamples(template, order);
  assert.deepEqual(order, original);
});
