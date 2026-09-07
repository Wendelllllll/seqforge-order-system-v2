import { getStatusLabel } from "@/lib/orders";

const styles: Record<string, string> = {
  SUBMITTED: "bg-slate-100 text-slate-700 ring-slate-200",
  RECEIVED: "bg-blue-50 text-blue-700 ring-blue-200",
  PROCESSING: "bg-amber-50 text-amber-700 ring-amber-200",
  SEQUENCED: "bg-violet-50 text-violet-700 ring-violet-200",
  QC: "bg-cyan-50 text-cyan-700 ring-cyan-200",
  COMPLETED: "bg-emerald-50 text-emerald-700 ring-emerald-200",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${
        styles[status] ?? styles.SUBMITTED
      }`}
    >
      <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
      {getStatusLabel(status)}
    </span>
  );
}
