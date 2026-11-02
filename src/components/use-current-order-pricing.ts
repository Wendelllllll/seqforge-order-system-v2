"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { rateScheduleSchema, type RateSchedule } from "@/lib/rate-schedule";

/** Refresh the catalog without replacing form rows, imports, or saved drafts. */
export function useCurrentOrderPricing(options: {
  userId: string | null;
  schedule: RateSchedule;
  enabled: boolean;
  paused: boolean;
  onUpdate: (schedule: RateSchedule) => void;
  onAccountChange: () => void;
}) {
  const current = useRef(options);
  const request = useRef<AbortController | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [status, setStatus] = useState("");
  useEffect(() => { current.current = options; });

  const refresh = useCallback(async (manual = false) => {
    const context = current.current;
    if (!context.enabled || request.current) return;
    if (context.paused) {
      if (manual) setStatus("Resolve the pending submission before refreshing services. Your current selections are preserved for a safe retry.");
      return;
    }
    const controller = new AbortController();
    request.current = controller;
    setRefreshing(true);
    try {
      const response = await fetch(context.userId ? "/api/account/pricing" : "/api/pricing", { cache: "no-store", signal: controller.signal });
      if (controller.signal.aborted || !current.current.enabled || current.current.paused || current.current.userId !== context.userId) return;
      if (response.status === 401 && context.userId) {
        context.onAccountChange();
        setStatus("Your sign-in changed. Sign back in to continue with this account’s prices.");
        return;
      }
      if (!response.ok) throw new Error("Pricing unavailable");
      const latest = rateScheduleSchema.parse(await response.json());
      if (controller.signal.aborted || current.current.paused || current.current.userId !== context.userId) return;
      if ((latest.customerId || null) !== context.userId) {
        context.onAccountChange();
        setStatus("Your sign-in changed. Reload for the current account before continuing.");
        return;
      }
      const previous = current.current.schedule;
      // A delayed response must not replace a newer catalog returned during submission.
      if (latest.revision < previous.revision || (latest.customerRevision ?? 0) < (previous.customerRevision ?? 0)) return;
      if (JSON.stringify(latest) !== JSON.stringify(previous)) {
        current.current.onUpdate(latest);
        setStatus("Services and prices updated. Your sample entries are unchanged.");
      } else if (manual) setStatus("You’re viewing the latest services and prices.");
    } catch {
      if (!controller.signal.aborted) setStatus("Couldn’t refresh services. Your entries are safe; try Refresh services again.");
    } finally {
      if (request.current === controller) {
        request.current = null;
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!options.enabled) return;
    const onFocus = () => { if (document.visibilityState === "visible") void refresh(); };
    let active = true;
    queueMicrotask(() => { if (active) void refresh(); });
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      active = false;
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
      request.current?.abort();
      request.current = null;
    };
  }, [options.enabled, options.userId, refresh]);

  return { refresh, refreshing, status };
}
