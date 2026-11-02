import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { blankOrder, blankReaction, orderSchema, type OrderDraft } from "../src/lib/order-intake";
import type { OrderDefaults } from "../src/lib/order-defaults";
import { pricingSchema } from "../src/lib/pricing";
import { pricingRecord, readPricingRecord } from "../src/lib/pricing-record";
import { DEFAULT_OLIGO_PRICING, rateScheduleSchema, type AddOn, type RateSchedule } from "../src/lib/rate-schedule";

type SmokeInput = { origin: string; customerCookie: string; adminCookie: string; customerId: string; fulfillment: OrderDefaults };

/** Only the disposable runner may invoke this scenario. No standalone/live mode exists. */
export async function runPricingCatalogSmoke({ origin, customerCookie, adminCookie, customerId, fulfillment }: SmokeInput) {
  const schema = process.env.SEQFORGE_SMOKE_SCHEMA || "";
  const database = new URL(process.env.DATABASE_URL || "postgresql://invalid");
  assert.match(schema, /^seqforge_smoke_[a-f0-9]{32}$/, "Run npm run test:smoke; direct execution is disabled");
  assert.equal(database.searchParams.get("schema"), schema);
  assert.ok(["localhost", "127.0.0.1"].includes(database.hostname));
  assert.equal(origin, process.env.SEQFORGE_SMOKE_ORIGIN);
  assert.match(origin, /^http:\/\/localhost:\d+$/);
  assert.notEqual(new URL(origin).port, "3000", "Never submit synthetic orders to the working application");
  assert.equal(process.env.INTERNAL_MAIL_MODE, "preview");
  assert.equal(process.env.CUSTOMER_MAIL_MODE, "preview");
  assert.equal(process.env.CUSTOMER_MAIL_ALLOWED_RECIPIENTS, "");
  for (const variable of ["SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD"]) assert.equal(process.env[variable], "", "SMTP must remain disabled in smoke tests");

  const db = new PrismaClient();
  try {
    const [actual] = await db.$queryRaw<{ schema: string }[]>`SELECT current_schema() AS schema`;
    assert.equal(actual.schema, schema);
    const request = (path: string, cookie = "", body?: unknown, method = body === undefined ? "GET" : "POST", headers: Record<string, string> = {}) => fetch(origin + path, {
      method, redirect: "manual", headers: { origin, ...(cookie ? { cookie } : {}), ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...headers },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const customerSession = await (await request("/api/auth/get-session", customerCookie)).json() as { user: { id: string; role: string; emailVerified: boolean } };
    const adminSession = await (await request("/api/auth/get-session", adminCookie)).json() as { user: { id: string; role: string } };
    assert.equal(customerSession.user.id, customerId);
    assert.equal(customerSession.user.role, "customer");
    assert.equal(customerSession.user.emailVerified, true);
    assert.equal(adminSession.user.role, "admin");
    const getSchedule = async (cookie = "") => {
      const response = await request(cookie ? "/api/account/pricing" : "/api/pricing", cookie);
      assert.equal(response.status, 200);
      return rateScheduleSchema.parse(await response.json());
    };
    const priceHeaders = (schedule: RateSchedule) => ({ "X-Pricing-Revision": String(schedule.revision), "X-Customer-Pricing-Revision": String(schedule.customerRevision ?? 0), "X-Pricing-Customer-Id": customerId, "X-Pricing-Catalog-Version": "2" });
    const submit = (draft: OrderDraft, schedule: RateSchedule, key: string = randomUUID(), headers: Record<string, string> = {}) => request("/api/orders", customerCookie, draft, "POST", { ...priceHeaders(schedule), "Idempotency-Key": key, ...headers });
    const stamp = randomUUID().slice(0, 8);
    const disabledId = `smoke-disabled-${stamp}`;
    const wrongServiceId = `smoke-plasmid-${stamp}`;
    const unpricedId = `smoke-unpriced-${stamp}`;
    const oligoExtraId = `smoke-oligo-${stamp}`;
    // Developer-provisioned fixture definitions, never created through the
    // administrator API. All disposable database/origin/mail guards ran above.
    const fixtureSchedule = await getSchedule();
    const fixtureAddOns: AddOn[] = [...fixtureSchedule.addOns ?? [],
      { id: disabledId, name: `SMOKE Disabled service ${stamp}`, service: "SANGER", scope: "reaction", unitCents: 500, active: false, trigger: null },
      { id: wrongServiceId, name: `SMOKE Plasmid preparation ${stamp}`, service: "WHOLE_PLASMID", scope: "sample", unitCents: 100, active: true, trigger: null },
      { id: unpricedId, name: `SMOKE Unpriced service ${stamp}`, service: "SANGER", scope: "sample", unitCents: null, active: false, trigger: null },
      { id: oligoExtraId, name: `SMOKE Oligo handling ${stamp}`, service: "OLIGO", scope: "order", unitCents: 450, active: true, trigger: null },
    ];
    await db.pricingSchedule.update({ where: { id: "active" }, data: { rates: pricingRecord({ ...fixtureSchedule, addOns: fixtureAddOns }) } });
    const beforeSchedule = await getSchedule();
    const staleCustomerSchedule = await getSchedule(customerCookie);
    const historicalOrders = await db.order.findMany({ select: { id: true, pricingSnapshot: true } });
    const auditBefore = await db.pricingChange.count();

    const addOns: AddOn[] = (beforeSchedule.addOns ?? []).map(item => item.id === "pcr-cleanup" ? { ...item, active: true, unitCents: 250 } : item.id === "gc-rich" ? { ...item, active: true, unitCents: 175 } : { ...item });
    assert.ok(addOns.some(item => item.id === "pcr-cleanup" && item.active));
    assert.ok(addOns.some(item => item.id === "gc-rich" && item.active));
    const update = { revision: beforeSchedule.revision, rates: beforeSchedule.rates, oligo: DEFAULT_OLIGO_PRICING, addOns, reason: `SMOKE managed pricing catalog ${stamp}` };
    for (const cookie of ["", customerCookie]) assert.equal((await request("/api/admin/pricing", cookie, update, "PUT")).status, 403);
    assert.equal((await request("/api/admin/pricing", adminCookie, update, "PUT", { origin: "https://untrusted.example" })).status, 403);
    assert.equal((await request("/api/admin/pricing", adminCookie, { ...update, addOns: addOns.map(item => item.id === "pcr-cleanup" ? { ...item, unitCents: null } : item) }, "PUT")).status, 400);
    const forbiddenCatalogs: AddOn[][] = [
      [...addOns, { id: `smoke-forged-${stamp}`, name: "Unprovisioned service", service: "SANGER", scope: "order", unitCents: 100, active: true }],
      addOns.filter(item => item.id !== disabledId),
      addOns.map(item => item.id === disabledId ? { ...item, id: `smoke-replaced-${stamp}` } : item),
      addOns.map(item => item.id === disabledId ? { ...item, name: "Renamed by stale admin editor" } : item),
      addOns.map(item => item.id === wrongServiceId ? { ...item, service: "SANGER" } : item),
      addOns.map(item => item.id === wrongServiceId ? { ...item, scope: "order" } : item),
      addOns.map(item => item.id === disabledId ? { ...item, trigger: "RNAi" } : item),
    ];
    for (const catalog of forbiddenCatalogs) {
      const rejected = await request("/api/admin/pricing", adminCookie, { ...update, addOns: catalog }, "PUT");
      assert.equal(rejected.status, 400, "Old editors and forged API requests cannot create, remove or redefine services");
      assert.match((await rejected.json() as { error: string }).error, /development update/);
    }
    assert.deepEqual(await getSchedule(), beforeSchedule, "Rejected catalog definitions do not change prices or revision");
    assert.equal(await db.pricingChange.count(), auditBefore, "Rejected catalog definitions do not create audit records");
    const publish = await request("/api/admin/pricing", adminCookie, update, "PUT");
    assert.equal(publish.status, 200, await publish.clone().text());
    const firstSchedule = rateScheduleSchema.parse(await publish.json());
    assert.equal(firstSchedule.revision, beforeSchedule.revision + 1);
    assert.equal((await request("/api/admin/pricing", adminCookie, update, "PUT")).status, 409, "Stale admin editors cannot overwrite a newer catalog");
    assert.equal(await db.pricingChange.count(), auditBefore + 1);
    const stored = readPricingRecord((await db.pricingSchedule.findUniqueOrThrow({ where: { id: "active" } })).rates);
    assert.equal(stored.format, 2);
    assert.deepEqual(stored.oligo, DEFAULT_OLIGO_PRICING);
    assert.deepEqual(stored.addOns, addOns);
    const audit = await db.pricingChange.findUniqueOrThrow({ where: { revision: firstSchedule.revision } });
    assert.equal(audit.actorId, adminSession.user.id);
    assert.equal(audit.reason, update.reason);
    assert.deepEqual(readPricingRecord(audit.rates).addOns, addOns);
    const auditPage = await request("/admin/pricing", adminCookie);
    assert.equal(auditPage.status, 200);
    const auditHtml = await auditPage.text();
    assert.ok(auditHtml.includes(update.reason) && auditHtml.includes(`SMOKE Plasmid preparation ${stamp}`), "Admin UI displays new catalog and audit");

    const effective = await getSchedule(customerCookie);
    const sanger = blankOrder();
    sanger.orderName = `SMOKE PCR and GC pricing ${stamp}`;
    sanger.fulfillment = { ...fulfillment, deliveryMethod: "Ship to SeqForge", dropboxId: undefined, dropbox: undefined, pickupLocation: "", pickupInstructions: "" };
    sanger.poNumber = "SMOKE-PRICING";
    Object.assign(sanger.samples[0], { sampleName: `PCR ${stamp}`, tubeLabel: "PCR-1", templateType: "PCR product", templateLength: "900", concentration: "25", preparation: "PCR cleanup requested", addOnIds: ["pcr-cleanup"] });
    sanger.samples[0].reactions = ["T7", "M13F"].map(primerName => ({ ...blankReaction(), primerName, primerSource: "SeqForge universal primer", specialProtocol: "GC-rich", addOnIds: ["gc-rich"] }));
    orderSchema.parse(sanger);
    const beforeRejected = await db.order.count();
    const stale = await submit(sanger, staleCustomerSchedule);
    assert.equal(stale.status, 409);
    assert.equal((await stale.json() as { code: string }).code, "PRICE_CHANGED");
    // A pre-catalog Sanger client may refresh the revision while still knowing
    // only base sequencing prices. Existing PCR/GC flags must not incur fees
    // that its old UI could not display, even when no explicit add-on IDs exist.
    const legacySanger = structuredClone(sanger);
    delete legacySanger.addOnIds;
    for (const sample of legacySanger.samples) {
      delete sample.addOnIds;
      for (const reaction of sample.reactions) delete reaction.addOnIds;
    }
    orderSchema.parse(legacySanger);
    const legacyHeaders = Object.fromEntries(Object.entries(priceHeaders(effective)).filter(([name]) => name !== "X-Pricing-Catalog-Version"));
    const legacySangerResponse = await request("/api/orders", customerCookie, legacySanger, "POST", { ...legacyHeaders, "Idempotency-Key": randomUUID() });
    assert.equal(legacySangerResponse.status, 409, "Old Sanger clients cannot accept unseen automatic PCR/GC fees, even with the current price revision");
    const legacyError = await legacySangerResponse.json() as { code: string; error: string };
    assert.equal(legacyError.code, "FORM_OUTDATED");
    assert.match(legacyError.error, /Refresh the page.*saved draft/i, "Old forms display clear reload guidance instead of looping through price review");
    assert.equal(await db.order.count(), beforeRejected, "Missing catalog-version rejection must not create an order");
    const invalid = [
      { ...structuredClone(sanger), addOnIds: ["forged-service"] },
      (() => { const draft = structuredClone(sanger); draft.samples[0].reactions[0].addOnIds = [disabledId]; return draft; })(),
      (() => { const draft = structuredClone(sanger); draft.samples[0].addOnIds = ["gc-rich"]; return draft; })(),
      (() => { const draft = structuredClone(sanger); draft.samples[0].addOnIds = [wrongServiceId]; return draft; })(),
      (() => { const draft = structuredClone(sanger); draft.samples[0].addOnIds = ["pcr-cleanup", "pcr-cleanup"]; return draft; })(),
    ];
    for (const draft of invalid) assert.equal((await submit(draft, effective)).status, 400, "Unavailable, forged, mismatched and duplicate selections are rejected");
    assert.equal(await db.order.count(), beforeRejected, "Rejected catalog submissions do not create orders");

    const sangerKey = randomUUID();
    const savedSanger = await submit(sanger, effective, sangerKey);
    assert.equal(savedSanger.status, 201, await savedSanger.clone().text());
    const sangerResult = await savedSanger.json() as { id: string; orderNumber: string };
    const sangerRecord = await db.order.findUniqueOrThrow({ where: { id: sangerResult.id }, include: { samples: { include: { reactions: true } } } });
    assert.equal(sangerRecord.samples.length, 1);
    assert.equal(sangerRecord.samples[0].reactions.length, 2);
    const sangerPrice = pricingSchema.parse(sangerRecord.pricingSnapshot);
    assert.equal(sangerPrice.subtotalCents, 2 * effective.rates["sanger-standard-tubes"] + 250 + 2 * 175);
    const pcr = sangerPrice.lines.find(line => line.addOnId === "pcr-cleanup");
    const gc = sangerPrice.lines.find(line => line.addOnId === "gc-rich");
    assert.equal(pcr?.quantity, 1, "PCR cleanup is charged once per physical sample, not once per primer");
    assert.equal(pcr?.amountCents, 250);
    assert.equal(gc?.quantity, 2);
    assert.equal(gc?.amountCents, 350);
    assert.equal(pcr?.targets?.length, 1);
    assert.equal(gc?.targets?.length, 2);
    for (const path of [`/orders/${sangerResult.id}`, `/admin/orders/${sangerResult.id}`, `/manifest/${sangerResult.id}`]) {
      const response = await request(path, path.startsWith("/admin") ? adminCookie : customerCookie);
      assert.equal(response.status, 200);
      const html = await response.text();
      assert.ok(html.includes("PCR cleanup") && html.includes("GC-rich sequencing"), "Saved additional-service names are visible to customer and staff");
    }

    const oligo: OrderDraft = {
      ...structuredClone(sanger), orderName: `SMOKE 60 and 61 bp ${stamp}`, service: "OLIGO", submissionMode: "Oligo standard", samples: [],
      oligoShippingAddress: "1 Synthetic Outbound Way, San Diego, CA", oligoFormat: "Dry",
      oligos: [60, 61].map(length => ({ name: `Oligo-${length}`, sequence: "A".repeat(length), synthesisScale: "25 nmol", purification: "Desalted", modification5: "", modification3: "", modificationInternal: "", notes: "" })),
    };
    orderSchema.parse(oligo);
    const withoutVersion = await submit(oligo, effective, randomUUID(), { "X-Pricing-Catalog-Version": "" });
    assert.equal(withoutVersion.status, 409, "Old Oligo clients must review current tier pricing");
    assert.equal((await withoutVersion.json() as { code: string }).code, "FORM_OUTDATED");
    const oligoKey = randomUUID();
    const savedOligo = await submit(oligo, effective, oligoKey);
    assert.equal(savedOligo.status, 201, await savedOligo.clone().text());
    const oligoResult = await savedOligo.json() as { id: string; orderNumber: string };
    const oligoRecord = await db.order.findUniqueOrThrow({ where: { id: oligoResult.id } });
    const oligoPrice = pricingSchema.parse(oligoRecord.pricingSnapshot);
    assert.equal(oligoPrice.subtotalCents, 5770);
    assert.equal(oligoPrice.pendingQuote, false);
    assert.deepEqual(oligoPrice.lines.map(line => [line.quantity, line.unitCents, line.amountCents]), [[60, 25, 1500], [61, 70, 4270]]);
    for (const table of ["customer", "internal"] as const) {
      const notice = table === "customer" ? await db.customerNotification.findUniqueOrThrow({ where: { eventKey: `order:${oligoResult.id}` } }) : await db.internalNotification.findUniqueOrThrow({ where: { eventKey: `order:${oligoResult.id}` } });
      assert.equal(notice.status, "PREVIEW");
      assert.equal(notice.attempts, 0);
      for (const amount of ["$0.25", "$0.70", "$15.00", "$42.70", "$57.70"]) assert.ok(notice.bodyText.includes(amount), "Preview mail describes both tiers accurately");
    }

    const secondInput = { revision: firstSchedule.revision, rates: firstSchedule.rates, oligo: { ...DEFAULT_OLIGO_PRICING, longUnitCents: 80 }, addOns: addOns.map(item => item.id === "pcr-cleanup" ? { ...item, unitCents: 300 } : item.id === "gc-rich" ? { ...item, active: false } : item), reason: `SMOKE later catalog revision ${stamp}` };
    const second = await request("/api/admin/pricing", adminCookie, secondInput, "PUT");
    assert.equal(second.status, 200);
    const latest = await getSchedule(customerCookie);
    assert.equal(latest.revision, effective.revision + 1);
    assert.equal((await submit(oligo, effective)).status, 409, "Oligo submissions also enforce the displayed revision");
    assert.equal((await submit(sanger, latest)).status, 400, "Disabling a selected service requires customer review");
    for (const [draft, key, id] of [[sanger, sangerKey, sangerResult.id], [oligo, oligoKey, oligoResult.id]] as const) {
      const retry = await submit(draft, effective, key);
      assert.equal(retry.status, 201, "Retrying an already-saved order does not reprice or reject retired selections");
      assert.equal((await retry.json() as { id: string }).id, id);
    }
    assert.deepEqual((await db.order.findUniqueOrThrow({ where: { id: sangerResult.id } })).pricingSnapshot, sangerRecord.pricingSnapshot);
    assert.deepEqual((await db.order.findUniqueOrThrow({ where: { id: oligoResult.id } })).pricingSnapshot, oligoRecord.pricingSnapshot);
    for (const old of historicalOrders) assert.deepEqual((await db.order.findUniqueOrThrow({ where: { id: old.id } })).pricingSnapshot, old.pricingSnapshot, "Updating the catalog never rewrites earlier order snapshots");
    assert.equal(await db.customerNotification.count({ where: { eventKey: `order:${oligoResult.id}` } }), 1);
    assert.equal(await db.internalNotification.count({ where: { eventKey: `order:${oligoResult.id}` } }), 1);

    // Personal agreements are tested through the same authenticated API used by
    // the editor. Only this disposable schema can reach this guarded scenario.
    const customPath = `/api/admin/customers/${customerId}/pricing`;
    const publicBeforeCustom = await getSchedule();
    const customInput = {
      revision: latest.customerRevision ?? 0,
      overrides: { "sanger-standard-tubes": 400, "plasmid-tubes": 350 },
      oligoOverrides: { shortUnitCents: 0, longUnitCents: 50 },
      addOnOverrides: { "pcr-cleanup": 0, [wrongServiceId]: 0, [oligoExtraId]: 100 },
      reason: `SMOKE customer Oligo and service agreement ${stamp}`,
    };
    const beforeCustomAudit = await db.customerPricingChange.count({ where: { customerId } });
    for (const cookie of ["", customerCookie]) assert.equal((await request(customPath, cookie, customInput, "PUT")).status, 403);
    const invalidAgreements = [
      { ...customInput, addOnOverrides: { "unknown-service": 100 } },
      { ...customInput, addOnOverrides: { [disabledId]: 0 } },
      { ...customInput, addOnOverrides: { [unpricedId]: 0 } },
      { ...customInput, addOnOverrides: { [oligoExtraId]: 0.5 } },
      { ...customInput, oligoOverrides: { shortMaxBases: 100 } },
      { ...customInput, oligoOverrides: { longUnitCents: -1 } },
    ];
    for (const input of invalidAgreements) assert.equal((await request(customPath, adminCookie, input, "PUT")).status, 400, "Personal agreements cannot invent services, enable unavailable items or change tier boundaries");
    assert.equal(await db.customerPricingChange.count({ where: { customerId } }), beforeCustomAudit);
    assert.deepEqual(await getSchedule(customerCookie), latest);
    const saveCustom = await request(customPath, adminCookie, customInput, "PUT");
    assert.equal(saveCustom.status, 200, await saveCustom.clone().text());
    const customResult = await saveCustom.json() as { revision: number };
    assert.equal(customResult.revision, customInput.revision + 1);
    const personal = await getSchedule(customerCookie);
    assert.deepEqual(personal.oligo, { ...publicBeforeCustom.oligo, shortUnitCents: 0, longUnitCents: 50 });
    assert.deepEqual(personal.overriddenOligoKeys, ["shortUnitCents", "longUnitCents"]);
    assert.ok(personal.overriddenAddOnIds?.includes("pcr-cleanup"));
    assert.equal(personal.addOns?.find(item => item.id === oligoExtraId)?.unitCents, 100);
    assert.deepEqual(await getSchedule(), publicBeforeCustom, "Personal agreements never alter guest/default prices");
    const storedAgreement = (await db.customerPricing.findUniqueOrThrow({ where: { userId: customerId } })).overrides as { format: number; oligoOverrides: unknown; addOnOverrides: unknown };
    assert.equal(storedAgreement.format, 2);
    assert.deepEqual(storedAgreement.oligoOverrides, customInput.oligoOverrides);
    assert.deepEqual(storedAgreement.addOnOverrides, customInput.addOnOverrides);
    const customAudit = await db.customerPricingChange.findFirstOrThrow({ where: { customerId, revision: customResult.revision } });
    assert.deepEqual(customAudit.overrides, storedAgreement);
    assert.equal(customAudit.reason, customInput.reason);

    const personalSanger = structuredClone(sanger);
    personalSanger.orderName = `SMOKE personal Sanger ${stamp}`;
    personalSanger.samples[0].reactions = personalSanger.samples[0].reactions.map(item => ({ ...item, specialProtocol: "None known", addOnIds: [] }));
    const personalOligo: OrderDraft = { ...structuredClone(oligo), orderName: `SMOKE personal Oligo ${stamp}`, addOnIds: [oligoExtraId] };
    const personalPlasmid: OrderDraft = { ...structuredClone(sanger), orderName: `SMOKE personal Plasmid ${stamp}`, service: "WHOLE_PLASMID", submissionMode: "Whole plasmid", samples: [{ ...structuredClone(sanger.samples[0]), templateType: "Plasmid DNA", templateLength: "5000", preparation: "None requested", addOnIds: [wrongServiceId], reactions: [] }] };
    const beforeStaleCustomer = await db.order.count();
    const stalePersonalOligo = await submit(personalOligo, latest);
    assert.equal(stalePersonalOligo.status, 409);
    assert.equal((await stalePersonalOligo.json() as { code: string }).code, "PRICE_CHANGED");
    assert.equal(await db.order.count(), beforeStaleCustomer, "An old customer agreement never writes an order");
    const personalOrders: { draft: OrderDraft; key: string; id: string; snapshot: unknown }[] = [];
    for (const [draft, total] of [[personalSanger, 800], [personalOligo, 3150], [personalPlasmid, 350]] as const) {
      orderSchema.parse(draft);
      const key = randomUUID();
      const response = await submit(draft, personal, key);
      assert.equal(response.status, 201, await response.clone().text());
      const { id } = await response.json() as { id: string };
      const record = await db.order.findUniqueOrThrow({ where: { id } });
      const price = pricingSchema.parse(record.pricingSnapshot);
      assert.equal(price.subtotalCents, total, "Submitted total matches the effective customer schedule");
      assert.equal(price.customerPricingRevision, personal.customerRevision);
      assert.ok(price.lines.every(line => line.customPrice), "All agreed base and selected add-on lines retain their source");
      assert.ok(price.lines.some(line => line.unitCents === 0), "Zero agreements remain an explicit zero unit charge");
      for (const path of [`/orders/${id}`, `/manifest/${id}`, `/admin/orders/${id}`]) {
        const html = await (await request(path, path.startsWith("/admin") ? adminCookie : customerCookie)).text();
        assert.ok(html.includes("Customer price") && html.includes("$0.00"), "Customer, staff and print views display saved personal prices including zero");
      }
      const notice = await db.customerNotification.findUniqueOrThrow({ where: { eventKey: `order:${id}` } });
      assert.equal(notice.status, "PREVIEW");
      assert.equal(notice.attempts, 0);
      assert.ok(notice.bodyText.includes("$0.00"), "Confirmation mail uses the saved effective zero price");
      personalOrders.push({ draft, key, id, snapshot: record.pricingSnapshot });
    }

    // A pre-upgrade editor sends only base overrides. Its update must preserve
    // the newer Oligo/add-on maps instead of silently erasing the agreement.
    const oldEditor = await request(customPath, adminCookie, { revision: personal.customerRevision, overrides: { ...customInput.overrides, "sanger-standard-tubes": 425 }, reason: `SMOKE old editor ${stamp}` }, "PUT");
    assert.equal(oldEditor.status, 200);
    const afterOldEditor = await getSchedule(customerCookie);
    assert.equal(afterOldEditor.rates["sanger-standard-tubes"], 425);
    assert.deepEqual(afterOldEditor.oligo, personal.oligo);
    assert.deepEqual(afterOldEditor.addOns, personal.addOns);
    const laterGlobal = await getSchedule();
    const changeDefaults = await request("/api/admin/pricing", adminCookie, {
      revision: laterGlobal.revision, rates: { ...laterGlobal.rates, "sanger-standard-tubes": 625, "plasmid-tubes": 800 },
      oligo: { ...laterGlobal.oligo, shortUnitCents: 30, longUnitCents: 90 },
      addOns: laterGlobal.addOns?.map(item => item.id === "pcr-cleanup" ? { ...item, active: false, unitCents: 350 } : item.id === wrongServiceId ? { ...item, active: false, unitCents: null } : item.id === oligoExtraId ? { ...item, unitCents: 500 } : item),
      reason: `SMOKE defaults after personal agreement ${stamp}`,
    }, "PUT");
    assert.equal(changeDefaults.status, 200, await changeDefaults.clone().text());
    const afterDefaults = await getSchedule(customerCookie);
    assert.deepEqual(afterDefaults.oligo, personal.oligo, "Fixed personal Oligo unit prices survive default-rate changes");
    assert.equal(afterDefaults.rates["sanger-standard-tubes"], 425);
    assert.equal(afterDefaults.addOns?.find(item => item.id === oligoExtraId)?.unitCents, 100);
    assert.equal(afterDefaults.addOns?.find(item => item.id === "pcr-cleanup")?.active, false);
    assert.equal(afterDefaults.addOns?.find(item => item.id === "pcr-cleanup")?.unitCents, 350);
    assert.equal(afterDefaults.addOns?.find(item => item.id === wrongServiceId)?.unitCents, null);
    assert.ok(!afterDefaults.overriddenAddOnIds?.includes("pcr-cleanup") && !afterDefaults.overriddenAddOnIds?.includes(wrongServiceId), "Unavailable agreements stay saved but do not change effective availability or prices");
    assert.equal((await submit(personalSanger, afterDefaults)).status, 400, "A stored free agreement cannot enable a disabled selected service");
    assert.equal((await request(customPath, adminCookie, { revision: afterDefaults.customerRevision, overrides: { ...customInput.overrides, "sanger-standard-tubes": 425 }, addOnOverrides: { ...customInput.addOnOverrides, "pcr-cleanup": 1 }, reason: "Cannot alter an unavailable agreement" }, "PUT")).status, 400);
    const keepUnavailable = await request(customPath, adminCookie, { revision: afterDefaults.customerRevision, overrides: { ...customInput.overrides, "sanger-standard-tubes": 425 }, oligoOverrides: customInput.oligoOverrides, addOnOverrides: customInput.addOnOverrides, reason: "Keep unchanged unavailable agreements" }, "PUT");
    assert.equal(keepUnavailable.status, 200, "Previously saved unavailable values can be retained unchanged");
    const beforeReset = await getSchedule(customerCookie);
    const reset = await request(customPath, adminCookie, { revision: beforeReset.customerRevision, overrides: {}, oligoOverrides: {}, addOnOverrides: {}, reason: `SMOKE inherit latest defaults ${stamp}` }, "PUT");
    assert.equal(reset.status, 200);
    const inherited = await getSchedule(customerCookie);
    const finalPublic = await getSchedule();
    assert.deepEqual(inherited.oligo, finalPublic.oligo);
    assert.deepEqual(inherited.addOns, finalPublic.addOns);
    assert.deepEqual(inherited.rates, finalPublic.rates);
    assert.deepEqual(inherited.overriddenOligoKeys, []);
    assert.deepEqual(inherited.overriddenAddOnIds, []);
    assert.equal((await submit(personalOligo, afterDefaults)).status, 409, "Clearing personal prices invalidates the prior customer quote");
    const inheritedOrder = await submit({ ...personalOligo, orderName: `SMOKE inherited Oligo ${stamp}` }, inherited);
    assert.equal(inheritedOrder.status, 201);
    const inheritedId = (await inheritedOrder.json() as { id: string }).id;
    const inheritedPrice = pricingSchema.parse((await db.order.findUniqueOrThrow({ where: { id: inheritedId } })).pricingSnapshot);
    assert.equal(inheritedPrice.subtotalCents, 7790);
    assert.ok(!inheritedPrice.lines.some(line => line.customPrice));
    for (const saved of personalOrders) {
      const retry = await submit(saved.draft, personal, saved.key);
      assert.equal(retry.status, 201);
      assert.equal((await retry.json() as { id: string }).id, saved.id);
      assert.deepEqual((await db.order.findUniqueOrThrow({ where: { id: saved.id } })).pricingSnapshot, saved.snapshot, "Old customer price snapshots survive default edits, disablement and reset");
      assert.equal(await db.customerNotification.count({ where: { eventKey: `order:${saved.id}` } }), 1);
    }
    for (const old of historicalOrders) assert.deepEqual((await db.order.findUniqueOrThrow({ where: { id: old.id } })).pricingSnapshot, old.pricingSnapshot);
    console.log("PASS: personal Oligo/add-on billing, zero prices, scope and source labels, unavailable/unknown rejection, legacy editor preservation, fixed/default inheritance, immutable snapshots and idempotent retries.");
    console.log("PASS: immutable admin service definitions, editable prices/availability with audit, sample/reaction fee counts, invalid add-ons, Oligo 60/61 tiers, stale price rejection, saved snapshot integrity and preview mail.");
  } finally { await db.$disconnect(); }
}
