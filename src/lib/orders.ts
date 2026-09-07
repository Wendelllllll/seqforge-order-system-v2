export const ORDER_STATUSES = [
  "SUBMITTED",
  "RECEIVED",
  "PROCESSING",
  "SEQUENCED",
  "QC",
  "COMPLETED",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const STATUS_LABELS: Record<OrderStatus, string> = {
  SUBMITTED: "Submitted",
  RECEIVED: "Received",
  PROCESSING: "Processing",
  SEQUENCED: "Sequenced",
  QC: "QC",
  COMPLETED: "Completed",
};

export const TEMPLATE_TYPES = [
  "Plasmid DNA",
  "PCR product",
  "Purified PCR product",
  "Genomic DNA",
  "Other",
] as const;

export const PRIMER_SOURCES = [
  "Customer supplied",
  "SeqForge universal primer",
  "SeqForge synthesized primer",
] as const;

export function isOrderStatus(value: string): value is OrderStatus {
  return ORDER_STATUSES.includes(value as OrderStatus);
}

export function getStatusLabel(status: string) {
  return isOrderStatus(status) ? STATUS_LABELS[status] : status;
}

export function formatDate(value: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(value);
}

export function formatDateTime(value: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(value);
}
