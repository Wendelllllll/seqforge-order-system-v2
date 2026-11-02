"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { hasOrderDraftChanges, orderDraftKey, persistentOrderDraftKey, persistOrderDraft, restoreOrderDraft, type OrderResumeState, type SavedOrder } from "@/lib/order-resume";
import type { OrderDraft } from "@/lib/order-intake";

const storageFailure = "Your draft could not be saved in this browser. Keep this page open and allow browser storage so your entries are not lost.";

export function useOrderDraft(mode: OrderDraft["submissionMode"], ownerId: string | null, snapshot: OrderResumeState, restore: (state: OrderResumeState) => void) {
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState("");
  const [pendingDraft, setPendingDraft] = useState<SavedOrder | null>(null);
  const initial = useRef(snapshot);
  const hasPersisted = useRef(false);
  const latest = useRef({ snapshot, restore });
  const finished = useRef(false);
  const navigating = useRef(false);
  const pendingSave = useRef<(() => void) | null>(null);
  const lastStored = useRef<string | null>(null);
  useEffect(() => { latest.current = { snapshot, restore }; });
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      try {
        const saved = restoreOrderDraft(localStorage, sessionStorage, mode, ownerId);
        if (saved && hasOrderDraftChanges(saved, initial.current)) setPendingDraft(saved);
        else if (saved) localStorage.removeItem(persistentOrderDraftKey(mode, ownerId));
        lastStored.current = localStorage.getItem(persistentOrderDraftKey(mode, ownerId));
      } catch { setStorageError(storageFailure); }
      setReady(true);
    });
    return () => { cancelled = true; };
  }, [mode, ownerId]);

  function continueDraft() {
    if (!pendingDraft) return;
    latest.current.restore(pendingDraft);
    hasPersisted.current = true;
    setPendingDraft(null);
  }

  function startFresh() {
    try {
      localStorage.removeItem(persistentOrderDraftKey(mode, ownerId));
      sessionStorage.removeItem(orderDraftKey(mode));
      hasPersisted.current = false;
      pendingSave.current = null;
      lastStored.current = null;
      setPendingDraft(null);
      setStorageError("");
    } catch { setStorageError("The saved draft could not be cleared. Allow browser storage and try again."); }
  }

  function save(state = snapshot) {
    try {
      const raw = persistOrderDraft(localStorage, mode, ownerId, state);
      // Keep the exact login handoff even if this account has another draft.
      sessionStorage.setItem(orderDraftKey(mode), raw);
      navigating.current = true;
      pendingSave.current = null;
      lastStored.current = raw;
      setStorageError("");
      return true;
    } catch {
      setStorageError(storageFailure);
      return false;
    }
  }
  useLayoutEffect(() => {
    // Flush only a pending edit. Closing an idle, older tab must never rewrite its draft.
    const flush = () => pendingSave.current?.();
    const hidden = () => { if (document.visibilityState === "hidden") flush(); };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      flush();
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, []);

  useLayoutEffect(() => {
    if (!ready || pendingDraft || finished.current || navigating.current) return;
    const key = persistentOrderDraftKey(mode, ownerId);
    const write = () => {
      if (pendingSave.current !== write) return;
      pendingSave.current = null;
      if (finished.current || navigating.current) return;
      try {
        // Avoid overwriting another tab's newer saved draft with a delayed write.
        if (localStorage.getItem(key) !== lastStored.current) {
          setStorageError("Another tab updated this draft. Keep this page open and copy any unsaved changes before reloading; this tab has not overwritten the other draft.");
          return;
        }
        if (hasOrderDraftChanges(snapshot, initial.current)) {
          lastStored.current = persistOrderDraft(localStorage, mode, ownerId, snapshot);
          hasPersisted.current = true;
        } else if (hasPersisted.current) {
          localStorage.removeItem(key);
          lastStored.current = null;
          hasPersisted.current = false;
        }
        setStorageError("");
      } catch { setStorageError(storageFailure); }
    };
    pendingSave.current = write;
    // Serialize large orders after a short pause, rather than on every keystroke.
    const timer = window.setTimeout(write, 400);
    return () => {
      window.clearTimeout(timer);
      if (pendingSave.current === write) pendingSave.current = null;
    };
  }, [snapshot, ready, pendingDraft, mode, ownerId]);

  function clear() {
    finished.current = true;
    pendingSave.current = null;
    try {
      localStorage.removeItem(persistentOrderDraftKey(mode, ownerId));
      sessionStorage.removeItem(orderDraftKey(mode));
    } catch { /* Submission already succeeded. */ }
  }
  return { ready, storageError, pendingDraft, continueDraft, startFresh, save, clear };
}
