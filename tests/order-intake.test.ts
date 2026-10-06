import assert from "node:assert/strict";
import { test } from "node:test";
import { blankOrder, blankReaction, blankSample, orderSchema, reactionCount } from "../src/lib/order-intake";
import { importSamples, readDelimited, templateCsv } from "../src/lib/order-import";

function validOrder() {
  const order = blankOrder();
  order.fulfillment = { deliveryMethod: "Pickup", pickupLocation: "Demo institute, building A, room 101", pickupInstructions: "Reception", contactName: "Demo Scientist", contactPhone: "555-0100", piName: "Demo PI", billingOrganization: "Demo University", billingContactName: "Demo Finance", billingEmail: "finance@demo.local", billingAddress: "1 Demo Way, Demo City", paymentMethod: "Invoice" };
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

test("V4 requires pickup and billing details and rejects unavailable payment methods", () => {
  const order = validOrder();
  assert.equal(orderSchema.safeParse({ ...order, fulfillment: undefined }).success, false);
  assert.equal(orderSchema.safeParse({ ...order, fulfillment: { ...order.fulfillment, billingEmail: "bad" } }).success, false);
  assert.equal(orderSchema.safeParse({ ...order, fulfillment: { ...order.fulfillment, paymentMethod: "Credit card" } }).success, false);
  assert.equal(orderSchema.safeParse({ ...order, fulfillment: { ...order.fulfillment, pickupLocation: "" } }).success, false);
  assert.equal(orderSchema.safeParse({ ...order, fulfillment: { ...order.fulfillment, deliveryMethod: "Ship to SeqForge", pickupLocation: "" } }).success, true);
  order.fulfillment.paymentMethod = "Purchase order";
  assert.equal(orderSchema.safeParse(order).success, false);
  order.poNumber = "PO-123";
  assert.equal(orderSchema.safeParse(order).success, true);
});

test("V4 CSV preserves detailed sample and primer data with incomplete order details", () => {
  const header = "sampleKey,sampleName,plateLabel,well,templateType,templateLength,concentration,preparation,notes,primerSource,primerName,primerConcentration,storedPrimerReference,primerSequence,purification,synthesisScale,modification5,modification3,modificationInternal,specialProtocol";
  const row = 'S1,Clone,P1,a01,Plasmid DNA,3200,100,None requested,"notes, kept",SeqForge synthesized primer,Custom-F,,,acgtn,HPLC,100 nmol,5mod,3mod,internal,GC-rich';
  const result = importSamples(header + "\n" + row, { ...blankOrder(), container: "Plate" });
  assert.deepEqual(result.errors, []);
  assert.equal(result.samples[0].well, "A1");
  assert.equal(result.samples[0].notes, "notes, kept");
  assert.equal(result.samples[0].templateLength, "3200");
  assert.equal(result.samples[0].concentration, "100");
  const reaction = result.samples[0].reactions[0];
  assert.equal(reaction.primerSequence, "ACGTN");
  assert.equal(reaction.purification, "HPLC");
  assert.equal(reaction.modificationInternal, "internal");
  assert.equal(reaction.specialProtocol, "GC-rich");
  assert.ok(!readDelimited(templateCsv("Tubes", "Standard"))[0].cells.includes("well"));
  assert.ok(!readDelimited(templateCsv("Plate", "Standard"))[0].cells.includes("tubeLabel"));
  assert.ok(importSamples(templateCsv("Plate", "Standard"), validOrder()).errors.some((e) => e.includes("tubeLabel")));
});

test("bulk plate entry generates 96 distinct locations with correct well ordering and valid order data", async () => {
  const { addPlate } = await import("../src/lib/plate-intake");
  for (const direction of ["column", "row"] as const) {
    for (const mode of ["Standard", "Pre-mixed", "Ready to load"] as const) {
      const order = { ...validOrder(), container: "Plate" as const, submissionMode: mode, samples: [blankSample()] };
      const samples = addPlate(order, { label: "P1", count: 96, direction, prefix: "Clone", primerName: "Custom-F" });
      assert.equal(samples.length, 96);
      assert.equal(samples[0].well, "A1");
      assert.equal(samples[1].well, direction === "column" ? "B1" : "A2");
      assert.equal(samples[95].well, "H12");
      assert.equal(new Set(samples.map(s => s.well)).size, 96);
      assert.equal(orderSchema.safeParse({ ...order, samples }).success, true);
      samples[0].reactions[0].primerName = "Changed";
      assert.equal(samples[1].reactions[0].primerName, "Custom-F");
    }
  }
});

test("bulk plate entry preserves existing work and rejects duplicate plates and reaction overflow", async () => {
  const { addPlate } = await import("../src/lib/plate-intake");
  const order = { ...validOrder(), container: "Plate" as const, samples: [blankSample()] };
  const options = { label: "P1", count: 96, direction: "column" as const, prefix: "Clone", primerName: "Custom-F" };
  order.samples = addPlate(order, options);
  assert.throws(() => addPlate(order, { ...options, label: " p1 " }), /already exists/);
  const original = structuredClone(order.samples);
  order.samples = addPlate(order, { ...options, label: "P2" });
  assert.equal(order.samples.length, 192);
  assert.deepEqual(order.samples.slice(0, 96), original);
  assert.equal(new Set(order.samples.map(s => s.sampleKey)).size, 192);
  assert.throws(() => addPlate(order, { ...options, label: "P3" }), /250/);
  assert.throws(() => addPlate(order, { ...options, count: 0 }), /1–96/);
});

test("96-well CSV import preserves every sample, well and primer and rejects duplicate locations atomically", () => {
  const order = { ...validOrder(), container: "Plate" as const };
  const header = 'sampleKey,sampleName,plateLabel,well,templateType,primerSource,primerName';
  const rows = Array.from({ length: 96 }, (_, i) => `S${i + 1},Clone-${i + 1},P1,${'ABCDEFGH'[i % 8]}${Math.floor(i / 8) + 1},Plasmid DNA,Customer supplied,Primer-${i + 1}`);
  const result = importSamples([header, ...rows].join('\r\n'), order);
  assert.deepEqual(result.errors, []);
  assert.equal(result.samples.length, 96);
  for (let i = 0; i < 96; i++) {
    assert.equal(result.samples[i].sampleName, `Clone-${i + 1}`);
    assert.equal(result.samples[i].well, `${'ABCDEFGH'[i % 8]}${Math.floor(i / 8) + 1}`);
    assert.equal(result.samples[i].reactions[0].primerName, `Primer-${i + 1}`);
  }
  rows[95] = rows[95].replace('H12', 'A1');
  const invalid = importSamples([header, ...rows].join('\n'), order);
  assert.equal(invalid.samples.length, 0);
  assert.ok(invalid.errors.some(error => error.includes('already used')));
});

test("original live-site CSV and TXT import with original headers and trailing empty columns", async () => {
  const { readFileSync } = await import("node:fs");
  const order = { ...validOrder(), container: "Plate" as const };
  for (const filename of ["sample_dnaForm.csv", "sample_text_dnaForm.txt"]) {
    const text = readFileSync(`public/templates/${filename}`, "utf8");
    const ambiguous = importSamples(text, order);
    assert.equal(ambiguous.samples.length, 0);
    assert.ok(ambiguous.errors.some(e => e.includes("Both My primers")));
    const result = importSamples(text, order, "universal");
    assert.deepEqual(result.errors, []);
    assert.equal(result.samples.length, 2);
    assert.equal(result.samples[0].plateLabel, "44");
    assert.equal(result.samples[0].well, "A1");
    assert.equal(result.samples[1].well, "B1");
    assert.equal(result.samples[0].sampleName, "5dna");
    assert.equal(result.samples[0].reactions[0].primerSource, "SeqForge universal primer");
    assert.equal(result.samples[0].reactions[0].primerName, "AOX1-Rev");
    assert.equal(result.samples[0].concentration, "77");
    const custom = importSamples(text, order, "customer");
    assert.deepEqual(custom.errors, []);
    assert.equal(custom.samples[0].reactions[0].primerSource, "Customer supplied");
  }
});

test("legacy imports preserve preparation requests, protocol, repeated reactions and reject lost data", async () => {
  const { LEGACY_COLUMNS } = await import("../src/lib/legacy-order-import");
  const header = LEGACY_COLUMNS.join(',');
  const order = { ...validOrder(), container: "Plate" as const };
  const first = '1,A1,P1,Clone 1,Plasmid - Needs Miniprep,3200,50,Custom-F,5,,GC-Rich';
  const second = '2,A1,P1,Clone 1,Plasmid - Needs Miniprep,3200,50,Custom-R,5,,Di Nucleotide Repeat';
  const result = importSamples([header, first, second].join('\n'), order);
  assert.deepEqual(result.errors, []);
  assert.equal(result.samples.length, 1);
  assert.equal(result.samples[0].reactions.length, 2);
  assert.equal(result.samples[0].preparation, "Miniprep requested");
  assert.equal(result.samples[0].reactions[1].specialProtocol, "Dinucleotide repeat");
  for (const bad of [first.replace('Plasmid - Needs Miniprep', 'Nanopore Sequencing'), first + ',DATA', first.replace('GC-Rich','Unknown protocol')]) {
    const invalid = importSamples([header, bad].join('\n'), order);
    assert.equal(invalid.samples.length, 0);
    assert.ok(invalid.errors.length);
  }
  assert.ok(importSamples([header, first, first].join('\n'), order).errors.length);
  assert.ok(importSamples([header, first, second.replace('Clone 1', 'Different DNA')].join('\n'), order).errors.length);
  assert.ok(importSamples([header, first].join('\n'), { ...order, submissionMode: "Pre-mixed" }).errors.length);
});

test("legacy template handles tube labels, blank premix primers and original compact paste headings", async () => {
  const { LEGACY_COLUMNS } = await import("../src/lib/legacy-order-import");
  const order = validOrder();
  const compact = '#,wellID,Tubelabel,DNAName,DNAtype,TemplateLengthBP,Conc,Myprimer,Conc,SeqForgePrimer,Specialprotocol';
  const row = '1,A1,Tube-1,Clone 1,PCR - Needs cleanup,500,20,Custom,5,,None Known';
  const result = importSamples(compact+'\n'+row, order);
  assert.deepEqual(result.errors, []);
  assert.equal(result.samples[0].tubeLabel, 'Tube-1');
  assert.equal(result.samples[0].preparation, 'PCR cleanup requested');
  const premix = importSamples(LEGACY_COLUMNS.join(',')+'\n1,A1,Tube-1,Clone 1,Plasmid,,,,,,None Known', {...order, submissionMode:'Pre-mixed'});
  assert.deepEqual(premix.errors, []);
  assert.equal(premix.samples[0].reactions[0].primerSource, 'Included in mix');
});
