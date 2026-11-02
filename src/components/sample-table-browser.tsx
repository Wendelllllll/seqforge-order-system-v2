"use client";

import { Fragment, useId, useMemo, useState } from "react";
import { groupSamples, sampleMatchesSearch, samplesToCsv, type IndexedSample, type SampleTableSample } from "@/lib/sample-groups";
import "./sample-table-browser.css";

export type SampleTableBrowserProps = {
  samples: SampleTableSample[];
  container: string;
  submissionMode: string;
  service?: string;
  intakeVersion?: number;
  presentation?: "screen" | "print";
  allowExport?: boolean;
};

/** Only visible sample rows are mounted. The explicit print presentation renders the full manifest. */
export function SampleTableBrowser({ samples, container, submissionMode, service, intakeVersion, presentation = "screen", allowExport = true }: SampleTableBrowserProps) {
  const groups = useMemo(() => groupSamples(samples, container), [samples, container]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(24);
  const regionId = useId();
  const searchId = useId();
  const sizeId = useId();
  const plasmid = service === "WHOLE_PLASMID";
  const plated = container === "Plate";
  const browsePlates = plated && (groups.length > 1 || samples.length > 24);
  const searching = Boolean(query.trim());
  const selected = groups.find(group => group.id === selectedGroupId);
  const allEntries = useMemo(() => samples.map((sample, index) => ({ sample, index })), [samples]);
  const entries = searching ? allEntries.filter(entry => sampleMatchesSearch(entry.sample, query)) : browsePlates ? selected?.entries ?? [] : allEntries;
  const pageCount = Math.max(1, Math.ceil(entries.length / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  const visible = entries.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  const totalReactions = groups.reduce((sum, group) => sum + group.reactionCount, 0);
  const tableProps = { container, submissionMode, intakeVersion, plasmid };

  function downloadCsv() {
    const url = URL.createObjectURL(new Blob(["\uFEFF", samplesToCsv(samples, container)], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url; link.download = "seqforge-samples.csv";
    document.body.append(link); link.click(); link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  if (presentation === "print") return <div className="sample-browser sample-browser--full">
    <p className="sample-browser-total">{plated ? `${groups.length} ${groups.length === 1 ? "plate" : "plates"} · ` : ""}{samples.length} samples{!plasmid && ` · ${totalReactions} reactions`} · Full sample list</p>
    {groups.map(group => <section className="sample-browser-print-group" key={group.id}>
      {plated && <h3>{group.label} · {group.occupiedWells} occupied wells{!plasmid && ` · ${group.reactionCount} reactions`}</h3>}
      <SampleTable entries={group.entries} {...tableProps} full />
    </section>)}
  </div>;

  return <div className="sample-browser">
    <div className="sample-browser-toolbar">
      <p className="sample-browser-total">{plated ? `${groups.length} ${groups.length === 1 ? "plate" : "plates"} · ` : ""}{samples.length} {samples.length === 1 ? "sample" : "samples"}{!plasmid && ` · ${totalReactions} ${totalReactions === 1 ? "reaction" : "reactions"}`}</p>
      {allowExport && samples.length > 0 && <button type="button" className="sample-browser-button" onClick={downloadCsv}>Download sample list (CSV)</button>}
    </div>
    {(browsePlates || samples.length > 24) && <div className="sample-browser-search">
      <label htmlFor={searchId}>Find a sample or primer</label>
      <input id={searchId} type="search" value={query} placeholder="Sample name, plate, well, or primer" onChange={event => { setQuery(event.target.value); setPage(0); }} />
      {searching && <button type="button" className="sample-browser-button" onClick={() => { setQuery(""); setPage(0); }}>Clear search</button>}
      <p>Search covers the whole order.</p>
    </div>}
    {browsePlates && <div className="sample-browser-plates" aria-label="Plates in this order">
      {groups.map(group => <button type="button" key={group.id} className="sample-browser-plate" aria-pressed={!searching && selected?.id === group.id} aria-controls={regionId} onClick={() => { setSelectedGroupId(group.id); setQuery(""); setPage(0); }}>
        <strong>{group.label}</strong>
        <span>{group.occupiedWells} / 96 occupied wells · {group.sampleCount} samples</span>
        {!plasmid && <span>{group.reactionCount} reactions</span>}
        <span className="sample-browser-plate-action">{!searching && selected?.id === group.id ? "Viewing samples" : "View samples →"}</span>
      </button>)}
    </div>}
    <div id={regionId} className="sample-browser-results">
      {browsePlates && !searching && !selected ? <p className="sample-browser-empty">Choose a plate to view its samples and primers.</p> : <>
        {(browsePlates || searching) && <div className="sample-browser-scope"><h3>{searching ? `${entries.length} matching ${entries.length === 1 ? "sample" : "samples"} across the order` : selected?.label}</h3>{browsePlates && !searching && <button type="button" className="sample-browser-button" onClick={() => { setSelectedGroupId(null); setPage(0); }}>Close sample list</button>}</div>}
        {entries.length ? <>
          {(entries.length > 24 || pageSize === 48) && <div className="sample-browser-pagination" aria-label="Sample list pagination">
            <p aria-live="polite">Samples {currentPage * pageSize + 1}–{Math.min((currentPage + 1) * pageSize, entries.length)} of {entries.length}</p>
            <label htmlFor={sizeId}>Rows <select id={sizeId} value={pageSize} onChange={event => { setPageSize(Number(event.target.value)); setPage(0); }}><option value={24}>24</option><option value={48}>48</option></select></label>
            <button type="button" className="sample-browser-button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous</button>
            <button type="button" className="sample-browser-button" disabled={currentPage + 1 >= pageCount} onClick={() => setPage(currentPage + 1)}>Next</button>
          </div>}
          <SampleTable key={`${selected?.id ?? "all"}:${currentPage}:${pageSize}:${query}`} entries={visible} {...tableProps} />
        </> : <p className="sample-browser-empty">{searching ? "No samples match this search." : "No samples added yet."}</p>}
      </>}
    </div>
    {(browsePlates || samples.length > 24) && <p className="sample-browser-print-advice">For the full printed list, open the order’s submission manifest. The sample CSV includes every sample and primer reaction; pricing and added services are shown separately.</p>}
  </div>;
}

type TableProps = { entries: IndexedSample<SampleTableSample>[]; container: string; submissionMode: string; intakeVersion?: number; plasmid: boolean; full?: boolean };
function SampleTable({ entries, container, submissionMode, intakeVersion, plasmid, full = false }: TableProps) {
  const readyToLoad = submissionMode === "Ready to load";
  return <div className="sample-browser-table-wrap"><table className="data-table sample-browser-table">
    <caption>{plasmid ? "Whole plasmid samples · one sample per tube or well" : readyToLoad ? "Prepared reactions · one reaction per tube or well" : "Samples and primers · one row per physical sample"}</caption>
    <thead><tr><th scope="col">Location</th><th scope="col">{plasmid ? "Plasmid / sample name" : readyToLoad ? "Sample name" : "DNA name"}</th><th scope="col">{plasmid ? "Expected size" : readyToLoad ? "Original DNA type" : "DNA type"}</th><th scope="col">{plasmid ? "DNA concentration" : readyToLoad ? "Primer used" : "Primer(s)"}</th><th scope="col">{plasmid ? "Notes" : "Details"}</th></tr></thead>
    <tbody>{entries.map(entry => <SampleRows key={entry.index} {...entry} container={container} intakeVersion={intakeVersion} plasmid={plasmid} readyToLoad={readyToLoad} full={full} />)}</tbody>
  </table></div>;
}

function SampleRows({ sample, index, container, intakeVersion, plasmid, readyToLoad, full }: IndexedSample<SampleTableSample> & { container: string; intakeVersion?: number; plasmid: boolean; readyToLoad: boolean; full: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const detailsId = useId();
  const primerName = (name: string) => readyToLoad && name === "Included in mix" ? "Not specified (optional)" : name;
  const primerSource = (source: string) => readyToLoad && source === "Included in mix" ? "Completed sequencing reaction" : source;
  const hasProtocol = sample.reactions.some(reaction => reaction.specialProtocol && !["None known", "Standard"].includes(reaction.specialProtocol));
  return <Fragment>
    <tr data-sample-row={index}>
      <td data-label="Location">{container === "Plate" ? `${sample.plateLabel} / ${sample.well}` : sample.tubeLabel || "Not recorded"}</td>
      <td data-label={plasmid ? "Plasmid / sample name" : "Sample name"}><strong>{sample.sampleName}</strong><p className="sample-browser-muted">{sample.sampleKey}</p></td>
      <td data-label={plasmid ? "Expected size" : "DNA type"}>{plasmid ? sample.templateLength ? `${sample.templateLength} bp` : "Not provided" : sample.templateType}</td>
      <td data-label={plasmid ? "DNA concentration" : "Primer(s)"}>{plasmid ? sample.concentration ? `${sample.concentration} ng/µL` : "Not provided" : <>
        {sample.reactions.slice(0, 2).map((reaction, i) => <p key={i}><strong>{primerName(reaction.primerName)}</strong>{sample.reactions.length === 1 && <span className="sample-browser-muted sample-browser-block">{primerSource(reaction.primerSource)}</span>}</p>)}
        {sample.reactions.length > 2 && <p className="sample-browser-muted">+ {sample.reactions.length - 2} more primers</p>}
        {sample.reactions.length > 1 && <p className="sample-browser-muted">{sample.reactions.length} reactions</p>}
      </>}</td>
      <td data-label={plasmid ? "Notes" : "Details"}>{plasmid ? <p className="sample-browser-notes">{sample.notes || "—"}</p> : <>
        {sample.preparation && !["None requested", "Purified DNA"].includes(sample.preparation) && <p className="sample-browser-flag">{sample.preparation}</p>}
        {hasProtocol && <p className="sample-browser-flag">Special protocol requested</p>}
        {sample.notes && <p className="sample-browser-flag">Sample notes</p>}
        {!full && <button type="button" className="sample-browser-button" aria-expanded={expanded} aria-controls={detailsId} onClick={() => setExpanded(!expanded)}>{expanded ? "Hide details" : "Sample / primer details"}<span className="sr-only"> for {sample.sampleName}</span></button>}
      </>}</td>
    </tr>
    {!plasmid && (full || expanded) && <tr className="sample-browser-detail-row"><td colSpan={5}><div id={detailsId}><SampleDetails sample={sample} intakeVersion={intakeVersion} full={full} primerName={primerName} primerSource={primerSource} /></div></td></tr>}
  </Fragment>;
}

function SampleDetails({ sample, intakeVersion, full, primerName, primerSource }: { sample: SampleTableSample; intakeVersion?: number; full: boolean; primerName: (name: string) => string; primerSource: (name: string) => string }) {
  const [page, setPage] = useState(0);
  const reactions = full ? sample.reactions : sample.reactions.slice(page * 24, (page + 1) * 24);
  return <div className="sample-browser-details">
    <div className="sample-browser-specs"><p>{sample.templateLength ? `${sample.templateLength} bp` : "Length not provided"} · {sample.concentration ? `${sample.concentration}${intakeVersion === 1 ? "" : " ng/µL"}` : "DNA concentration not provided"}</p><p><strong>Preparation:</strong> {sample.preparation || "Not recorded"}</p>{sample.notes && <p className="sample-browser-notes"><strong>Notes:</strong> {sample.notes}</p>}</div>
    {!full && sample.reactions.length > 24 && <div className="sample-browser-pagination"><p>Reactions {page * 24 + 1}–{Math.min((page + 1) * 24, sample.reactions.length)} of {sample.reactions.length}</p><button type="button" className="sample-browser-button" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous primers</button><button type="button" className="sample-browser-button" disabled={(page + 1) * 24 >= sample.reactions.length} onClick={() => setPage(page + 1)}>Next primers</button></div>}
    <ol className="sample-browser-reactions" start={full ? 1 : page * 24 + 1}>{reactions.map((reaction, i) => <li key={i} data-reaction-detail="true">
      <p><strong>{primerName(reaction.primerName)}</strong> · {primerSource(reaction.primerSource)}</p>
      {reaction.primerSource === "Customer supplied" && <p>{reaction.primerConcentration ? `${reaction.primerConcentration} pmol/µL` : "Primer concentration not provided"}</p>}
      {reaction.primerSource === "Stored at SeqForge" && <p>Reference: {reaction.storedPrimerReference}</p>}
      {reaction.primerSource === "SeqForge synthesized primer" && <><p className="sample-browser-sequence">5′–{reaction.primerSequence || "Sequence not recorded"}–3′</p><p>{intakeVersion === 1 ? "Synthesis specifications not recorded" : `${reaction.purification} · ${reaction.synthesisScale}`}</p>{(reaction.modification5 || reaction.modification3 || reaction.modificationInternal) && <p>Modifications: 5′ {reaction.modification5 || "none"}; 3′ {reaction.modification3 || "none"}; internal {reaction.modificationInternal || "none"}</p>}</>}
      <p><strong>Special protocol:</strong> {reaction.specialProtocol || "Standard"}</p>
    </li>)}</ol>
  </div>;
}
