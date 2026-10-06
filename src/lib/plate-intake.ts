import { blankSample, MAX_REACTIONS, reactionCount, type OrderDraft, type SampleDraft } from "./order-intake";

export type PlateOptions = { label: string; count: number; direction: "column" | "row"; prefix: string; primerName: string };

export function addPlate(order: OrderDraft, options: PlateOptions): SampleDraft[] {
  const label = options.label.trim(), prefix = options.prefix.trim();
  if (!label || label.length > 100) throw new Error("Enter a plate label of up to 100 characters.");
  if (!Number.isInteger(options.count) || options.count < 1 || options.count > 96) throw new Error("Choose 1–96 occupied wells.");
  if (!prefix || prefix.length > 90) throw new Error("Enter a sample-name prefix of up to 90 characters.");
  const existing = order.samples.filter(sample => JSON.stringify(sample) !== JSON.stringify(blankSample(sample.sampleKey)));
  if (existing.some(sample => sample.plateLabel.trim().toLowerCase() === label.toLowerCase())) throw new Error("This plate label already exists. Choose another label or edit its wells below.");
  if (reactionCount(existing) + options.count > MAX_REACTIONS) throw new Error(`This order supports up to ${MAX_REACTIONS} reactions. Start a separate order for more plates.`);
  const ids = new Set(existing.map(sample => sample.sampleKey.toLowerCase()));
  const samples = Array.from({ length: options.count }, (_, i) => {
    const row = options.direction === "column" ? i % 8 : Math.floor(i / 12);
    const column = options.direction === "column" ? Math.floor(i / 8) + 1 : i % 12 + 1;
    const well = `${"ABCDEFGH"[row]}${column}`;
    let n = existing.length + i + 1;
    while (ids.has(`s${n}`)) n++;
    const sample = blankSample(`S${n}`);
    ids.add(sample.sampleKey.toLowerCase());
    Object.assign(sample, { plateLabel: label, well, sampleName: `${prefix}-${well}` });
    sample.reactions[0].primerName = options.primerName.trim();
    if (order.submissionMode !== "Standard") sample.reactions[0].primerSource = "Included in mix";
    return sample;
  });
  return [...existing, ...samples];
}
