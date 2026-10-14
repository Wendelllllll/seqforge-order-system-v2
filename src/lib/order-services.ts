import type { OrderDraft } from "@/lib/order-intake";

export type ServiceOption = {
  id: string;
  name: string;
  description: string;
  submissionMode?: OrderDraft["submissionMode"];
};

export type OrderService = {
  id: string;
  name: string;
  shortName: string;
  description: string;
  caption: string;
  options: readonly ServiceOption[];
};

export const ORDER_SERVICES: readonly OrderService[] = [
  {
    id: "oligo",
    name: "Oligo synthesis",
    shortName: "Oligo synthesis",
    description: "Build the DNA oligos you need for your next experiment.",
    caption: "Standard DNA · Modified DNA",
    options: [
      { id: "standard", name: "Standard DNA oligos", description: "Unmodified DNA oligonucleotides for primers and other research applications." },
      { id: "modified", name: "Modified DNA oligos", description: "DNA oligos with requested 5′, 3′, or internal modifications." },
    ],
  },
  {
    id: "whole-plasmid",
    name: "Whole Plasmid Sequencing",
    shortName: "Whole plasmid",
    description: "Explore your complete plasmid, from insert to backbone.",
    caption: "Complete plasmid sequence",
    options: [],
  },
  {
    id: "sanger",
    name: "Sanger sequencing",
    shortName: "Sanger",
    description: "Read a targeted DNA region with the sample setup that fits your workflow.",
    caption: "Standard · Pre-mixed · Ready to load",
    options: [
      { id: "standard", name: "Standard", description: "Supply your DNA and primers separately.", submissionMode: "Standard" },
      { id: "pre-mixed", name: "Pre-mixed", description: "Send DNA and primer already mixed together.", submissionMode: "Pre-mixed" },
      { id: "ready-to-load", name: "Ready to load", description: "Send prepared sequencing reactions, ready for loading.", submissionMode: "Ready to load" },
    ],
  },
];

export function orderServiceUrl(service?: string, option?: string) {
  const query = new URLSearchParams();
  if (service) query.set("service", service);
  if (option) query.set("type", option);
  return `/orders/new${query.size ? `?${query}` : ""}`;
}
