import { groupSamples, sampleMatchesSearch, type SampleGroupable } from "./sample-groups";

export type SangerGridView = {
  signature: string; groupId: string; groupLabel: string; query: string;
  page: number; pageSize: 24 | 48; keys: string[];
};

export function sampleStructure(samples: SampleGroupable[], container: string) {
  return JSON.stringify([container, samples.map(sample => sample.sampleKey)]);
}

/** Freeze membership while editing. Renaming a plate/sample never removes the
 * active input; applying search or navigating refreshes the visible membership. */
export function sangerGridView(samples: SampleGroupable[], container: string, options: Partial<Pick<SangerGridView, "groupId" | "query" | "page" | "pageSize">> = {}): SangerGridView {
  const groups = groupSamples(samples, container);
  const query = options.query || "";
  const group = groups.find(item => item.id === options.groupId) || groups[0];
  // Search spans every plate; the matching results still retain original indices.
  const entries = query.trim() ? samples.map((sample, index) => ({ sample, index })).filter(({ sample }) => sampleMatchesSearch(sample, query)) : group?.entries || [];
  const pageSize = options.pageSize || 24;
  return {
    signature: sampleStructure(samples, container), groupId: group?.id || "", groupLabel: group?.label || "Samples", query,
    pageSize, page: Math.max(0, Math.min(options.page || 0, Math.ceil(entries.length / pageSize) - 1)),
    keys: entries.map(({ sample }) => sample.sampleKey),
  };
}

export function revealSangerSample(samples: SampleGroupable[], container: string, sampleKey: string, pageSize: 24 | 48): SangerGridView {
  const group = groupSamples(samples, container).find(item => item.entries.some(entry => entry.sample.sampleKey === sampleKey));
  const position = group?.entries.findIndex(entry => entry.sample.sampleKey === sampleKey) ?? 0;
  return sangerGridView(samples, container, { groupId: group?.id, pageSize, page: Math.floor(Math.max(0, position) / pageSize) });
}

export function visibleSangerEntries<T extends SampleGroupable>(samples: T[], view: SangerGridView) {
  const byKey = new Map(samples.map((sample, index) => [sample.sampleKey, { sample, index }]));
  return view.keys.slice(view.page * view.pageSize, (view.page + 1) * view.pageSize)
    .flatMap(key => byKey.has(key) ? [byKey.get(key)!] : []);
}
