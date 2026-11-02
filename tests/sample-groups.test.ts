import assert from "node:assert/strict";
import test from "node:test";
import { blankReaction, blankSample } from "../src/lib/order-intake";
import { groupSamples, normalizedWell, sampleCsvCell, sampleMatchesSearch, samplesToCsv } from "../src/lib/sample-groups";

function eightPlates() {
  return Array.from({ length: 768 }, (_, index) => ({
    ...blankSample(`S${index + 1}`), sampleName: `Clone-${index + 1}`,
    plateLabel: `Plate-${Math.floor(index / 96) + 1}`, well: `${"ABCDEFGH"[index % 8]}${Math.floor(index % 96 / 8) + 1}`,
    reactions: [{ ...blankReaction(), primerName: "T7" }, { ...blankReaction(), primerName: "M13R" }],
  }));
}

test("Eight complete plates retain all 768 samples and 1536 reactions without changing source order or identity", () => {
  const samples = eightPlates();
  const before = JSON.stringify(samples);
  const groups = groupSamples(samples, "Plate");
  assert.equal(groups.length, 8);
  for (const group of groups) {
    assert.equal(group.sampleCount, 96);
    assert.equal(group.occupiedWells, 96);
    assert.equal(group.reactionCount, 192);
  }
  assert.equal(groups.reduce((sum, group) => sum + group.reactionCount, 0), 1536);
  assert.deepEqual(groups.flatMap(group => group.entries.map(entry => entry.index)), Array.from({ length: 768 }, (_, index) => index));
  assert.equal(groups[7].entries[95].sample, samples[767]);
  assert.equal(JSON.stringify(samples), before);
});

test("Plate spelling, leading-zero wells and duplicate wells do not inflate occupied wells", () => {
  const samples = [
    { ...blankSample("a"), plateLabel: " Plate 1 ", well: "a01" },
    { ...blankSample("b"), plateLabel: "plate 1", well: "A1" },
    { ...blankSample("c"), plateLabel: "PLATE 1", well: "H12" },
    { ...blankSample("d"), plateLabel: "Plate 1", well: "H13" },
    { ...blankSample("e"), plateLabel: "", well: "A1" },
  ];
  const groups = groupSamples(samples, "Plate");
  assert.equal(groups.length, 2);
  assert.equal(groups[0].label, "Plate 1");
  assert.equal(groups[0].sampleCount, 4);
  assert.equal(groups[0].occupiedWells, 2);
  assert.equal(groups[1].label, "Unassigned plate");
  assert.equal(normalizedWell(" h012 "), "H012", "Malformed wells are not silently repaired");
});

test("Tube grouping and cross-plate search retain original locations and match primer metadata", () => {
  const samples = eightPlates();
  samples[767].reactions[1].primerSource = "Stored at SeqForge";
  const tubes = groupSamples(samples, "Tubes");
  assert.equal(tubes.length, 1);
  assert.equal(tubes[0].sampleCount, 768);
  assert.equal(tubes[0].entries[767].index, 767);
  assert.equal(tubes[0].occupiedWells, 0);
  assert.deepEqual(samples.filter(sample => sampleMatchesSearch(sample, "plate-8 h12 m13r stored")).map(sample => sample.sampleKey), ["S768"]);
  assert.equal(sampleMatchesSearch(samples[0], "plate-1 a01 t7"), true);
  assert.equal(sampleMatchesSearch(samples[0], "plate-8 h12"), false);
});

test("CSV contains every reaction, not only the currently displayed plate, with consistent columns", () => {
  const csv = samplesToCsv(eightPlates(), "Plate");
  const rows = csv.split("\r\n");
  assert.equal(rows.length, 1537);
  assert.ok(rows.every(row => row.split('","').length === 23));
  assert.ok(rows[1].includes('"Plate-1","A1"'));
  assert.ok(rows[1536].includes('"S768","Clone-768"'));
  assert.ok(rows[1536].includes('"Plate-8","H12"'));
  assert.ok(rows[1536].includes('"2","M13R"'));
});

test("CSV preserves whole-plasmid samples with no primer reactions and quotes embedded text", () => {
  const sample = { ...blankSample("S1"), sampleName: 'Clone, "A"', tubeLabel: "Tube-1", notes: "first line\nsecond line", reactions: [] };
  const csv = samplesToCsv([sample], "Tubes");
  assert.ok(csv.includes('"Clone, ""A"""'));
  assert.ok(csv.includes('"first line\nsecond line"'));
  assert.ok(csv.includes('"Tubes","Tube-1","",""'));
  assert.equal(csv.split("\r\n")[1].split('","').length, 23);
});

test("CSV neutralizes formula-leading customer names and text, including whitespace prefixes", () => {
  for (const value of ["=1+1", "+cmd", "-1+2", "@SUM(A1)", "  =HYPERLINK(1)", "\tformula", "\nformula", "\uFEFF=1"]) {
    assert.ok(sampleCsvCell(value).startsWith('"\''), `Unsafe spreadsheet text: ${JSON.stringify(value)}`);
  }
  assert.equal(sampleCsvCell("Clone-1"), '"Clone-1"');
  assert.equal(sampleCsvCell('A"B'), '"A""B"');
});
