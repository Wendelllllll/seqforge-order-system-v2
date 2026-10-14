import assert from "node:assert/strict";
import test from "node:test";
import { blankOrder, orderSchema, reactionCount } from "../src/lib/order-intake";
import { appendSangerSamples, newSangerSample, parseSangerPaste, verticalWell } from "../src/lib/sanger-entry";
import { priceOrder } from "../src/lib/pricing";
import { simpleOrderTemplate } from "../src/lib/simple-order-template";
import { readDelimited } from "../src/lib/order-import";
import { inspectSangerSheet, parseMappedSanger, suggestMapping } from "../src/lib/sanger-column-mapping";

test("Ready to load supports manual entry without primer or DNA measurements", () => {
  const sample = { ...newSangerSample([], "Tubes", "Ready to load"), sampleName: "Completed reaction" };
  const order = { ...blankOrder(), submissionMode: "Ready to load" as const, samples: [sample] };
  const parsed = orderSchema.safeParse(order);
  assert.equal(parsed.success, false, "Delivery and billing still need completion");
  if (!parsed.success) assert.deepEqual(parsed.error.issues.filter(issue => issue.path[0] === "samples"), []);
  assert.equal(reactionCount(order.samples), 1);
  assert.equal(priceOrder(order).subtotalCents, 350);
});

test("Ready to load CSV and Excel mapping preserve names, locations, optional primers and notes", () => {
  const order = { ...blankOrder(), submissionMode: "Ready to load" as const };
  for (const separator of [",", "\t"]) {
    const text = [["Project", "Reaction name", "Tube label", "Primer", "Notes"], ["Ignore me", "Ready A", "R1", "T7", "Batch 1"], ["Ignore me", "Ready B", "R2", "", "Batch 2"]].map(row => row.join(separator)).join("\n");
    const sheet = inspectSangerSheet(text, "Tubes");
    assert.match(parseMappedSanger(sheet, order, "").errors[0], /completed sequencing reaction/);
    const result = parseMappedSanger(sheet, order, "Included in mix");
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.samples.map(sample => [sample.sampleName, sample.tubeLabel, sample.notes]), [["Ready A", "R1", "Batch 1"], ["Ready B", "R2", "Batch 2"]]);
    assert.equal(result.samples[1].reactions[0].primerName, "Included in mix");
    assert.equal(priceOrder({ ...order, samples: result.samples }).subtotalCents, 700);
    assert.ok(!JSON.stringify(result.samples).includes("Ignore me"));
  }
});

test("Ready to load templates round-trip tubes and plates beyond 96 wells", () => {
  for (const container of ["Tubes", "Plate"] as const) {
    const order = { ...blankOrder(), submissionMode: "Ready to load" as const, container };
    const sheet = inspectSangerSheet(simpleOrderTemplate(container, 97, "Ready to load"), container);
    assert.ok(parseMappedSanger(sheet, order, "Included in mix").errors.length, "Blank template is not an order");
    sheet.rows.slice(1).forEach((row, index) => { row.cells[0] = `Ready-${index + 1}`; });
    const result = parseMappedSanger(sheet, order, "Included in mix");
    assert.deepEqual(result.errors, []);
    assert.equal(reactionCount(result.samples), 97);
    if (container === "Plate") assert.deepEqual([result.samples[96].plateLabel, result.samples[96].well], ["Plate-2", "A1"]);
    else assert.equal(result.samples[96].tubeLabel, "Tube-97");
  }
});

test("Ready to load rejects duplicate locations, multiple primers and separate preparation requests", () => {
  const order = { ...blankOrder(), submissionMode: "Ready to load" as const };
  for (const text of [
    "Sample name,Tube label\nA,R1\nB,R1",
    "Sample name,Primer\nA,T7;M13R",
    "Sample name,Primer source\nA,Customer supplied",
    "Sample name,Preparation\nA,Miniprep requested",
  ]) assert.ok(parseMappedSanger(inspectSangerSheet(text, "Tubes"), order, "Included in mix").errors.length, text);
});

test("Excel TSV groups multiple primers into one physical sample and prices reactions", () => {
  const order = blankOrder();
  const result = parseSangerPaste("Sample name\tLength (bp)\tConcentration\tPrimer\nClone A\t3200\t100\tT7;M13R\nClone B\t4100\t80\tT7", order, "SeqForge universal primer");
  assert.deepEqual(result.errors, []);
  assert.equal(result.samples.length, 2);
  assert.equal(reactionCount(result.samples), 3);
  assert.equal(priceOrder({ ...order, samples: result.samples }).subtotalCents, 1650);
});

test("Headerless clipboard input and quoted sample names preserve data", () => {
  const result = parseSangerPaste('"Clone, A"\t3200\t100\tMy-F', blankOrder());
  assert.deepEqual(result.errors, []);
  assert.equal(result.samples[0].sampleName, "Clone, A");
  assert.equal(result.samples[0].reactions[0].primerSource, "Customer supplied");
});

test("Repeated explicit location groups primers, conflicting DNA details are rejected", () => {
  const header = "Sample name\tTube label\tPrimer\n";
  const good = parseSangerPaste(header + "Clone A\tDNA-1\tF\nClone A\tDNA-1\tR", blankOrder());
  assert.deepEqual(good.errors, []);
  assert.equal(good.samples.length, 1);
  assert.equal(reactionCount(good.samples), 2);
  assert.ok(parseSangerPaste(header + "Clone A\tDNA-1\tF\nDifferent clone\tDNA-1\tR", blankOrder()).errors.length);
});

test("Premixed rows retain names but never accept multiple primers or separate primer sources", () => {
  const order = { ...blankOrder(), submissionMode: "Pre-mixed" as const };
  const result = parseSangerPaste("Sample name\nMix A\nMix B", order);
  assert.deepEqual(result.errors, []);
  assert.equal(reactionCount(result.samples), 2);
  assert.ok(result.samples.every(s => s.reactions[0].primerSource === "Included in mix"));
  assert.ok(parseSangerPaste("Mix A\t3200\t100\tF;R", order).errors.length);
  assert.ok(parseSangerPaste("Sample name\tPrimer source\nMix A\tSeqForge universal primer", order).errors.length);
});

test("Plate generation is vertical, crosses plates safely, and preserves explicit positions", () => {
  assert.deepEqual([0, 1, 7, 8, 95, 96].map(verticalWell), ["A1", "B1", "H1", "A2", "H12", "A1"]);
  const order = { ...blankOrder(), container: "Plate" as const };
  const text = "Sample name\tPrimer\n" + Array.from({ length: 97 }, (_, i) => `DNA-${i + 1}\tT7`).join("\n");
  const result = parseSangerPaste(text, order);
  assert.deepEqual(result.errors, []);
  assert.equal(result.samples[96].plateLabel, "Plate-2");
  assert.equal(result.samples[96].well, "A1");
  const explicit = parseSangerPaste("Sample name\tPlate label\tWell\tPrimer\nDNA\tMyPlate\tC09\tT7", order);
  assert.equal(explicit.samples[0].well, "C9");
  assert.equal(explicit.samples[0].plateLabel, "MyPlate");
  assert.equal(readDelimited(simpleOrderTemplate("Plate", 9))[9].cells[1], "A2");
});

test("Invalid data fails visibly instead of silently losing columns or reactions", () => {
  for (const text of ["Sample name\tMystery field\nDNA\tx", "DNA\tbad-length\t100\tT7", "DNA\t3200\t-5\tT7", "DNA\t3200\t100\tF;", "Sample name\tWell\tPrimer\nDNA\tZ99\tT7"]) {
    const result = parseSangerPaste(text, { ...blankOrder(), container: "Plate" });
    assert.ok(result.errors.length, text);
  }
  assert.ok(parseSangerPaste("DNA\t3200\t100\tNotInCatalogue", blankOrder(), "SeqForge universal primer").errors.length);
  assert.ok(parseSangerPaste("DNA\t3200\t100\t" + Array.from({length: 251}, (_, i) => `P${i}`).join(";"), blankOrder()).errors.length);
});

test("Adding and appending samples maintains unique internal IDs without changing physical labels", () => {
  const a = newSangerSample([], "Tubes", "Standard");
  const b = newSangerSample([a], "Tubes", "Pre-mixed");
  assert.equal(b.tubeLabel, "Tube-2");
  assert.equal(b.reactions[0].primerSource, "Included in mix");
  const appended = appendSangerSamples([a], [{ ...a, tubeLabel: "External-1" }]);
  assert.notEqual(appended[0].sampleKey, appended[1].sampleKey);
  assert.equal(appended[1].tubeLabel, "External-1");
});

test("Mapped CSV and clipboard preserve reordered fields and ignore customer extras", () => {
  for (const delimiter of [",", "\t"]) {
    const text = [["Project ID", "Primer", "Concentration", "Sample name", "Length (bp)"], ["Internal-42", "T7;M13R", "100", "Clone A", "3200"]].map(row => row.join(delimiter)).join("\n");
    const sheet = inspectSangerSheet(text, "Tubes");
    assert.deepEqual(sheet.columns, ["", "primerName", "concentration", "sampleName", "templateLength"]);
    assert.ok(parseMappedSanger(sheet, blankOrder(), "").errors.length, "No source may be silently defaulted");
    const result = parseMappedSanger(sheet, blankOrder(), "SeqForge universal primer");
    assert.deepEqual(result.errors, []);
    assert.equal(reactionCount(result.samples), 2);
    assert.equal(result.samples[0].templateLength, "3200");
    assert.ok(result.samples[0].reactions.every(r => r.primerSource === "SeqForge universal primer"));
    assert.ok(!JSON.stringify(result.samples).includes("Internal-42"));
  }
});

test("Unknown headers and headerless numbers require explicit mappings", () => {
  const sheet = inspectSangerSheet("客户编号\t浓度\t引物\nDNA-A\t100\tT7", "Tubes");
  assert.equal(sheet.hasHeader, false);
  sheet.hasHeader = true;
  sheet.columns = ["sampleName", "concentration", "primerName"];
  const parsed = parseMappedSanger(sheet, blankOrder(), "Customer supplied");
  assert.deepEqual(parsed.errors, []);
  assert.equal(parsed.samples[0].sampleName, "DNA-A");
  assert.equal(parsed.samples[0].templateLength, "");
  const headerless = inspectSangerSheet("DNA-B\t100\t3200\tT7", "Tubes");
  assert.deepEqual(headerless.columns, ["", "", "", ""]);
  assert.ok(parseMappedSanger(headerless, blankOrder(), "Customer supplied").errors.length);
  headerless.columns = ["sampleName", "concentration", "templateLength", "primerName"];
  assert.equal(parseMappedSanger(headerless, blankOrder(), "Customer supplied").samples[0].concentration, "100");
  headerless.columns[2] = "concentration";
  assert.ok(parseMappedSanger(headerless, blankOrder(), "Customer supplied").errors.length);
});

test("Per-row source must be explicitly selected and complete; overrides require ignoring source column", () => {
  const sheet = inspectSangerSheet("Sample name,Primer,Primer source\nA,T7,universal\nB,My-F,customer", "Tubes");
  assert.ok(parseMappedSanger(sheet, blankOrder(), "Customer supplied").errors.length);
  const result = parseMappedSanger(sheet, blankOrder(), "column");
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.samples.map(s => s.reactions[0].primerSource), ["SeqForge universal primer", "Customer supplied"]);
  sheet.rows[2].cells[2] = "";
  assert.ok(parseMappedSanger(sheet, blankOrder(), "column").errors.length);
  sheet.columns[2] = "";
  assert.deepEqual(parseMappedSanger(sheet, blankOrder(), "Customer supplied").errors, []);
});

test("Pre-mixed mapping requires confirmation and rejects contradictory sources / multiple primers", () => {
  const order = { ...blankOrder(), submissionMode: "Pre-mixed" as const, container: "Plate" as const };
  const sheet = inspectSangerSheet("Name,Well,Primer source,Project\nMix-A,C09,Customer supplied,Ignore", "Plate");
  assert.ok(parseMappedSanger(sheet, order, "").errors.length);
  assert.ok(parseMappedSanger(sheet, order, "Included in mix").errors.length);
  sheet.columns[2] = "";
  const result = parseMappedSanger(sheet, order, "Included in mix");
  assert.deepEqual(result.errors, []);
  assert.equal(result.samples[0].well, "C9");
  assert.equal(result.samples[0].reactions[0].primerSource, "Included in mix");
  sheet.columns[3] = "primerName"; sheet.rows[1].cells[3] = "T7;M13R";
  assert.ok(parseMappedSanger(sheet, order, "Included in mix").errors.length);
});

test("Downloaded old templates and extended canonical metadata survive mapping", () => {
  const sheet = inspectSangerSheet(simpleOrderTemplate("Plate", 1), "Plate");
  sheet.rows[1].cells[3] = "Clone";
  sheet.rows[1].cells[9] = "T7";
  assert.equal(sheet.columns[2], "plateLabel");
  const result = parseMappedSanger(sheet, { ...blankOrder(), container: "Plate" }, "primer-columns");
  assert.deepEqual(result.errors, []);
  assert.equal(result.samples[0].reactions[0].primerSource, "SeqForge universal primer");
  const stored = inspectSangerSheet("sampleKey,sampleName,tubeLabel,primerName,primerSource,storedPrimerReference\nMyID,Clone,T1,F,Stored at SeqForge,REF-42", "Tubes");
  const storedResult = parseMappedSanger(stored, blankOrder(), "column");
  assert.deepEqual(storedResult.errors, []);
  assert.equal(storedResult.samples[0].sampleKey, "MyID");
  assert.equal(storedResult.samples[0].reactions[0].storedPrimerReference, "REF-42");
  assert.deepEqual(suggestMapping(stored.rows, false, "Tubes"), Array(6).fill(""));
});
