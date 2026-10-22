import assert from "node:assert/strict";
import test from "node:test";
import { blankOligo, inspectOligoSheet, oligoBaseCount, oligoTemplate, parseMappedOligos, suggestOligoMapping } from "../src/lib/oligo-entry";

test("Oligo CSV and Excel TSV map customer headers, preserve requests and ignore extra columns", () => {
  for (const separator of [",", "\t"]) {
    const text = [["Project", "Oligo name", "Sequence", "Synthesis scale", "Purification", "5' modification", "3' modification", "Internal modification", "Notes"],
      ["DO-NOT-IMPORT", "Primer-A", "acgt ry swkm bd hvn", "100nmol", "hplc", "Phosphate", "Biotin", "dT at base 4", "Keep all requests"],
      ["DO-NOT-IMPORT", "Primer-B", "ACGT", "", "", "", "", "", ""]].map(row => row.join(separator)).join("\r\n");
    const sheet = inspectOligoSheet(text);
    assert.equal(sheet.hasHeader, true);
    assert.equal(sheet.columns[0], "");
    const result = parseMappedOligos(sheet);
    assert.deepEqual(result.errors, []);
    assert.equal(result.oligos.length, 2);
    assert.deepEqual(result.oligos[0], { name: "Primer-A", sequence: "ACGTRYSWKMBDHVN", synthesisScale: "100 nmol", purification: "HPLC", modification5: "Phosphate", modification3: "Biotin", modificationInternal: "dT at base 4", notes: "Keep all requests" });
    assert.equal(result.oligos[1].synthesisScale, "25 nmol");
    assert.equal(result.oligos[1].purification, "Desalted");
    assert.equal(JSON.stringify(result.oligos).includes("DO-NOT-IMPORT"), false);
    assert.equal(oligoBaseCount(result.oligos), 19);
  }
});

test("Oligo CSV supports BOM, quoted commas, escaped quotes and multiline sequences without losing row numbers", () => {
  const sheet = inspectOligoSheet('\uFEFFName,Sequence,Notes\r\n"Primer, A","acgt\r\nTGCA","Use ""quoted"" name"\r\nB,ACGT,\r\n');
  const result = parseMappedOligos(sheet);
  assert.deepEqual(result.errors, []);
  assert.equal(result.oligos[0].name, "Primer, A");
  assert.equal(result.oligos[0].sequence, "ACGTTGCA");
  assert.equal(result.oligos[0].notes, 'Use "quoted" name');
  sheet.rows[2].cells[1] = "ACGU";
  const failed = parseMappedOligos(sheet);
  assert.equal(failed.oligos.length, 0);
  assert.match(failed.errors[0], /Row 4/);
});

test("Headerless Oligo data waits for explicit mappings and keeps the first oligo", () => {
  const sheet = inspectOligoSheet("First\tACGT\nSecond\tTGCA");
  assert.equal(sheet.hasHeader, false);
  assert.deepEqual(sheet.columns, ["", ""]);
  assert.equal(parseMappedOligos(sheet).errors.length, 2);
  const result = parseMappedOligos({ ...sheet, columns: ["name", "sequence"] });
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.oligos.map(item => item.name), ["First", "Second"]);
  assert.deepEqual(suggestOligoMapping(sheet.rows, false), ["", ""]);
});

test("Oligo import rejects duplicate, missing and forged mappings instead of silently overwriting", () => {
  const sheet = inspectOligoSheet("Name,Sequence,Other\nA,ACGT,TGCA");
  for (const columns of [["name", "sequence", "sequence"], ["name", "", ""], ["name", "sequence", "unknown"]]) {
    const result = parseMappedOligos({ ...sheet, columns });
    assert.equal(result.oligos.length, 0);
    assert.ok(result.errors.length > 0);
  }
  const extra = parseMappedOligos({ ...sheet, columns: ["name", "sequence"] });
  assert.match(extra.errors[0], /Row 2: unmapped extra columns/);
});

test("Oligo import rejects duplicate names, invalid sequence symbols and invalid specifications as a whole", () => {
  for (const text of [
    "Name,Sequence\nFirst,ACGT\n first ,TGCA",
    "Name,Sequence\nFirst,ACGT\nSecond,ACGT1",
    "Name,Sequence\nFirst,ACGT\nSecond,ACGU",
    "Name,Sequence\nFirst,ACGT\nSecond,/5Phos/ACGT",
    "Name,Sequence,Synthesis scale\nFirst,ACGT,25 nmol\nSecond,TGCA,25 nM",
    "Name,Sequence,Purification\nFirst,ACGT,Desalted\nSecond,TGCA,Unknown",
    "Name,Sequence\nFirst,ACGT\nSecond,",
  ]) {
    const result = parseMappedOligos(inspectOligoSheet(text));
    assert.equal(result.oligos.length, 0, text);
    assert.ok(result.errors.some(error => error.includes("Row 3")), text);
  }
});

test("Oligo import caps rows and normalized length; 250 oligos and 500 bases are allowed", () => {
  const valid = "Name,Sequence\n" + Array.from({ length: 250 }, (_, i) => `Oligo-${i + 1},${"ACGT".repeat(125)}`).join("\n");
  const result = parseMappedOligos(inspectOligoSheet(valid));
  assert.deepEqual(result.errors, []);
  assert.equal(result.oligos.length, 250);
  assert.equal(oligoBaseCount(result.oligos), 125000);
  assert.throws(() => inspectOligoSheet(valid + "\nOligo-251,ACGT"), /250/);
  const long = parseMappedOligos(inspectOligoSheet(`Name,Sequence\nA,${"A".repeat(501)}`));
  assert.match(long.errors[0], /500/);
  const spaces = parseMappedOligos(inspectOligoSheet(`Name,Sequence\nA,${"A ".repeat(500)}`));
  assert.deepEqual(spaces.errors, []);
});

test("Oligo template maps every intended field and doesn't manufacture an example order", () => {
  const sheet = inspectOligoSheet(oligoTemplate());
  assert.equal(sheet.hasHeader, true);
  assert.deepEqual(sheet.columns, ["name", "sequence", "synthesisScale", "purification", "modification5", "modification3", "modificationInternal", "notes"]);
  assert.equal(parseMappedOligos(sheet).oligos.length, 0);
  assert.deepEqual(blankOligo(), { name: "", sequence: "", synthesisScale: "25 nmol", purification: "Desalted", modification5: "", modification3: "", modificationInternal: "", notes: "" });
});

test("Malformed and oversized imports fail before preview", () => {
  assert.throws(() => inspectOligoSheet('Name,Sequence\nA,"ACGT'), /unclosed quoted/);
  assert.throws(() => inspectOligoSheet(""), /at least one oligo/);
  assert.throws(() => inspectOligoSheet("a".repeat(1_000_001)), /1 MB/);
  assert.throws(() => inspectOligoSheet(Array.from({ length: 101 }, () => "column").join(",")), /100 columns/);
});
