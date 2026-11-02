import assert from "node:assert/strict";
import test from "node:test";
import { blankOrder, blankReaction, issueLabel, reactionCount, reactionSchema } from "../src/lib/order-intake";
import { readDelimited } from "../src/lib/order-import";
import { hasPrimerCommas, inspectSangerSheet, parseMappedSanger, sangerMappingOptions } from "../src/lib/sanger-column-mapping";
import { readSavedOrder } from "../src/lib/order-resume";
import { formatDate, formatDateTime } from "../src/lib/orders";

test("mapping choices follow tubes, plates, submission mode and primer source", () => {
  const tube = { container: "Tubes" as const, standard: true, source: "Customer supplied" as const };
  const fields = (context: Parameters<typeof sangerMappingOptions>[0], extra = false) => sangerMappingOptions(context, extra).map(([field]) => field);
  assert.deepEqual(fields(tube), ["", "sampleName", "tubeLabel", "templateType", "templateLength", "concentration", "primerName", "primerConcentration", "notes"]);
  const plate = fields({ ...tube, container: "Plate" });
  assert.ok(plate.includes("plateLabel") && plate.includes("well") && !plate.includes("tubeLabel"));
  const stored = fields({ ...tube, source: "Stored at SeqForge" });
  assert.ok(stored.includes("storedPrimerReference") && !stored.includes("primerConcentration"));
  assert.ok(!fields({ ...tube, source: "SeqForge universal primer" }).includes("storedPrimerReference"));
  const premixed = fields({ ...tube, standard: false, source: "Included in mix" }, true);
  for (const field of ["primerSource", "primerConcentration", "storedPrimerReference", "preparation", "customerPrimer", "universalPrimer"] as const) assert.ok(!premixed.includes(field));
  assert.ok(fields(tube, true).includes("specialProtocol"));
  for (const field of ["primerSequence", "purification", "synthesisScale", "modification5", "modification3", "modificationInternal"] as const) assert.ok(!fields(tube, true).includes(field));
  assert.ok(sangerMappingOptions(tube, false, "primerSequence").some(([field]) => field === "primerSequence"), "Unsupported recognized columns remain visible for an explicit decision");
});

test("Stored source works in CSV and Excel; missing references and retired sources cannot slip through", () => {
  for (const separator of [",", "\t"]) {
    const text = [["Sample name", "Tube label", "Primer", "Stored primer reference"], ["Clone", "T1", "Custom-F", "REF-F"], ["Clone", "T1", "Custom-R", "REF-R"]].map(row => row.join(separator)).join("\n");
    const result = parseMappedSanger(inspectSangerSheet(text, "Tubes"), blankOrder(), "Stored at SeqForge");
    assert.deepEqual(result.errors, []);
    assert.equal(result.samples.length, 1);
    assert.deepEqual(result.samples[0].reactions.map(r => r.storedPrimerReference), ["REF-F", "REF-R"]);
    const missing = parseMappedSanger(inspectSangerSheet(text.replace("REF-R", ""), "Tubes"), blankOrder(), "Stored at SeqForge");
    assert.ok(missing.errors.some(error => error.includes("stored-primer reference")));
  }
  const mixed = inspectSangerSheet("Sample name,Tube label,Primer,Primer source,Stored primer reference\nA,T1,T7,Universal,\nB,T2,Custom,stored,REF-1", "Tubes");
  const result = parseMappedSanger(mixed, blankOrder(), "column");
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.samples.map(s => s.reactions[0].primerSource), ["SeqForge universal primer", "Stored at SeqForge"]);
  const synthesis = inspectSangerSheet("Sample name,Primer,Primer source,Primer sequence\nA,Custom,SeqForge synthesized primer,ACGT", "Tubes");
  assert.ok(parseMappedSanger(synthesis, blankOrder(), "column").errors.some(error => error.includes("Explicitly ignore or remap")));
  synthesis.columns[3] = "";
  assert.ok(parseMappedSanger(synthesis, blankOrder(), "column").errors.length);
});

test("irrelevant mapped data is never silently discarded", () => {
  const sheet = inspectSangerSheet("Sample name,Primer,Well\nA,T7,A1", "Tubes");
  assert.ok(parseMappedSanger(sheet, blankOrder(), "Customer supplied").errors.some(error => error.includes("Well position")));
  sheet.columns[2] = "";
  assert.deepEqual(parseMappedSanger(sheet, blankOrder(), "Customer supplied").errors, []);
  const special = inspectSangerSheet("Sample name,Primer,Preparation,Special protocol\nA,T7,Miniprep requested,GC-rich", "Tubes");
  const result = parseMappedSanger(special, blankOrder(), "Customer supplied");
  assert.deepEqual(result.errors, []);
  assert.equal(result.samples[0].preparation, "Miniprep requested");
  assert.equal(result.samples[0].reactions[0].specialProtocol, "GC-rich");
});

test("regional semicolon CSV preserves quoted notes, commas, newlines and primer lists", () => {
  const text = '\uFEFF\r\nSample name;Tube label;Primer;Notes\r\n"Clone, A";T1;"t7;t3";"note; one\nsecond line"';
  const sheet = inspectSangerSheet(text, "Tubes");
  const result = parseMappedSanger(sheet, blankOrder(), "SeqForge universal primer");
  assert.deepEqual(result.errors, []);
  assert.equal(result.samples.length, 1);
  assert.equal(reactionCount(result.samples), 2);
  assert.equal(result.samples[0].sampleName, "Clone, A");
  assert.equal(result.samples[0].notes, "note; one\nsecond line");
  assert.deepEqual(result.samples[0].reactions.map(r => r.primerName), ["T7", "T3"]);
  assert.equal(sheet.rows[1].line, 3);
  assert.throws(() => readDelimited('Sample name;Primer\nA;"T7'), /Row 2: unclosed/);
});

test("commas in primer cells require a decision for CSV and Excel paste", () => {
  for (const text of ['Sample name,Tube label,Primer\nA,T1,"T7,T3"', 'Sample name\tTube label\tPrimer\nA\tT1\tT7,T3']) {
    const sheet = inspectSangerSheet(text, "Tubes");
    assert.ok(hasPrimerCommas(sheet));
    const blocked = parseMappedSanger(sheet, blankOrder(), "Customer supplied");
    assert.deepEqual(blocked.samples, []);
    assert.match(blocked.errors[0], /Confirm whether commas separate primers/);
    const split = parseMappedSanger({ ...sheet, primerCommaMode: "split" }, blankOrder(), "SeqForge universal primer");
    assert.deepEqual(split.errors, []);
    assert.deepEqual(split.samples[0].reactions.map(r => r.primerName), ["T7", "T3"]);
    assert.equal(reactionCount(split.samples), 2);
    const literal = parseMappedSanger({ ...sheet, primerCommaMode: "keep" }, blankOrder(), "Customer supplied");
    assert.deepEqual(literal.errors, []);
    assert.equal(literal.samples[0].reactions[0].primerName, "T7,T3");
    assert.equal(reactionCount(literal.samples), 1);
  }
});

test("primer separator choice covers old columns and refuses two premixed reactions", () => {
  const sheet = inspectSangerSheet('Sample name,My primers,SeqForge Primers\nA,,"t7,t3"', "Tubes");
  assert.ok(hasPrimerCommas(sheet));
  assert.ok(parseMappedSanger(sheet, blankOrder(), "primer-columns").errors.length);
  assert.equal(reactionCount(parseMappedSanger({ ...sheet, primerCommaMode: "split" }, blankOrder(), "primer-columns").samples), 2);
  const mix = inspectSangerSheet('Sample name,Primer\nA,"T7,T3"', "Tubes");
  assert.match(parseMappedSanger({ ...mix, primerCommaMode: "split" }, { ...blankOrder(), submissionMode: "Pre-mixed" }, "Included in mix").errors[0], /one reaction per tube or well/);
  const noPrimerColumn = { ...mix, columns: ["sampleName", "notes"] };
  assert.equal(hasPrimerCommas(noPrimerColumn), false);
});

test("existing CSV and TSV keep semicolon primer groups and literal cell punctuation", () => {
  for (const delimiter of [",", "\t"]) {
    const text = [['Sample name','Tube label','Primer','Notes'],['Clone','T1','T7;T3;M13F;M13R;SP6','x;y;z']].map(row => row.join(delimiter)).join('\n');
    const result = parseMappedSanger(inspectSangerSheet(text, "Tubes"), blankOrder(), "SeqForge universal primer");
    assert.deepEqual(result.errors, []);
    assert.equal(reactionCount(result.samples), 5);
    assert.equal(result.samples[0].notes, 'x;y;z');
  }
});

test("universal catalogue names normalize case without changing customer names or accepting unknown primers", () => {
  for (const [input, expected] of [["t7","T7"],["m13f-20","M13F-20"],["aox1-for","AOX1-For"],["bghREV","BGHrev"]]) {
    const reaction = { ...blankReaction(), primerName: input, primerSource: "SeqForge universal primer" };
    assert.equal(reactionSchema.parse(reaction).primerName, expected);
    assert.equal(reactionSchema.parse({ ...reaction, primerSource: "Customer supplied" }).primerName, input);
  }
  assert.equal(reactionSchema.safeParse({ ...blankReaction(), primerName: "t7-unknown", primerSource: "SeqForge universal primer" }).success, false);
});

test("customer validation labels identify the field, sample and primer in plain language", () => {
  assert.equal(issueLabel({path:["fulfillment","billingContactName"],message:"Required."}), "Billing contact name: Required.");
  assert.equal(issueLabel({path:["fulfillment","dropboxId"],message:"Choose a location."}), "Dropbox location: Choose a location.");
  assert.equal(issueLabel({path:["samples",3,"tubeLabel"],message:"Already used."}), "Sample 4 · Tube label: Already used.");
  assert.equal(issueLabel({path:["samples",767,"reactions",1,"primerSource"],message:"Choose a source."}), "Sample 768 · Primer 2 · Primer source: Choose a source.");
  const result = parseMappedSanger(inspectSangerSheet('Sample name,Primer\nA,', "Tubes"), blankOrder(), "Customer supplied");
  assert.match(result.errors[0], /Row 2 · Primer name:/);
  assert.doesNotMatch(result.errors[0], /primerName/);
});

test("primer comma choice survives draft restoration and older drafts remain valid", () => {
  const now = Date.now();
  const base = { version:1, savedAt:now, ownerId:null, draft:blankOrder(), mappingSheet:inspectSangerSheet('Sample name,Primer\nA,"T7,T3"', "Tubes") };
  for (const mode of ["split", "keep"] as const) {
    const restored = readSavedOrder(JSON.stringify({ ...base, mappingSheet:{ ...base.mappingSheet, primerCommaMode:mode } }), "Standard", null, now);
    assert.equal(restored?.mappingSheet?.primerCommaMode, mode);
  }
  assert.ok(readSavedOrder(JSON.stringify(base), "Standard", null, now));
  const stored = readSavedOrder(JSON.stringify({ ...base, pasteSource: "Stored at SeqForge" }), "Standard", null, now);
  assert.equal(stored?.pasteSource, "Stored at SeqForge");
  const legacy = blankOrder();
  Object.assign(legacy.samples[0].reactions[0], { primerSource: "SeqForge synthesized primer", primerSequence: "ACGT" });
  const restoredLegacy = readSavedOrder(JSON.stringify({ ...base, draft: legacy }), "Standard", null, now);
  assert.equal(restoredLegacy?.draft.samples[0].reactions[0].primerSequence, "ACGT", "Retired-source drafts are retained for correction, not erased");
});

test("order and draft dates use labelled Pacific time including the daylight saving boundary", () => {
  assert.match(formatDateTime(new Date('2026-11-02T11:18:00Z')), /3:18 AM PST/);
  assert.match(formatDateTime(new Date('2026-07-02T11:18:00Z')), /4:18 AM PDT/);
  assert.match(formatDateTime(new Date('2026-11-01T08:30:00Z')), /1:30 AM PDT/);
  assert.match(formatDateTime(new Date('2026-11-01T09:30:00Z')), /1:30 AM PST/);
  assert.equal(formatDate(new Date('2026-11-02T01:00:00Z')), 'Nov 1, 2026');
});
