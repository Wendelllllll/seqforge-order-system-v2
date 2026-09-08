import { blankReaction, blankSample, MAX_IMPORT_BYTES, MAX_REACTIONS, orderSchema, type OrderDraft, type SampleDraft } from "./order-intake";

export const SAMPLE_COLUMNS = ["sampleKey", "sampleName", "tubeLabel", "plateLabel", "well", "templateType", "templateLength", "concentration", "preparation", "notes"] as const;
export const REACTION_COLUMNS = ["primerSource", "primerName", "primerConcentration", "storedPrimerReference", "primerSequence", "purification", "synthesisScale", "modification5", "modification3", "modificationInternal", "specialProtocol"] as const;
export const IMPORT_COLUMNS = [...SAMPLE_COLUMNS, ...REACTION_COLUMNS];

// Strict CSV/TSV reader: preserves quoted newlines and reports physical source lines.
export function readDelimited(input: string): { cells: string[]; line: number }[] {
  const text = input.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  let delimiter = ",", inQuote = false;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '"') {
      if (inQuote && text[i + 1] === '"') i++;
      else inQuote = !inQuote;
    } else if (!inQuote && text[i] === "\t") { delimiter = "\t"; break; }
    else if (!inQuote && text[i] === "\n") break;
  }
  const rows: { cells: string[]; line: number }[] = [];
  let cells: string[] = [], cell = "", quoted = false, closed = false, line = 1, startLine = 1;
  const endCell = () => { cells.push(cell.trim()); cell = ""; closed = false; };
  const endRow = () => { endCell(); if (cells.some(Boolean)) rows.push({ cells, line: startLine }); cells = []; startLine = line + 1; };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; }
        else { quoted = false; closed = true; }
      } else { cell += c; if (c === "\n") line++; }
    } else if (c === delimiter) endCell();
    else if (c === "\n") { endRow(); line++; }
    else if (c === '"' && !cell && !closed) quoted = true;
    else if (closed || c === '"') throw new Error(`Row ${line}: unexpected text or quote after a field. Use double quotes around the entire field.`);
    else cell += c;
  }
  if (quoted) throw new Error(`Row ${startLine}: unclosed quoted field.`);
  if (cell || cells.length || closed) endRow();
  return rows;
}

export function importSamples(text: string, order: Omit<OrderDraft, "samples">): { samples: SampleDraft[]; errors: string[] } {
  const fail = (errors: string[]) => ({ samples: [], errors });
  if (new TextEncoder().encode(text).length > MAX_IMPORT_BYTES) return fail(["The import is larger than 1 MB."]);
  let rows: ReturnType<typeof readDelimited>;
  try { rows = readDelimited(text); } catch (error) { return fail([error instanceof Error ? error.message : "Unable to read this file."]); }
  if (rows.length < 2) return fail(["Include a header row and at least one reaction row."]);
  const [header, ...data] = rows;
  if (data.length > MAX_REACTIONS) return fail([`This demo supports at most ${MAX_REACTIONS} reactions per order.`]);
  const required = ["sampleKey", "sampleName", "templateType", "primerSource", "primerName", ...(order.container === "Plate" ? ["plateLabel", "well"] : ["tubeLabel"])];
  const errors = required.filter((name) => !header.cells.includes(name)).map((name) => `Header: missing ${name}.`);
  const seenHeaders = new Set<string>();
  for (const name of header.cells) {
    if (seenHeaders.has(name)) errors.push(`Header: duplicate ${name}.`);
    if (!(IMPORT_COLUMNS as readonly string[]).includes(name)) errors.push(`Header: unknown column ${name}. Download the V2 template; legacy files use a different format.`);
    seenHeaders.add(name);
  }
  if (errors.length) return fail(errors);
  const groups = new Map<string, { sample: SampleDraft; line: number; reactionLines: number[] }>();
  data.forEach(({ cells, line }) => {
    if (cells.length !== header.cells.length) { errors.push(`Row ${line}: expected ${header.cells.length} columns, found ${cells.length}.`); return; }
    const values = Object.fromEntries(header.cells.map((key, i) => [key, cells[i]]));
    const sample = { ...blankSample(), ...Object.fromEntries(SAMPLE_COLUMNS.filter((key) => key in values).map((key) => [key, values[key]])), reactions: [] } as SampleDraft;
    const reaction = { ...blankReaction(), ...Object.fromEntries(REACTION_COLUMNS.filter((key) => key in values).map((key) => [key, values[key]])) };
    // Empty optional enum cells use the documented defaults, not invalid empty enums.
    sample.preparation ||= "None requested";
    reaction.purification ||= "Desalted";
    reaction.synthesisScale ||= "25 nmol";
    reaction.specialProtocol ||= "None known";
    sample.well = sample.well.toUpperCase().replace(/^([A-H])0+([1-9])$/, "$1$2");
    const key = sample.sampleKey.toLowerCase();
    const existing = groups.get(key);
    if (existing) {
      const changed = SAMPLE_COLUMNS.filter((column) => column !== "sampleKey" && existing.sample[column] !== sample[column]);
      if (changed.length) errors.push(`Row ${line}: sample ${sample.sampleKey} conflicts with row ${existing.line} (${changed.join(", ")}). Repeat identical sample details for another primer.`);
      existing.sample.reactions.push(reaction);
      existing.reactionLines.push(line);
    } else groups.set(key, { sample: { ...sample, reactions: [reaction] }, line, reactionLines: [line] });
  });
  const entries = [...groups.values()];
  const parsed = orderSchema.safeParse({ ...order, samples: entries.map((entry) => entry.sample) });
  if (!parsed.success) for (const issue of parsed.error.issues) {
    if (issue.path[0] !== "samples") continue;
    const entry = typeof issue.path[1] === "number" ? entries[issue.path[1]] : undefined;
    const line = entry && issue.path[2] === "reactions" && typeof issue.path[3] === "number" ? entry.reactionLines[issue.path[3]] : entry?.line;
    errors.push(`${line ? `Row ${line}` : "Import"} · ${String(issue.path.at(-1))}: ${issue.message}`);
  }
  if (errors.length) return fail(errors);
  // Order-level fields can remain unfinished during sample import.
  return { samples: parsed.success ? parsed.data.samples : entries.map((entry) => entry.sample), errors: [] };
}

export function templateCsv(container: OrderDraft["container"], mode: OrderDraft["submissionMode"]) {
  const sample = { ...blankSample("S1"), sampleName: "Demo plasmid", tubeLabel: container === "Tubes" ? "Tube-1" : "", plateLabel: container === "Plate" ? "Plate-1" : "", well: container === "Plate" ? "A1" : "", templateLength: "3200", concentration: "100" };
  const reaction = { ...blankReaction(), primerSource: mode === "Standard" ? "SeqForge universal primer" : "Included in mix", primerName: "M13F" };
  const values = { ...sample, ...reaction };
  const encode = (value: string) => `"${value.replaceAll('"', '""')}"`;
  return IMPORT_COLUMNS.join(",") + "\r\n" + IMPORT_COLUMNS.map((key) => encode(String(values[key]))).join(",") + "\r\n";
}
