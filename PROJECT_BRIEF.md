# SeqForge Order System V2 — Project Brief

## 1. Project Background

We are SeqForge, Inc., a biotechnology / molecular biology service company based in San Diego, California.

SeqForge acquired / continued the operations of Retrogen in 2026.

Our current customer ordering website is:

https://order.seqforge.com

The legacy system was inherited from Retrogen and is old, unstable, and has multiple bugs. For example, new customer registration is currently affected by Google reCAPTCHA problems.

We do NOT want to spend significant effort rebuilding or preserving the legacy application.

We want to build a completely new customer ordering platform from scratch.

This new project should be treated as:

**SeqForge Order System V2**

Do not modify the existing production website unless explicitly instructed.

---

# 2. Main Goal

The goal is to build a modern sequencing / molecular biology customer ordering platform.

Eventually the system should support:

* Customer registration
* Login
* Labs / organizations
* Ordering
* Samples
* Primers
* Plates
* Customer-specific pricing
* Order tracking
* Admin workflow
* Result delivery
* Email notifications
* Local pickup
* Laboratory workflow integration
* Eventually ABI 3730 / LIMS automation

However, we are NOT building everything immediately.

We are starting with a functional prototype.

---

# 3. Current Prototype Goal

Build a functional prototype that demonstrates this workflow:

Customer
↓
Register
↓
Login
↓
Customer Dashboard
↓
Create Sanger Order
↓
Enter samples and primers
↓
Submit Order
↓
Order appears in Admin Dashboard
↓
Admin changes order status
↓
Admin uploads a result
↓
Customer sees completed order and result

This prototype should actually work locally.

It should not just be static UI mockups.

---

# 4. Prototype Scope

For the first version, implement:

## Customer side

### Registration

Fields can initially include:

* First name
* Last name
* Email
* Password
* Organization / Institution
* Lab name
* Phone, optional

No Google reCAPTCHA is required for the prototype.

### Login

Email + password.

### Customer Dashboard

Show:

* New Order button
* Recent Orders
* Order Number
* Service
* Date
* Number of samples
* Status
* View Order

Possible statuses:

* Submitted
* Received
* Processing
* Sequenced
* QC
* Completed

### New Sanger Order

Start ONLY with Sanger sequencing.

The form should support:

Order information:

* Order name / reference
* PO number, optional
* Special instructions, optional

Samples:

* Sample name
* Template type
* Concentration, optional
* Primer
* Primer source
* Notes

Primer source may eventually include:

* Customer supplied
* SeqForge universal primer
* SeqForge synthesized primer

For the prototype, keep this simple.

Allow customers to add multiple samples dynamically.

The UI should make adding many samples easy.

### Order Confirmation

After submission:

Generate a SeqForge-style order number.

Example:

SF-26090001

Show:

* Order submitted successfully
* Order number
* Number of samples
* Current status
* Order details

### Order History

Customer should see all previous prototype orders.

### Results

If an admin uploads a result file, customer should see:

Completed

and a downloadable result.

For prototype purposes, result files can simply be uploaded manually.

No ABI integration yet.

---

# 5. Admin Side

Build a simple Admin Dashboard.

Admin should be able to see:

* New orders
* Customer
* Organization / lab
* Service
* Number of samples
* Submission date
* Order status

Admin should be able to open an order and see:

* Customer information
* Samples
* Primers
* Special instructions

Admin should be able to change status:

Submitted
→ Received
→ Processing
→ Sequenced
→ QC
→ Completed

Admin should also be able to upload a result file.

Once uploaded, the customer should see it on their order page.

---

# 6. Services

SeqForge currently provides services including:

* Sanger DNA Sequencing
* Oligonucleotide Synthesis
* Fragment Analysis
* PCR Amplification
* PCR Purification
* Plasmid Purification
* Difficult Template Sequencing
* Local Sample Pickup

Future services may include nanopore sequencing.

For Prototype V1:

**Only implement Sanger ordering.**

Architect the system so additional services can be added later.

Do not hard-code the entire application around Sanger.

---

# 7. Sanger Business Context

SeqForge performs Sanger DNA sequencing.

Typical customer submission may include:

* Individual tubes
* Many samples
* 96-well plates
* Customer primers
* Universal primers
* Primer synthesis

Known existing pricing examples include approximately:

* Sanger vial / premixed reaction: around $4 per reaction for some pricing arrangements
* 96-well sequencing: around $275 / plate
* Difficult template: separate pricing
* Customer-specific pricing exists

These numbers are NOT authoritative for the prototype.

Do NOT build complicated billing yet.

Use placeholder pricing or keep pricing hidden unless specifically instructed.

Eventually the platform must support customer-specific pricing.

---

# 8. Future Data Model

Design the database with future expansion in mind.

Likely core entities:

users

organizations

labs

orders

order_items

samples

primers

plates

pricing_rules

results

attachments

pickups

Do not over-engineer the first prototype.

Use a clean relational structure.

---

# 9. Legacy Data

There is currently no requirement to perform a major historical-data migration.

The old system contains limited useful data and many technical issues.

Do not let legacy compatibility dictate the new architecture.

Important data we MAY eventually migrate:

* Customer names
* Emails
* Organizations
* Labs
* Customer-specific pricing
* Active orders

Historical Retrogen application code should NOT be copied blindly.

---

# 10. Technical Direction

Preferred initial stack:

* Next.js
* TypeScript
* Tailwind CSS
* PostgreSQL
* Prisma ORM

For local prototype development, SQLite may be used temporarily if it significantly speeds development, but structure the application so PostgreSQL can be used in production.

Authentication should use a well-supported secure authentication solution.

Do not create custom insecure authentication code if a standard library can handle it.

Use:

* reusable components
* typed models
* clean folder structure
* server-side validation
* responsive UI

Keep dependencies reasonable.

---

# 11. Design Direction

The application should feel like a professional biotechnology / laboratory service platform.

Target users:

* Academic researchers
* University laboratories
* Biotech companies
* Pharmaceutical companies
* Lab managers
* Research scientists

Design characteristics:

* Clean
* Professional
* Technical
* Modern
* Trustworthy
* Fast to use

Avoid:

* generic SaaS startup appearance
* excessive gradients
* excessive rounded cards
* giant empty whitespace
* AI-looking marketing designs
* unnecessary animations

This is primarily an operational ordering application, not a consumer app.

Customers should be able to submit an order quickly.

---

# 12. SeqForge Brand Context

Company:

SeqForge, Inc.

Main website:

https://seqforge.com

Ordering domain:

https://order.seqforge.com

Current slogan:

**Forging the Future of Genomic Science**

Important wording:

Use **Genomic Science**, not "Genomics Science."

The SeqForge logo contains a stylized Q with a DNA element.

Do not invent a replacement logo.

For the prototype, a text-based SeqForge header or placeholder logo area is acceptable until the real logo asset is provided.

---

# 13. Navigation

Customer application navigation can initially include:

SeqForge logo

Dashboard

Orders

New Order

Account

Log Out

Admin navigation:

Dashboard

Orders

Customers

Results

Settings

Do not build unnecessary pages yet.

---

# 14. Prototype Timeline

We are aiming for:

2–4 days:
Clickable visual structure

Around 1 week:
Functional core prototype

Around 2 weeks:
Good internal demo

This is NOT the production timeline.

Expected production-ready platform timeline is closer to:

4–6 months

because security, testing, edge cases, pricing logic, production infrastructure and real laboratory workflows require significantly more work.

---

# 15. Future Phases

Do NOT implement these yet, but keep them in mind.

## Phase 2

* Oligo ordering
* Fragment Analysis
* 96-well plate upload
* CSV / Excel import
* Saved primers
* Saved sample templates
* Customer-specific pricing
* Local pickup request
* Quotes
* More advanced admin tools

## Phase 3

Laboratory automation:

Customer Order
↓
Sample ID
↓
Plate Mapping
↓
Laboratory processing
↓
ABI 3730
↓
Bridge computer
↓
Automatic result ingestion
↓
Match AB1 files to orders
↓
QC
↓
Customer portal
↓
Automatic notification

Possible result types:

* .ab1
* FASTA
* PDF / QC reports

Eventually this may evolve into a lightweight custom LIMS.

Do NOT build this during the prototype phase.

---

# 16. Development Rules

Before making major architectural decisions:

Explain what you intend to do.

Prefer simple, maintainable solutions.

Do not unnecessarily rewrite working parts.

Do not modify files outside this project folder.

Do not access or modify the existing production SeqForge / Retrogen ordering system.

Do not use production credentials.

Do not assume access to customer data.

Do not deploy anything to production unless explicitly instructed.

During development:

Run the application locally.

Check for TypeScript errors.

Run builds periodically.

Fix warnings and errors rather than ignoring them.

Keep README instructions updated.

---

# 17. First Task

Start by inspecting the current project directory.

If the project is empty:

Initialize the application.

Then build ONLY the first functional vertical slice:

1. Basic SeqForge layout
2. Customer registration
3. Customer login
4. Customer dashboard
5. Create Sanger order
6. Add multiple samples
7. Submit order
8. Save the order
9. Display the order in customer Order History
10. Simple Admin Dashboard
11. Admin can view the order
12. Admin can change its status
13. Customer sees the updated status

Do NOT start with Oligos, Fragment Analysis, ABI integration, payment processing, complex pricing or production deployment.

After completing the first vertical slice:

Run it locally.

Verify the full workflow.

Then explain how I can open and test it in my browser.

I am not an experienced software developer, so keep instructions for me simple and explicit.
