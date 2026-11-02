import assert from "node:assert/strict";
import test from "node:test";
import { blankReaction, blankSample } from "../src/lib/order-intake";
import { verticalWell } from "../src/lib/sanger-entry";
import { revealSangerSample, sampleStructure, sangerGridView, visibleSangerEntries } from "../src/lib/sanger-grid-navigation";

const samples = Array.from({ length: 1536 }, (_, index) => ({
  ...blankSample(`S${index + 1}`), sampleName: `Clone-${index + 1}`, tubeLabel: `Tube-${index + 1}`,
  plateLabel: `Plate-${Math.floor(index / 96) + 1}`, well: verticalWell(index),
  reactions: [{ ...blankReaction(), primerName: "T7" }, { ...blankReaction(), primerName: "M13R" }],
}));

test("Editor only selects one page of one plate and retains original indices", () => {
  const view = sangerGridView(samples, "Plate", { groupId: "plate:plate-8", page: 2 });
  const entries = visibleSangerEntries(samples, view);
  assert.equal(view.keys.length, 96);
  assert.equal(entries.length, 24);
  assert.equal(entries[0].index, 720);
  assert.equal(entries[0].sample, samples[720]);
  assert.ok(entries.every(entry => entry.sample.plateLabel === "Plate-8"));
  assert.equal(samples.length, 1536);
});

test("Search spans plates and can match sample, plate, well and primer", () => {
  for (const query of ["Clone-1536", "Plate-16 H12", "Plate-16 H12 M13R"]) {
    const view = sangerGridView(samples, "Plate", { query });
    const entries = visibleSangerEntries(samples, view);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].index, 1535);
  }
});

test("Changing text in a filtered row does not make the active input disappear", () => {
  const view = sangerGridView(samples, "Plate", { query: "Clone-1536" });
  const edited = samples.map((sample, index) => index === 1535 ? { ...sample, sampleName: "Renamed", plateLabel: "Other plate", well: "A1" } : sample);
  assert.equal(sampleStructure(edited, "Plate"), view.signature);
  assert.equal(visibleSangerEntries(edited, view)[0].index, 1535);
  assert.equal(visibleSangerEntries(edited, view)[0].sample.sampleName, "Renamed");
  assert.equal(sangerGridView(edited, "Plate", { query: view.query }).keys.length, 0, "Explicit search refresh applies the new values");
});

test("Revealing a new sample or validation error selects its correct plate and page", () => {
  for (const pageSize of [24, 48] as const) {
    const view = revealSangerSample(samples, "Plate", "S1536", pageSize);
    assert.equal(view.groupId, "plate:plate-16");
    assert.equal(view.query, "");
    assert.equal(view.page, 96 / pageSize - 1);
    assert.equal(visibleSangerEntries(samples, view).at(-1)?.index, 1535);
  }
  const tubeView = revealSangerSample(samples, "Tubes", "S1536", 24);
  assert.equal(tubeView.page, 63);
  assert.equal(visibleSangerEntries(samples, tubeView).at(-1)?.sample.sampleKey, "S1536");
});
