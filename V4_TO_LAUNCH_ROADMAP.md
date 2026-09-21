# SeqForge V4 → Production Roadmap

Planning date: September 19, 2026. Baseline start: September 21, 2026.

## 1. What this plan means

V4 is a functional local prototype. Production requires confirmed laboratory rules, dependable hosting, recoverable data, operational billing, staff training, customer testing and support as well as frontend development. A passing build or local demo is not a launch approval.

Planning estimate: 24 calendar weeks to a production Sanger release, targeting February 22–March 7, 2027, with an additional 4–6 weeks of contingency if decisions, provider onboarding, holidays or pilot findings delay work. This is an estimate, not a delivery commitment.

Assumptions:
- One consistent engineering workstream, roughly 25–35 focused engineering hours per week, including implementation, testing, reviews, deployment and documentation. AI assistance supports this work; it does not replace business approval or field testing.
- Founder/product owner available 2–4 hours per week; a named laboratory lead available 1–2 hours per week plus acceptance sessions; a finance contact available for billing design and reconciliation.
- Customer feedback and ordinary business decisions returned within about three working days.
- Initial release is Sanger, with manually operated laboratory processing and QC-approved file delivery. Instrument automation and additional service types are separate projects.
- Pilot can use invoice/PO billing with an explicitly staffed manual process. Card payments become a release requirement only if the business needs them at launch.
- Work is planned in dependency order. The frontend/backend columns do not assume two independent engineering teams. Holiday availability must be checked in the first planning session.
- At 10–15 engineering hours/week, allow roughly 9–15 months for comparable scope. Re-estimate after the first two weeks rather than treating these dates as fixed.

## 2. Current state, verified from the local checkout

| Area | Working locally | What remains |
|---|---|---|
| Customer access | Registration, login, customer/admin roles | Email verification/recovery, production account provisioning, staff MFA, session/abuse controls and monitoring |
| Ordering | Sanger, multiple samples/primers, tube/plate selection, review and manifest | Draft persistence, practical high-volume editing, customer changes/cancellations, clearer validation and lab-approved acceptance rules |
| CSV | CSV/TSV/TXT parsing, preview/apply, sample/primer fields, separate templates | Representative real-world files, import usability, optional XLSX/mapping if customer research justifies it |
| Order integrity | Per-customer unique names, transactional numbers, retry idempotency | Long-running session/reload recovery, edit conflicts, load targets and hosted verification |
| Pricing | Versioned sequencing subtotal calculated on server | Additional fees, customer-specific agreements, adjustments, approval and finance rules |
| Account defaults | Pickup/contact/PI/billing details per account; saved order snapshots | Editable core profile, multiple saved locations, billing validation; shared lab profiles later |
| Payments | Invoice/PO preference and PO reference | Invoice lifecycle, reconciliation, unpaid/paid tracking, credits/refunds, optional card provider integration |
| Pickup | Location and instructions saved on an order | Coverage, cutoff, request date/window, queue, assignment, completion and exception handling |
| Staff workflow | All-order queue, detail, status changes, upload | Search/filter/pagination, intake checks, governed transitions, actor audit history, QC approval, exceptions and bulk tools |
| Results | One file/archive per order, local disk storage, authorized download | Durable private storage, safe replacement/recovery, QC release, failed uploads, file versions, optional per-sample files |
| Website | Functional portal and basic introductory page | Brand design, public service/pricing/help content, responsive polish, accessibility, useful interaction |
| Operations | PostgreSQL, migrations, setup, local tests | Staging/production, CI, secrets, email, alerting, backups with restore drills, rollback, operating documentation |

Evidence: README.md, PROJECT_PROGRESS.md, package.json, Prisma schema, auth configuration, customer/admin pages and API handlers inspected September 19. Prior test results are documented from September 10; this planning review did not rerun the test suite or verify remote GitHub state. Local V4 changes are still uncommitted. Older progress sections describe previous versions and sometimes contradict newer sections; the V4 README/current code take precedence.

Specific findings affecting the plan:
- The status endpoint validates a status value, but does not enforce a laboratory transition sequence or record the staff actor.
- Uploading a result currently marks the order completed immediately. Production should separate upload, QC approval and release.
- Replacing a result overwrites its database metadata without an implemented file-version history or old-file cleanup workflow. A failure between filesystem and database writes needs recovery handling.
- The admin queue currently fetches all orders, without pagination.
- The order form draft is browser component state, so refresh can discard unsaved work.
- PI and lab names are text fields, not verified lab membership or billing authorization.
- Existing automated checks cover important paths, but are not evidence of production capacity, independent security review or staff/customer acceptance.

## 3. Baseline delivery schedule

| Phase | Weeks / dates | Frontend deliverables | Backend and operations deliverables | Exit gate |
|---|---|---|---|---|
| A. Scope and foundation | 1–2 · Sep 21–Oct 4 | Observe 3–5 customer tasks, map the order journey, inventory existing screens, approve visual direction | Review and commit V4; choose supported runtime; CI; define staging/production separation, hosting/storage/email choices; agree workflow and billing rules | Approved first-release scope, owners, acceptance checklist and reproducible clean setup |
| B. Customer experience and brand | 3–6 · Oct 5–Nov 1 | Public homepage/service/help pages; consistent visual system; clearer guided order flow; plate editing; CSV error handling; accessible mobile forms | Save/resume drafts; version validation; recovery/verification emails; account profile editing; private staging; private file-storage foundation | Polished hosted demo with synthetic data; drafts survive reload; account recovery and core flow work |
| C. Laboratory workflow | 7–10 · Nov 2–Nov 29 | Searchable paginated admin queue; intake checklist; sample mismatch/hold screens; pickup queue; clear customer progress | Allowed transitions; staff actor audit; sample receipt; hold/reject/rerun handling; pickup request records; secure result upload/versioning and QC release; notification jobs | Staff complete a realistic dry run, including an incorrect sample and replacement result |
| D. Commercial operations | 11–14 · Nov 30–Dec 27 | Approved charges and billing summary; invoice/PO status; customer billing documents; optional provider-hosted card checkout | Contract pricing where needed; fee approvals; invoice numbering/status/reconciliation; notification retries; optional card webhooks/refunds; monitoring, backup restore and rollback rehearsal | Finance reconciles test orders; operational/security checklist passes; all pilot blockers closed |
| E. Supervised pilot | 15–18 · Dec 28–Jan 24 | Fix observed friction; refine instructions, confirmation, support and mobile/print experience | Invite 3–5 labs; operate limited live volume; monitor jobs/storage; reconcile charges; exercise recovery and support | Four-week observation period with no unresolved critical issues; lab and finance sign-off |
| F. Controlled expansion | 19–22 · Jan 25–Feb 21 | Improve repeat ordering, batch entry and navigation based on pilot evidence | Expand toward 10–20 labs if support capacity allows; tune measured load; migrate approved active customer/pricing data; rehearse cutover | Stable throughput and support workload; migration reconciliation; documented rollback |
| G. Production Sanger launch | 23–24 · Feb 22–Mar 7 | Final content, help/contact, launch communication and onboarding | Explicit go/no-go, approved domain cutover, staff rota, final backup/reconciliation and heightened monitoring | Production ownership accepted and launch checklist signed off |

The pilot dates overlap year-end holidays. If the lab and customers cannot actively test then, move the pilot to January and shift subsequent phases. Do not count inactive holiday weeks as pilot evidence. Provider choices and account onboarding begin in Phase A, even when integration finishes later. Infrastructure and security work run throughout phases A–D; they are not postponed until launch week.

## 4. Detailed remaining work by workstream

### Frontend: public website and brand

Before pilot:
- Obtain approved logo assets, colors, type choices, image rights and final company wording.
- Design homepage, Sanger service page, sample-preparation instructions, pricing explanation, FAQ, contact and login/signup navigation.
- Connect calls to action to the existing order application. Decide whether public pages remain in the same Next.js project and which domain paths will be used.
- Explain tube versus plate pricing, what the subtotal excludes, pickup availability and realistic turnaround wording.
- Make phone/tablet/desktop layouts work; keyboard navigation, visible focus, labels, contrast, readable errors and reduced-motion support.
- Optimize images/fonts and check slow-network behavior. Add basic metadata and search indexing rules for public pages; keep private areas private.

After core flow is reliable:
- Original SeqForge illustrations, restrained animation, interactive service chooser and synthetic result demo.
- Content editing tools only if nontechnical staff actually need frequent updates.
- More sophisticated animation is optional and must not delay ordering, accessibility or launch.

Acceptance: a new customer can identify the right service, find prep instructions and reach ordering without help; a repeat customer can get to their orders immediately.

### Frontend: customer portal and ordering

Before pilot:
- Save/resume a draft, show saved/unsaved state, and protect against accidental navigation loss.
- Review draft expiry and shared-device privacy; do not silently store sensitive sample details indefinitely in browser storage.
- Clear tube/plate workflows, visible selected mode and contextual required fields.
- Plate grid with well occupancy, duplicate-location detection, multiple plate labels and a table fallback.
- Practical bulk entry: paste, preview, row-level errors, explicit replace/append behavior and an editable result.
- Validate realistic files from customers. Current import supports matching template columns, not arbitrary Excel workbooks.
- Check duplicate names before the final confirmation as well as at server submission; clarify naming help.
- Duplicate a past order into a new draft, require a new name and recalculate current prices before confirmation.
- Account editing and saved details; decide whether multiple pickup addresses are necessary for pilot users.
- Search/filter order history, show progress and file availability, clear confirmation/retry/offline states.
- Agree customer edit/cancel cutoff; make locked orders request staff assistance.
- Test printed manifests with multi-page orders and long names.

Acceptance: novice and repeat users independently submit both tube and plate orders, resume a draft, recover from bad CSV data and find a result.

### Backend: data and business rules

Before pilot:
- Confirm canonical order statuses, permitted transitions, who can perform each change and what triggers notifications.
- Keep order identity, submitted sample identity, billing snapshot and result-release records traceable.
- Add an audit log with actor, timestamp, action and relevant changes. Record corrections and reasons without exposing credentials or unnecessary sample data in logs.
- Prevent staff/customer concurrent edits from silently overwriting changes.
- Add explicit draft/submitted distinctions; define idempotency for edits, upload finalization, billing and notifications as well as order submission.
- Validate sample acceptance: plate orientation/controls, volume/concentration requirements, preparation, stored-primer availability and difficult-template handling.
- Model holds, rejection, reruns, partial completion and cancellation to the extent needed by pilot labs.
- Add pagination and indexes based on actual queue/history queries and realistic workload measurements.
- Review all mutation endpoints consistently for origin/CSRF protection, malformed input, request-size limits, role enforcement and safe errors.

Acceptance: invalid transitions and unauthorized changes fail; retries do not duplicate effects; staff can trace a disputed order.

### Lab operations and results

Before pilot:
- Intake confirmation and physical sample-to-order matching; agree printable identifiers and barcode/QR needs with staff.
- Separate internal staff notes from customer-visible comments.
- Identify staff responsible for receipt, processing, QC and release; avoid shared administrator accounts.
- Move results from local development disk to durable private storage with server-authorized access.
- Specify permitted formats, size limits, upload controls, checksums and failed-upload cleanup. Review file scanning/quarantine needs for accepted formats.
- Separate uploaded, QC-approved and published states. A file upload must not automatically imply a completed scientific review.
- Retain versions or a documented replacement audit; define withdrawal/replacement and customer notification behavior.
- Decide whether the pilot can use one ZIP per order or needs per-sample downloads. Per-sample partial release adds scope.
- Verify backups include both database records and file objects; test missing-file and storage-outage behavior.

Later:
- AB1 chromatograms, sequence/QC views, batch downloads and annotations.
- Instrument ingestion and automatic file-to-sample matching after identifiers and QC rules are stable.

Acceptance: a technician can receive samples, flag a mismatch, upload results, obtain QC approval and release only to the correct customer; replacement does not lose traceability.

### Billing, pricing and payments

Decisions needed early:
- Who is the purchaser, PI/lab owner, billing contact and legal billing organization for the target customers?
- When is a charge final: submission, receipt, completed reactions or delivery? What happens for failed samples and reruns?
- Which existing customer-specific rates must be honored from day one?
- Who approves extras and how does the customer agree before work begins?
- Does finance invoice per order or consolidate monthly? What accounting process/tool is the source of truth?
- Which payment methods are essential for pilot and launch? Who handles overdue invoices, corrections and refunds?
- Finance must confirm applicable tax, exemption, currency and document requirements; do not invent these rules in code.

Implementation:
- Separate sequencing estimate, approved final charge, invoice and payment state.
- Add versioned authorized price agreements and fee adjustments; do not expose one customer's prices to another.
- PO validation/attachments or approval if finance requires them.
- Invoice identity, bill-to snapshot, issue/due/paid/void states, downloadable documents and reconciliation/export.
- For cards, use a provider-hosted/tokenized flow; do not collect or store raw card details in our database.
- Test webhook authentication, duplicate/out-of-order events, failed/pending payments, refunds and reconciliation if card processing is included.
- A documented manual invoice workflow is acceptable for a limited pilot if finance owns it and the UI states what is actually happening.

Acceptance: finance can trace each completed order to the correct charge, invoice and payment outcome; the customer understands whether an amount is estimated, invoiced or paid.

### Pickup and delivery

Before pilot:
- Confirm supported locations, service days, holidays, cutoff times and how customers select a pickup date/window.
- Model requested, confirmed, assigned, collected, missed and cancelled pickup states as appropriate.
- Staff queue grouped by date/location; collection contact/instructions; handoff to sample receipt.
- Clear wording when pickup is not available; shipping instructions for customers outside coverage.
- Keep immutable order delivery details while allowing new account defaults.
- Define how multiple orders at one location are consolidated and how a missed collection is communicated.

Later: route optimization, driver interface, live maps and courier integrations, if operational volume justifies them.

Acceptance: saving an address does not imply a booking; staff and customer can determine whether collection is actually scheduled and completed.

### Accounts, access and shared labs

Before pilot:
- Email verification, password recovery, secure account/session management and production-safe staff provisioning.
- Staff MFA and access revocation; decide whether lab, support, finance and administrator need separate roles at launch.
- Test unauthorized access to orders, files, saved defaults, billing documents and administrative actions.
- Validate deployment-specific session/cookie/origin configuration and abuse/rate-limit behavior; do not assume library defaults cover every custom endpoint.
- Do not ship demo credentials or synthetic data into the production environment.

Later, unless required by pilot customers:
- Organizations/labs, invitations and approved membership; PI/lab owner, ordering member and billing-contact roles.
- Explicit rules for who may order against a shared billing profile, view results, change a PO or see colleagues' orders.
- Removal/offboarding and historical ownership rules. A matching PI name or email domain must never automatically grant access.

Acceptance: access follows explicit authorization; customers can recover accounts; departing staff or members lose access as intended.

### Infrastructure, email and support

Before pilot:
- Commit/review V4 and establish repeatable builds, branch/review conventions, CI and supported Node/dependency versions.
- Separate development, staging and production databases, storage, credentials and email behavior.
- Hosting/domain/DNS/HTTPS plan; background job or queue mechanism for email and long-running work.
- Secrets management, migration deployment procedure, backup retention, file versioning and restore ownership.
- Choose business-approved recovery targets (acceptable data loss and outage duration), then test against them.
- Email provider/domain setup; order confirmation, action-required and result-ready notifications; delivery/bounce visibility and retries.
- Avoid attaching private scientific results to routine notification emails unless explicitly required; link to authenticated results.
- Error/uptime/job monitoring, alerts and a named responder; remove secrets and unnecessary customer data from logs.
- Deployment rollback and database compatibility strategy; rehearse a failed deploy and restore.
- Support contact, incident checklist, staff onboarding, account recovery support and a manual fallback for ordering/lab processing.
- Company-approved privacy/terms, data retention/deletion, customer communication and service promises; obtain appropriate business/legal review.

Acceptance: another authorized operator can deploy, recover service, locate a failed job and respond to a customer without depending on one developer's memory.

### Testing and launch assurance

Throughout development:
- Unit tests for business rules; database tests for transactions/migrations; end-to-end tests for customer/staff/payment/email workflows.
- Migration tests on representative old schemas and duplicate historical names; do not use real customer data without authorization.
- Desktop and mobile browser coverage, keyboard accessibility and realistic CSV/print cases.
- Negative permission tests, stale sessions, corrupted/oversized files, network interruptions and duplicate requests.
- Load testing based on measured target orders/day, peak concurrent users, reaction counts and result sizes agreed in Phase A.
- Independent review of authentication, authorization, uploads, payment callbacks and deployment configuration before broad release.
- Staff/customer acceptance evidence and tracked defects, not only screenshots or successful automated builds.

## 5. Work after the first Sanger launch

Do not add the following estimates together as a promise. They are separate sequential work packages for the same small team, to be re-estimated after discovery.

| Extension | Planning allowance | Prerequisites |
|---|---|---|
| Shared lab membership and billing | 4–6 engineering weeks | Confirmed membership/approval policy, billing ownership and access rules |
| Rich interactive brand experience | 2–4 engineering/design weeks | Approved original artwork/content and stable public pages |
| AB1/FASTA results viewer | 4–8 engineering weeks | Representative files, parser validation, scientific QC/display requirements, result model |
| Instrument/ABI bridge and ingestion | 8–12+ engineering weeks plus field validation | Machine access, lab identifiers, sample mapping, secure bridge operation, failure/replay procedures |
| Oligo/fragment-analysis ordering | 4–8+ engineering weeks per service | Service-specific intake, pricing, lab workflow, results and acceptance criteria |
| Pickup routing/accounting integrations | Estimate after discovery | Chosen providers/APIs and documented operational process |

A broader platform with shared labs, advanced results and instrument integration is reasonably a 9–12+ month program from this baseline at the assumed staffing. It may take longer if all service lines are included. A polished marketing site alone does not shorten scientific validation or operational integration.

## 6. Decisions, ownership and dependencies

| Decision | Owner to nominate | Needed by | Blocks |
|---|---|---|---|
| First-release services, target labs, daily/peak volumes | Founder + lab lead | Week 1 | Scope and capacity targets |
| Lab acceptance, status/QC, edits/reruns | Lab lead | Week 2 | Order validation, backend workflow and result release |
| Pickup coverage/cutoffs and fulfillment owner | Operations | Week 2 | Honest pickup UI and scheduling |
| Pricing, existing agreements, invoice/PO/payment rules | Finance + founder | Weeks 2–3 | Final billing model and pilot customer selection |
| Brand assets, page content and final approver | Founder/marketing | Week 2 | Public website build |
| Hosting/email/storage accounts, budget and maintenance owner | Founder + engineering | Week 2 | Staging and production readiness |
| Privacy/retention/service documents | Company owner + appropriate reviewer | Before pilot | Customer-facing release |
| Pilot participants and staff availability | Founder + lab lead | By Week 10 | Live validation window |
| Active-data migration versus fresh customer onboarding | Founder + operations | By Week 12 | Cutover preparation |
| Go/no-go and production domain changes | Founder + lab + finance + operations | Launch gate | Production release |

Critical dependencies:
- Lab-approved identity and workflow → result matching/QC release → dependable customer notifications → instrument automation.
- Confirmed billing rules → price/charge model → invoices/card integration → reconciliation.
- Staging and access controls + durable storage + recovery + staff training → live pilot.
- Successful pilot + reconciled cutover + named support ownership → production launch.

## 7. Pilot and launch gates

Polished demo gate (around Week 6): public design direction, usable order form, draft recovery, saved defaults, controlled staging and synthetic end-to-end demo. This is not approval for unrestricted live use.

Pilot gate (around Week 14): every order has traceable samples and billing ownership; permissions/recovery and QC release work; pickup/manual billing processes are staffed; durable storage and backup restore tested; notifications monitored; production accounts separately provisioned; required documents approved; known critical defects closed.

Pilot exit (around Week 18): 3–5 participating labs have exercised representative tube and plate work over four active weeks. All pilot orders can be accounted for from submission to result and invoice/manual reconciliation. No unresolved critical security, lost-data, sample-matching or incorrect-billing defects. Lab and finance accept the process. A quiet period without representative orders is not sufficient.

Launch gate (around Weeks 23–24): no open critical/high launch-blocking defects; workload tests meet agreed targets; staff/support ownership and fallback documented; restore/rollback rehearsed; migration reconciled; public claims and help content approved; explicit company approval for cutover. Existing production remains untouched until that approval.

## 8. Recommended next two weeks

Week 1:
1. Review and commit the local V4 work; synchronize it to GitHub when authorized.
2. Record the customer feedback as acceptance scenarios and validate V4 with the original reviewer.
3. Interview one frequent tube customer, one plate customer, a technician and finance/billing staff; use de-identified sample files.
4. Write the first-release checklist, pickup rules, status/QC diagram and billing decision sheet.
5. Inventory brand assets and approve one visual direction; establish a single prioritized backlog with owners.

Week 2:
1. Set up CI and document clean installation/runtime requirements.
2. Select staging/storage/email infrastructure, obtain required accounts and prepare a private synthetic-data staging environment.
3. Design and estimate draft persistence, order editing and plate entry before implementation.
4. Review invoice/PO workflow with finance; document what stays manual in the pilot.
5. Re-estimate the next six weeks using actual availability and the decisions above.

Weekly cadence: short product/lab review; working demonstration every two weeks; update delivered work, defects, decisions and dates in this roadmap. Avoid major feature additions mid-phase without explicitly moving another item or extending the schedule.
