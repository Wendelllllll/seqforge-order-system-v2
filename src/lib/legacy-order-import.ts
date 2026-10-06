import { blankReaction, blankSample, type OrderDraft, type SampleDraft } from "./order-intake";

// Kept in the exact order used by the live SeqForge upload templates.
export const LEGACY_COLUMNS = ["#", "wellID", "Tube label", "DNA Name", "DNA Type", "Template Length (bp)", "Conc. (ng/uL)", "My primers", "Conc. (pmol/uL)", "SeqForge Primers", "Special protocol"] as const;
export type LegacyPrimerChoice = "require-single" | "customer" | "universal";
type Row = { cells: string[]; line: number };
const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9#]/g, "");
const aliases = [
  ["#"], ["wellid"], ["tubelabel", "platelabel"], ["dnaname"], ["dnatype"], ["templatelengthbp"],
  ["concngul", "conc"], ["myprimers", "myprimer"], ["concpmolul", "conc"],
  ["seqforgeprimers", "seqforgeprimer"], ["specialprotocol"],
];
export function isLegacyHeader(cells: string[]) { return cells[0]?.trim() === "#" || cells.some(value => normalize(value) === "wellid"); }

export function convertLegacyRows(rows: Row[], order: Omit<OrderDraft, "samples">, choice: LegacyPrimerChoice) {
  const errors: string[] = [], mapped: { sample: SampleDraft; line: number }[] = [];
  const header = rows[0].cells;
  if (header.length < 11 || header.slice(0, 11).some((name, i) => !(aliases[i].includes(normalize(name)) || (i === 9 && /^[a-z]+primers?$/.test(normalize(name))))) || header.slice(11).some(Boolean)) {
    return { mapped, errors: ["Legacy template: keep the original 11 columns in their original order. Empty trailing spreadsheet columns are allowed."] };
  }
  const numbers = new Set<string>(), locations = new Map<string, string>();
  for (const { cells, line } of rows.slice(1)) {
    const error = (message: string) => errors.push(`Row ${line}: ${message}`);
    if (cells.length < 11 || cells.slice(11).some(Boolean)) { error("Expected the original 11 columns; extra columns must be empty."); continue; }
    const [number, well, label, name, dnaType, length, concentration, custom, primerConc, universal, protocol] = cells;
    if (!/^[1-9]\d*$/.test(number) || numbers.has(String(Number(number)))) { error("The # column must contain unique positive whole numbers."); continue; }
    numbers.add(String(Number(number)));
    const templateTypes: Record<string, [SampleDraft["templateType"], SampleDraft["preparation"]]> = {
      plasmid: ["Plasmid DNA", "None requested"], pcr: ["PCR product", "None requested"], bac: ["BAC", "None requested"],
      plasmidneedsminiprep: ["Plasmid DNA", "Miniprep requested"], pcrneedscleanup: ["PCR product", "PCR cleanup requested"],
    };
    const template = templateTypes[normalize(dnaType)];
    if (!template) { error(`Unsupported DNA Type "${dnaType}". Choose a Sanger template type; Nanopore orders require a separate service.`); continue; }
    const protocols = { noneknown: "None known", gcrich: "GC-rich", rnai: "RNAi", polya: "PolyA", dinucleotiderepeat: "Dinucleotide repeat" } as const;
    const specialProtocol = protocol ? protocols[normalize(protocol) as keyof typeof protocols] : "None known";
    if (!specialProtocol) { error(`Unknown Special protocol "${protocol}".`); continue; }
    if (custom && universal && choice === "require-single") { error("Both My primers and SeqForge Primers are filled. Choose which source to use in Legacy primer choice, or keep only the intended primer in this row."); continue; }
    const useUniversal = Boolean(universal) && (!custom || choice === "universal");
    const primerName = useUniversal ? universal : custom;
    const canonicalWell = well.toUpperCase().replace(/^([A-H])0+([1-9])$/, "$1$2");
    const location = JSON.stringify(order.container === "Plate" ? [label.toLowerCase(), canonicalWell] : [label.toLowerCase()]);
    const key = locations.get(location) || `S${number}`;
    locations.set(location, key);
    const sample = blankSample(key);
    Object.assign(sample, { sampleName: name, tubeLabel: order.container === "Tubes" ? label : "", plateLabel: order.container === "Plate" ? label : "", well: order.container === "Plate" ? canonicalWell : "", templateType: template[0], preparation: template[1], templateLength: length, concentration });
    const reaction = { ...blankReaction(), primerName, primerConcentration: primerConc, specialProtocol };
    reaction.primerSource = order.submissionMode !== "Standard" ? "Included in mix" : useUniversal ? "SeqForge universal primer" : "Customer supplied";
    if (order.submissionMode !== "Standard" && !reaction.primerName) reaction.primerName = "Included in mix";
    sample.reactions = [reaction];
    mapped.push({ sample, line });
  }
  return { mapped, errors };
}
