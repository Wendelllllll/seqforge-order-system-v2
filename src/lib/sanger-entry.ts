import { importSamples, IMPORT_COLUMNS, readDelimited } from "./order-import";
import { isLegacyHeader } from "./legacy-order-import";
import { blankReaction, blankSample, MAX_IMPORT_BYTES, MAX_REACTIONS, type OrderDraft, type SampleDraft } from "./order-intake";

export function verticalWell(index: number) {
  return `${"ABCDEFGH"[index % 8]}${Math.floor((index % 96) / 8) + 1}`;
}

export function newSangerSample(samples: SampleDraft[], container: OrderDraft["container"], mode: OrderDraft["submissionMode"], templateType: SampleDraft["templateType"] = "Plasmid DNA") {
  let index = 0;
  const locations = new Set(samples.map(s => container === "Tubes" ? s.tubeLabel.toLowerCase() : `${s.plateLabel.toLowerCase()}/${s.well.toUpperCase()}`));
  while (locations.has(container === "Tubes" ? `tube-${index + 1}` : `plate-${Math.floor(index / 96) + 1}/${verticalWell(index)}`)) index++;
  const sample = blankSample(`S${index + 1}`);
  while (samples.some(s => s.sampleKey.toLowerCase() === sample.sampleKey.toLowerCase())) sample.sampleKey += "x";
  return { ...sample, templateType, tubeLabel: container === "Tubes" ? `Tube-${index + 1}` : "", plateLabel: container === "Plate" ? `Plate-${Math.floor(index / 96) + 1}` : "", well: container === "Plate" ? verticalWell(index) : "", reactions: [{ ...blankReaction(), ...(mode !== "Standard" ? { primerSource: "Included in mix" as const, primerName: "Included in mix" } : {}) }] };
}

const normalize = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, "");
export const sangerColumnAliases: Record<string, string> = {
  samplename: "sampleName", dnaname: "sampleName", name: "sampleName", reactionname: "sampleName",
  tubelabel: "tubeLabel", tube: "tubeLabel", platelabel: "plateLabel", plate: "plateLabel",
  well: "well", wellid: "well", wellposition: "well",
  length: "templateLength", lengthbp: "templateLength", templatelength: "templateLength", templatelengthbp: "templateLength", samplesize: "templateLength",
  concentration: "concentration", concngul: "concentration", dnaconcentrationngl: "concentration", dnaconcentrationngul: "concentration",
  dnatype: "templateType", templatetype: "templateType",
  primer: "primerName", primers: "primerName", primername: "primerName",
  primersource: "primerSource", primerconcentration: "primerConcentration", primerconcentrationpmolul: "primerConcentration", primerconcentrationpmoll: "primerConcentration",
  preparation: "preparation", notes: "notes", specialprotocol: "specialProtocol",
};
for (const column of IMPORT_COLUMNS) sangerColumnAliases[normalize(column)] = column;
const aliases = sangerColumnAliases;

/** Clipboard TSV and simple CSV use the same validation as existing upload files. */
export function parseSangerPaste(text: string, order: Omit<OrderDraft, "samples">, defaultSource = "Customer supplied", defaultType = "Plasmid DNA", mapped = false) {
  const fail = (message: string) => ({ samples: [] as SampleDraft[], errors: [message] });
  if (new TextEncoder().encode(text).length > MAX_IMPORT_BYTES) return fail("Paste up to 1 MB of sample data.");
  let rows: ReturnType<typeof readDelimited>;
  try { rows = readDelimited(text); } catch (error) { return fail(error instanceof Error ? error.message : "Unable to read spreadsheet."); }
  if (!rows.length) return fail("Paste at least one sample row.");
  // Preserve the original upload formats, including their extra metadata.
  if (!mapped && (rows[0].cells.includes("sampleKey") || (isLegacyHeader(rows[0].cells) && rows[0].cells.length >= 11))) return importSamples(text, order);
  const hasHeader = rows[0].cells.some(cell => aliases[normalize(cell)] === "sampleName");
  const columns = hasHeader ? rows.shift()!.cells.map(cell => aliases[normalize(cell)] || "") : ["sampleName", "templateLength", "concentration", "primerName"];
  if (columns.some(c => !c) || new Set(columns).size !== columns.length) return fail("Use unique supported column headers, or paste four columns without headers: Sample name, Length (bp), Concentration, Primer.");
  if (!rows.length || rows.length > MAX_REACTIONS) return fail(`Paste between 1 and ${MAX_REACTIONS} rows.`);
  const converted: string[][] = [[...IMPORT_COLUMNS]];
  const locations = new Map<string, string>();
  for (const row of rows) {
    if (row.cells.length > columns.length && row.cells.slice(columns.length).some(Boolean)) return fail(`Row ${row.line}: extra columns found. Include supported headers to identify your columns.`);
    const values = Object.fromEntries(columns.map((key, i) => [key, row.cells[i] || ""]));
    const index = locations.size;
    const sample = newSangerSample([], order.container, order.submissionMode);
    Object.assign(sample, { sampleName: values.sampleName, templateType: defaultType });
    Object.assign(sample, Object.fromEntries(["sampleName", "tubeLabel", "plateLabel", "well", "templateType", "templateLength", "concentration", "preparation", "notes"].filter(key => key in values).map(key => [key, values[key]])));
    if (!columns.includes("tubeLabel")) sample.tubeLabel = order.container === "Tubes" ? `Tube-${index + 1}` : "";
    if (!columns.includes("plateLabel")) sample.plateLabel = order.container === "Plate" ? `Plate-${Math.floor(index / 96) + 1}` : "";
    if (!columns.includes("well")) sample.well = order.container === "Plate" ? verticalWell(index) : "";
    sample.well = sample.well.toUpperCase().replace(/^([A-H])0+([1-9])$/, "$1$2");
    const typeAliases: Record<string, SampleDraft["templateType"]> = { plasmid: "Plasmid DNA", plasmiddna: "Plasmid DNA", pcr: "PCR product", pcrproduct: "PCR product", purifiedpcr: "Purified PCR product", purifiedpcrproduct: "Purified PCR product", bac: "BAC" };
    sample.templateType = typeAliases[normalize(sample.templateType)] || sample.templateType;
    const location = order.container === "Tubes" ? sample.tubeLabel.toLowerCase() : `${sample.plateLabel.toLowerCase()}/${sample.well}`;
    const key = values.sampleKey || locations.get(location) || `S${locations.size + 1}`;
    locations.set(location, key);
    sample.sampleKey = key;
    const primers = (values.primerName || (order.submissionMode !== "Standard" ? "Included in mix" : "")).split(";").map(p => p.trim());
    if (order.submissionMode !== "Standard" && primers.length > 1) return fail(`Row ${row.line}: ${order.submissionMode} accepts one reaction per tube or well. Use a separate tube or well for each primer.`);
    for (const primerName of primers) {
      const sourceAliases: Record<string, string> = { customer: "Customer supplied", supplied: "Customer supplied", universal: "SeqForge universal primer", seqforge: "SeqForge universal primer" };
      const source = values.primerSource || defaultSource;
      if (order.submissionMode !== "Standard" && values.primerSource && values.primerSource !== "Included in mix") return fail(`Row ${row.line}: ${order.submissionMode} does not accept separate primer supplies. Remove the separate primer source.`);
      const reaction = { ...blankReaction(), primerName, primerSource: order.submissionMode === "Standard" ? sourceAliases[normalize(source)] || source : "Included in mix", primerConcentration: values.primerConcentration || "", specialProtocol: values.specialProtocol || "None known" };
      for (const field of ["storedPrimerReference", "primerSequence", "purification", "synthesisScale", "modification5", "modification3", "modificationInternal"] as const) {
        if (values[field]) reaction[field] = values[field] as never;
      }
      const flattened = { ...sample, ...reaction } as Record<string, unknown>;
      converted.push(IMPORT_COLUMNS.map(key => String(flattened[key])));
    }
  }
  return importSamples(converted.map(row => row.map(cell => `"${cell.replaceAll('"', '""')}"`).join(",")).join("\n"), order);
}

export function appendSangerSamples(current: SampleDraft[], incoming: SampleDraft[]) {
  const result = [...current];
  for (const sample of incoming) {
    let key = sample.sampleKey;
    while (result.some(s => s.sampleKey.toLowerCase() === key.toLowerCase())) key += "x";
    result.push({ ...sample, sampleKey: key });
  }
  return result;
}
