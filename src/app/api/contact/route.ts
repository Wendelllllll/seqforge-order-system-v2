import { createContactHandler, createContactState } from "@/lib/contact";

export const runtime = "nodejs";

// Retain limits through local hot reloads. This deployment runs one app process.
const contactGlobal = globalThis as unknown as { seqforgeContactState?: ReturnType<typeof createContactState> };
const state = contactGlobal.seqforgeContactState ??= createContactState();
export const POST = createContactHandler({ state });
