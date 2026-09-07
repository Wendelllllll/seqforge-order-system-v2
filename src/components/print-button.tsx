"use client";

import { Printer } from "lucide-react";

export function PrintButton() {
  return (
    <button type="button" className="button-secondary justify-center print:hidden" onClick={() => window.print()}>
      <Printer className="h-4 w-4" /> Print order
    </button>
  );
}
