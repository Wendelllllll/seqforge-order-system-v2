import { safeOrderReturn } from "./order-resume";

export function safeVerificationReturn(value: unknown) {
  return typeof value === "string" ? safeOrderReturn(value) || "/dashboard" : "/dashboard";
}

export function verificationPageUrl(next: unknown) {
  return `/verify-email?next=${encodeURIComponent(safeVerificationReturn(next))}`;
}
