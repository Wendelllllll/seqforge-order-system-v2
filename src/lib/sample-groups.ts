export type SampleGroupable = {
  sampleKey: string; sampleName: string; plateLabel: string; well: string; tubeLabel: string;
  reactions: { primerName: string; primerSource?: string }[];
};
export type IndexedSample<T> = { sample: T; index: number };
export type SampleGroup<T> = {
  id: string; label: string; entries: IndexedSample<T>[];
  sampleCount: number; reactionCount: number; occupiedWells: number;
};
export function normalizedWell(value: string) {
  return value.trim().toUpperCase().replace(/^([A-H])0+([1-9])$/, "$1$2");
}

/** Group only for display: source order, object identity and original indices stay intact. */
export function groupSamples<T extends SampleGroupable>(samples: T[], container: string): SampleGroup<T>[] {
  const groups = new Map<string, SampleGroup<T>>();
  const wells = new Map<string, Set<string>>();
  samples.forEach((sample, index) => {
    const plate = sample.plateLabel.trim();
    const id = container === "Plate" ? `plate:${plate.toLowerCase()}` : "tubes";
    let group = groups.get(id);
    if (!group) {
      group = { id, label: container === "Plate" ? plate || "Unassigned plate" : "Tubes / strips", entries: [], sampleCount: 0, reactionCount: 0, occupiedWells: 0 };
      groups.set(id, group); wells.set(id, new Set());
    }
    group.entries.push({ sample, index }); group.sampleCount++; group.reactionCount += sample.reactions.length;
    const well = normalizedWell(sample.well);
    if (container === "Plate" && /^[A-H](?:[1-9]|1[0-2])$/.test(well)) wells.get(id)!.add(well);
  });
  return [...groups.values()].map(group => ({ ...group, occupiedWells: wells.get(group.id)!.size }));
}

export function sampleMatchesSearch(sample: SampleGroupable, query: string) {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean).map(term => /^[a-h]0+[1-9]$/.test(term) ? normalizedWell(term).toLowerCase() : term);
  const haystack = [sample.sampleKey, sample.sampleName, sample.plateLabel, sample.well, normalizedWell(sample.well), sample.tubeLabel, ...sample.reactions.flatMap(reaction => [reaction.primerName, reaction.primerSource ?? ""])].join(" ").toLowerCase();
  return terms.every(term => haystack.includes(term));
}

export type SampleTableReaction = {
  primerName: string; primerSource: string; primerConcentration: string; storedPrimerReference: string;
  primerSequence: string; purification: string; synthesisScale: string;
  modification5: string; modification3: string; modificationInternal: string; specialProtocol: string;
};
export type SampleTableSample = Omit<SampleGroupable, "reactions"> & {
  templateType: string; templateLength: string; concentration: string | null;
  preparation: string; notes: string | null; reactions: SampleTableReaction[];
};

/** Quote every field and neutralize spreadsheet formulas in customer-provided text. */
export function sampleCsvCell(raw: string | number | null | undefined) {
  let value = String(raw ?? "");
  if (/^[\t\r\n]/.test(value) || /^[\s\uFEFF]*[=+@-]/.test(value)) value = `'${value}`;
  return `"${value.replaceAll('"', '""')}"`;
}
export function samplesToCsv(samples: SampleTableSample[], container: string) {
  const headers = ["Sample ID", "Sample name", "Format", "Tube label", "Plate label", "Well", "DNA type", "Length (bp)", "DNA concentration (ng/uL)", "Preparation", "Sample notes", "Reaction", "Primer name", "Primer source", "Primer concentration (pmol/uL)", "Stored primer reference", "Primer sequence (5 to 3)", "Purification", "Synthesis scale", "5 modification", "3 modification", "Internal modification", "Special protocol"];
  const rows: (string | number | null | undefined)[][] = [headers];
  for (const sample of samples) {
    const common = [sample.sampleKey, sample.sampleName, container, container === "Tubes" ? sample.tubeLabel : "", container === "Plate" ? sample.plateLabel : "", container === "Plate" ? sample.well : "", sample.templateType, sample.templateLength, sample.concentration, sample.preparation, sample.notes];
    if (!sample.reactions.length) rows.push([...common, ...Array(12).fill("")]);
    sample.reactions.forEach((r, index) => rows.push([...common, index + 1, r.primerName, r.primerSource, r.primerConcentration, r.storedPrimerReference, r.primerSequence, r.purification, r.synthesisScale, r.modification5, r.modification3, r.modificationInternal, r.specialProtocol]));
  }
  return rows.map(row => row.map(sampleCsvCell).join(",")).join("\r\n");
}
