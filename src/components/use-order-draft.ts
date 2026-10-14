"use client";

import { useEffect, useRef, useState } from "react";
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
  useEffect(() => { latest.current = { snapshot, restore }; });
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      try {
        const saved = restoreOrderDraft(localStorage, sessionStorage, mode, ownerId);
        if (saved && hasOrderDraftChanges(saved, initial.current)) setPendingDraft(saved);
        else if (saved) localStorage.removeItem(persistentOrderDraftKey(mode, ownerId));
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
      setStorageError("");
      return true;
    } catch {
      setStorageError(storageFailure);
      return false;
    }
  }
  useEffect(() => {
    if (!ready || pendingDraft || finished.current || navigating.current) return;
    let cancelled = false;
    let error = "";
    try {
      if (hasOrderDraftChanges(snapshot, initial.current)) {
        persistOrderDraft(localStorage, mode, ownerId, snapshot);
        hasPersisted.current = true;
      } else if (hasPersisted.current) {
        localStorage.removeItem(persistentOrderDraftKey(mode, ownerId));
        hasPersisted.current = false;
      }
    }
    catch { error = storageFailure; }
    queueMicrotask(() => { if (!cancelled) setStorageError(error); });
    // Save on edits, not pagehide: closing an older tab must not overwrite newer work.
    return () => { cancelled = true; };
  }, [snapshot, ready, pendingDraft, mode, ownerId]);

  function clear() {
    finished.current = true;
    try {
      localStorage.removeItem(persistentOrderDraftKey(mode, ownerId));
      sessionStorage.removeItem(orderDraftKey(mode));
    } catch { /* Submission already succeeded. */ }
  }
  return { ready, storageError, pendingDraft, continueDraft, startFresh, save, clear };
}
