# SeqForge website and portal integration

The SeqForge public website and the existing order system now share one Next.js application. Frontend contribution: rukang123. The existing backend and its Jose/Wendelllllll commit history are retained.

## Public website

The approved navy and mint frontend lives in `public/brand`. Next.js rewrites serve the homepage, About, Contact, and Molecular, Sanger, and Nanopore service pages at their public URLs. These pages retain their WebGL hero and connected laboratory interactions. Public navigation uses full document links so its styles and animation lifecycle remain isolated from the React portal.

## Account and ordering

Start Your Order opens `/orders/new`. The existing authentication guards direct visitors to the real login and registration forms. Customer and administrator portals receive matching branding while retaining their existing forms and handlers.

Online ordering currently supports Sanger. Nanopore and molecular inquiries link to Contact. The contact form remains an explicitly labeled preview; telephone contact is available. Public pricing placeholders do not replace the server-calculated order estimate.

## Backend preservation and verification

No changes are required to API handlers, business logic under `src/lib`, Prisma schemas or migrations, result storage, or database records for this frontend integration. Existing deployment and database setup instructions in README still apply.

Run `npm ci`, configure local environment variables, then `npm run db:generate` and `npm run verify`. Database persistence and authenticated end-to-end ordering require a configured PostgreSQL instance. This integration does not deploy the application or enable payments.
