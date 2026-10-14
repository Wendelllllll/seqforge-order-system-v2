<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Keep synthetic orders out of the working admin queue

The user uses the app on localhost:3000 for their own orders. Never submit synthetic orders to that app or its working database. Run `npm run test:smoke` for end-to-end submission checks; it starts a disposable app with a separate PostgreSQL schema and result storage. Use the same isolated setup for manual submission tests. Do not bypass the direct smoke-script guard. Read-only checks and form edits without final submission may use the working app, while preserving the user's drafts and account data.
