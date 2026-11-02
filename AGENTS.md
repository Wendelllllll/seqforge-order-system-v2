<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Keep synthetic orders out of the working admin queue

The user uses the app on localhost:3000 for their own orders. Never submit synthetic orders to that app or its working database. Run `npm run test:smoke` for end-to-end submission checks; it starts a disposable app with a separate PostgreSQL schema and result storage. Use the same isolated setup for manual submission tests. Do not bypass the direct smoke-script guard. Read-only checks and form edits without final submission may use the working app, while preserving the user's drafts and account data.

## Release workflow preference

As of November 1, 2026, the user wants requested website changes deployed directly to the existing AWS site after appropriate checks, without a separate local-preview approval step. Continue using isolated local tests and versioned, verified deployments; do not interpret this as permission to test synthetic orders against the live database. Leave new optional-service prices unconfigured and disabled until the administrator fills them in. Preserve existing company email, the old seqforge.com website, and DNS unless the user specifically asks to change them.

## Pricing and checkout scope

Additional-service definitions (names, business, charge scope and linked treatments) are maintained by developers. Administrators may edit prices and enable or disable existing definitions, but may not create or redefine them through the UI or API. Preserve previously provisioned entries and historical order snapshots. Keep Sanger additional services in a compact column immediately after the primer column, rather than a separate expanded section below the sample table. Price management groups base rates and additional services by Sanger, Whole Plasmid and Oligo.

Customer pricing follows the same business grouping and can override sequencing base rates, standard Oligo unit prices and existing enabled/priced add-on fees. Blank inherits; zero is free. Global length boundaries, specifications, service definitions and availability remain authoritative. Preserve legacy flat customer records and format-2 envelopes/audits. Release-20 and older cannot read format-2 customer price records; after such saves, use compatible code or a forward fix rather than an incompatible rollback.

## Large Sanger orders

Sanger limits are service-specific: 1,536 physical samples and 3,072 total reactions. Whole Plasmid/Oligo remain at 250. Preserve original sample indices/keys when paging or searching; prices and validation always cover the entire order. Full manifest printing and CSV sample export must never truncate to the visible page. After large Sanger orders are saved, release-22 and older are not safe rollback targets; prefer a forward fix or code that retains the expanded capacity and price-snapshot target support.

## Fragment Analysis requests

Fragment Analysis is an independent service for fluorescently labeled PCR products, with up to 1,536 samples, no Sanger reactions and immutable order-level method requirements in `Order.fragmentSnapshot`. Prices remain unknown and submissions start on hold for laboratory confirmation and customer quote approval. Do not silently assign Sanger prices, advertise unconfirmed dye/standard support or bypass the processing/completion/result-upload gate. Quote approval is not implemented in this first intake version. After any Fragment order exists, release-28 and earlier cannot be used for rollback; retain service-compatible code or use a forward fix.
