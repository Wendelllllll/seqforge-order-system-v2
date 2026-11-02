import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { blankOrder, orderSchema, type OrderDraft } from "../src/lib/order-intake";
import { orderDefaultsSchema } from "../src/lib/order-defaults";
import { dropboxSnapshot, type DropboxInput, type DropboxLocation } from "../src/lib/dropboxes";
import { newPlasmidSample } from "../src/lib/whole-plasmid";

type SmokeInput = {
  base: string;
  db: PrismaClient;
  customerCookie: string;
  adminCookie: string;
  otherCustomerCookie?: string;
};
type Notification = { eventKey: string; kind: string; userId: string; recipient: string; bodyText: string; status: string; attempts: number };

// Call only from smoke-ordering.ts under the official disposable runner.
export async function runDropboxAttentionSmoke({ base, db, customerCookie, adminCookie, otherCustomerCookie }: SmokeInput) {
  const schema = process.env.SEQFORGE_SMOKE_SCHEMA || "";
  const database = new URL(process.env.DATABASE_URL || "postgresql://invalid");
  assert.match(schema, /^seqforge_smoke_[a-f0-9]{32}$/, "Run npm run test:smoke; direct execution is disabled");
  assert.equal(database.searchParams.get("schema"), schema);
  assert.ok(["localhost", "127.0.0.1"].includes(database.hostname));
  assert.equal(base, process.env.SEQFORGE_SMOKE_ORIGIN);
  assert.match(base, /^http:\/\/localhost:\d+$/);
  assert.notEqual(new URL(base).port, "3000", "Never submit synthetic orders to the working app");
  assert.equal(process.env.INTERNAL_MAIL_MODE, "preview");
  assert.equal(process.env.CUSTOMER_MAIL_MODE, "preview");
  assert.equal(process.env.CUSTOMER_MAIL_ALLOWED_RECIPIENTS, "");
  for (const variable of ["SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD"]) assert.equal(process.env[variable], "", "SMTP must remain disabled in smoke tests");
  const [actualSchema] = await db.$queryRaw<{ schema: string }[]>`SELECT current_schema() AS schema`;
  assert.equal(actualSchema.schema, schema, "The passed database must use the same disposable schema");

  const request = (path: string, cookie = "", body?: unknown, method = body === undefined ? "GET" : "POST", headers: Record<string, string> = {}) => fetch(base + path, {
    method, redirect: "manual", headers: { origin: base, ...(cookie ? { cookie } : {}), ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const customerSession = await (await request("/api/auth/get-session", customerCookie)).json() as { user: { id: string; email: string; emailVerified: boolean; role: string } };
  const adminSession = await (await request("/api/auth/get-session", adminCookie)).json() as { user: { id: string; name: string; role: string } };
  assert.equal(customerSession.user.role, "customer");
  assert.equal(customerSession.user.emailVerified, true);
  assert.equal(adminSession.user.role, "admin");
  const schedule = await (await request("/api/account/pricing", customerCookie)).json() as { revision: number; customerRevision: number; customerId: string };
  assert.equal(schedule.customerId, customerSession.user.id);
  const pricingHeaders = { "X-Pricing-Revision": String(schedule.revision), "X-Pricing-Catalog-Version": "2", "X-Customer-Pricing-Revision": String(schedule.customerRevision), "X-Pricing-Customer-Id": schedule.customerId };
  const submit = (body: unknown, key = randomUUID()) => request("/api/orders", customerCookie, body, "POST", { ...pricingHeaders, "Idempotency-Key": key });
  const stamp = randomUUID().slice(0, 8);
  const locationInput: DropboxInput = {
    name: `SMOKE Dropbox ${stamp}`, address: `100 Synthetic Way ${stamp}, San Diego, CA`,
    placementInstructions: `Synthetic lobby position ${stamp}`, pickupSchedule: "Test collection at 3 pm weekdays",
    accessNotes: "Synthetic fixture only", latitude: 32.88, longitude: -117.23, active: true,
  };
  const publicLocations = async () => {
    const response = await request("/api/dropboxes");
    assert.equal(response.status, 200);
    assert.match(response.headers.get("cache-control") || "", /no-store/);
    return (await response.json() as { locations: DropboxLocation[] }).locations;
  };
  assert.equal((await request("/dropboxes")).status, 200, "Guests can view the dropbox page");
  const initialLocations = await publicLocations();
  for (const cookie of ["", customerCookie]) {
    assert.equal((await request("/api/admin/dropboxes", cookie)).status, 403);
    assert.equal((await request("/api/admin/dropboxes", cookie, locationInput)).status, 403);
  }
  assert.equal((await request("/api/admin/dropboxes", adminCookie, locationInput, "POST", { origin: "https://untrusted.example" })).status, 403);
  assert.equal((await request("/api/admin/dropboxes", adminCookie, { ...locationInput, latitude: 95 })).status, 400);
  assert.equal((await request("/api/admin/dropboxes", adminCookie, { ...locationInput, latitude: null })).status, 400, "Coordinates must be paired");
  const create = await request("/api/admin/dropboxes", adminCookie, locationInput);
  assert.equal(create.status, 201);
  let location = (await create.json() as { location: DropboxLocation }).location;
  assert.equal(location.revision, 1);
  const originalLocation = structuredClone(location);
  const createInactive = await request("/api/admin/dropboxes", adminCookie, { ...locationInput, name: `SMOKE inactive ${stamp}`, latitude: null, longitude: null, active: false });
  assert.equal(createInactive.status, 201);
  const inactive = (await createInactive.json() as { location: DropboxLocation }).location;
  assert.ok((await publicLocations()).some(item => item.id === location.id));
  assert.ok(!(await publicLocations()).some(item => item.id === inactive.id));
  const forgedPublic = await (await request("/api/dropboxes?includeInactive=true")).json() as { locations: DropboxLocation[] };
  assert.ok(!forgedPublic.locations.some(item => item.id === inactive.id));
  const adminList = await request("/api/admin/dropboxes", adminCookie);
  assert.equal(adminList.status, 200);
  assert.match(adminList.headers.get("cache-control") || "", /private.*no-store/);
  assert.ok((await adminList.json() as { locations: DropboxLocation[] }).locations.some(item => item.id === inactive.id));

  const sanger = blankOrder();
  sanger.orderName = `SMOKE Dropbox Sanger ${stamp}`;
  sanger.fulfillment = {
    deliveryMethod: "Dropbox", dropboxId: location.id, dropbox: dropboxSnapshot(location),
    pickupLocation: "Should not survive dropbox submission", pickupInstructions: "Do not book pickup",
    contactName: "Smoke Customer", contactPhone: "555-0100", piName: "Smoke PI", billingOrganization: "Synthetic Lab",
    billingContactName: "Synthetic Finance", billingEmail: "finance@example.invalid", billingAddress: "1 Synthetic Way", paymentMethod: "Invoice",
  };
  Object.assign(sanger.samples[0], { sampleName: `Synthetic sample ${stamp}`, tubeLabel: "S1", templateLength: "3200", concentration: "100" });
  Object.assign(sanger.samples[0].reactions[0], { primerName: "T7", primerSource: "SeqForge universal primer" });
  orderSchema.parse(sanger);
  const sangerKey = randomUUID();
  const createSanger = await submit(sanger, sangerKey);
  assert.equal(createSanger.status, 201, "Sanger accepts an active dropbox");
  const sangerOrder = await createSanger.json() as { id: string; orderNumber: string };
  const savedSanger = await db.order.findUniqueOrThrow({ where: { id: sangerOrder.id }, include: { samples: true } });
  const initialFulfillment = structuredClone(savedSanger.fulfillmentSnapshot);
  const initialPrice = structuredClone(savedSanger.pricingSnapshot);
  const initialSamples = savedSanger.samples.map(sample => sample.sampleName);
  const savedDetails = orderDefaultsSchema.parse(savedSanger.fulfillmentSnapshot);
  assert.deepEqual(savedDetails.dropbox, dropboxSnapshot(originalLocation));
  assert.equal(savedDetails.pickupLocation, "");
  assert.equal(savedDetails.pickupInstructions, "");
  for (const path of [`/orders/${sangerOrder.id}`, `/admin/orders/${sangerOrder.id}`, `/manifest/${sangerOrder.id}`]) {
    const response = await request(path, path.startsWith("/admin") ? adminCookie : customerCookie);
    assert.equal(response.status, 200);
    const html = await response.text();
    for (const text of [location.name, location.address, location.placementInstructions, location.pickupSchedule]) assert.ok(html.includes(text), "Saved dropbox instructions appear in order views and manifest");
  }

  const locationPath = `/api/admin/dropboxes/${location.id}`;
  const updatedInput = { ...locationInput, name: `SMOKE moved Dropbox ${stamp}`, address: `200 New Synthetic Way ${stamp}`, placementInstructions: "New test lobby", pickupSchedule: "Test collection at 4 pm", expectedRevision: location.revision };
  for (const cookie of ["", customerCookie]) assert.equal((await request(locationPath, cookie, updatedInput, "PATCH")).status, 403);
  assert.equal((await request(locationPath, adminCookie, updatedInput, "PATCH", { origin: "https://untrusted.example" })).status, 403);
  const update = await request(locationPath, adminCookie, updatedInput, "PATCH");
  assert.equal(update.status, 200);
  location = (await update.json() as { location: DropboxLocation }).location;
  assert.equal(location.revision, originalLocation.revision + 1);
  assert.equal((await request(locationPath, adminCookie, updatedInput, "PATCH")).status, 409, "Stale admin edits cannot overwrite newer location details");
  const beforeRejected = await db.order.count({ where: { userId: customerSession.user.id } });
  const staleOrder = await submit({ ...sanger, orderName: `SMOKE stale Dropbox ${stamp}` });
  assert.equal(staleOrder.status, 409);
  assert.equal((await staleOrder.json() as { code: string }).code, "DROPBOX_CHANGED");
  assert.equal(await db.order.count({ where: { userId: customerSession.user.id } }), beforeRejected);

  const wholePlasmid: OrderDraft = {
    ...structuredClone(sanger), service: "WHOLE_PLASMID", submissionMode: "Whole plasmid", orderName: `SMOKE Dropbox plasmid ${stamp}`,
    samples: [{ ...newPlasmidSample([], "Tubes"), sampleName: `Synthetic plasmid ${stamp}`, tubeLabel: "P1", templateLength: "5000", concentration: "100" }],
    fulfillment: { ...sanger.fulfillment, dropbox: { ...dropboxSnapshot(location), name: "FORGED LOCATION", address: "FORGED ADDRESS", latitude: 1, longitude: 2 } },
  };
  orderSchema.parse(wholePlasmid);
  const createWhole = await submit(wholePlasmid);
  assert.equal(createWhole.status, 201, "Whole Plasmid accepts Dropbox and canonicalizes the location on the server");
  const wholeOrder = await createWhole.json() as { id: string; orderNumber: string };
  const wholeSaved = await db.order.findUniqueOrThrow({ where: { id: wholeOrder.id } });
  assert.deepEqual(orderDefaultsSchema.parse(wholeSaved.fulfillmentSnapshot).dropbox, dropboxSnapshot(location), "Client-supplied names, addresses and coordinates never become the saved canonical location");

  const oligo: OrderDraft = {
    ...structuredClone(sanger), service: "OLIGO", submissionMode: "Oligo standard", orderName: `SMOKE Oligo delivery ${stamp}`, samples: [],
    oligoShippingAddress: "1 Synthetic Outbound Way, San Diego, CA", oligoFormat: "Dry",
    oligos: [{ name: "Synthetic oligo", sequence: "ACGTACGTACGTACGTACGT", synthesisScale: "25 nmol", purification: "Desalted", modification5: "", modification3: "", modificationInternal: "", notes: "" }],
    fulfillment: { ...sanger.fulfillment, dropbox: dropboxSnapshot(location) },
  };
  assert.equal((await submit(oligo)).status, 400, "Oligo synthesis cannot use an incoming-sample dropbox");
  oligo.fulfillment = { ...oligo.fulfillment, deliveryMethod: "Ship to SeqForge", dropboxId: undefined, dropbox: undefined, pickupLocation: "", pickupInstructions: "" };
  orderSchema.parse(oligo);
  const createOligo = await submit(oligo);
  assert.equal(createOligo.status, 201, "The valid outbound Oligo request remains accepted");
  const oligoOrder = await createOligo.json() as { id: string; orderNumber: string };

  const offline = await request(locationPath, adminCookie, { ...location, active: false, expectedRevision: location.revision }, "PATCH");
  assert.equal(offline.status, 200);
  location = (await offline.json() as { location: DropboxLocation }).location;
  assert.ok(!(await publicLocations()).some(item => item.id === location.id));
  const unavailableOrder = await submit({ ...sanger, fulfillment: { ...sanger.fulfillment, dropbox: dropboxSnapshot(location) } });
  assert.equal(unavailableOrder.status, 409);
  assert.equal((await unavailableOrder.json() as { code: string }).code, "DROPBOX_CHANGED");
  const retryOriginal = await submit(sanger, sangerKey);
  assert.equal(retryOriginal.status, 201, "An already saved order can be safely retried after a location is disabled");
  assert.equal((await retryOriginal.json() as { id: string }).id, sangerOrder.id);
  assert.deepEqual((await db.order.findUniqueOrThrow({ where: { id: sangerOrder.id } })).fulfillmentSnapshot, initialFulfillment);
  for (const path of [`/orders/${sangerOrder.id}`, `/admin/orders/${sangerOrder.id}`, `/manifest/${sangerOrder.id}`]) {
    const html = await (await request(path, path.startsWith("/admin") ? adminCookie : customerCookie)).text();
    assert.ok(html.includes(originalLocation.name) && html.includes(originalLocation.address));
    assert.ok(!html.includes(updatedInput.name), "Later edits/offlining do not rewrite historical instructions");
  }
  const remainingLocations = await publicLocations();
  assert.deepEqual(remainingLocations.map(item => item.id).sort(), initialLocations.map(item => item.id).sort(), "No synthetic active locations remain after the checks");

  const statusPath = `/api/admin/orders/${sangerOrder.id}/status`;
  const reason = `Confirm the label on tube S1 with the lab ${stamp}. Work is paused until you reply.`;
  const hold = { status: "ON_HOLD", reason, expectedRevision: 0 };
  const holdKey = randomUUID();
  const patchStatus = (body: unknown, key = randomUUID(), cookie = adminCookie, headers: Record<string, string> = {}) => request(statusPath, cookie, body, "PATCH", { "Idempotency-Key": key, ...headers });
  for (const cookie of ["", customerCookie]) assert.equal((await patchStatus(hold, randomUUID(), cookie)).status, 403);
  assert.equal((await patchStatus(hold, randomUUID(), adminCookie, { origin: "https://untrusted.example" })).status, 403);
  assert.equal((await fetch(base + statusPath, { method: "PATCH", headers: { cookie: adminCookie, "Content-Type": "application/json", "Idempotency-Key": randomUUID() }, body: JSON.stringify(hold) })).status, 403);
  assert.equal((await patchStatus({ status: "ON_HOLD", expectedRevision: 0 })).status, 400);
  assert.equal((await request(statusPath, adminCookie, hold, "PATCH")).status, 400, "Hold mutations require a retry identity");
  assert.equal((await patchStatus({ status: "ON_HOLD", reason })).status, 400, "Hold mutations require the displayed revision");

  const uploadBody = new FormData();
  uploadBody.set("file", new Blob([`Synthetic result ${stamp}`], { type: "text/plain" }), `smoke-result-${stamp}.txt`);
  const upload = await fetch(base + `/api/admin/orders/${sangerOrder.id}/result`, { method: "POST", headers: { cookie: adminCookie, origin: base }, body: uploadBody });
  assert.equal(upload.status, 200);
  assert.equal((await patchStatus({ status: "COMPLETED", expectedRevision: 0 })).status, 409, "A completion form opened before a new upload cannot release a different file");
  hold.expectedRevision = 1;
  const storedResult = await db.result.findUniqueOrThrow({ where: { orderId: sangerOrder.id } });
  const resultPath = `/api/results/${storedResult.id}`;
  assert.equal((await request(resultPath, adminCookie)).status, 200);
  assert.equal((await request(resultPath, customerCookie)).status, 403);
  const held = await Promise.all(Array.from({ length: 4 }, () => patchStatus(hold, holdKey)));
  assert.ok(held.every(response => response.status === 200));
  const heldOrder = await db.order.findUniqueOrThrow({ where: { id: sangerOrder.id }, include: { statusHistory: true } });
  assert.equal(heldOrder.status, "ON_HOLD");
  assert.equal(heldOrder.statusRevision, 2);
  assert.equal(heldOrder.holdPreviousStatus, "SUBMITTED");
  assert.equal(heldOrder.holdReason, reason);
  assert.equal(heldOrder.statusHistory.filter(entry => entry.status === "ON_HOLD").length, 1);
  const history = heldOrder.statusHistory.find(entry => entry.status === "ON_HOLD")!;
  assert.equal(history.actorId, adminSession.user.id);
  assert.equal(history.note, reason);
  assert.equal(history.previousStatus, "SUBMITTED");
  for (const path of [`/orders/${sangerOrder.id}`, `/admin/orders/${sangerOrder.id}`]) {
    const html = await (await request(path, path.startsWith("/admin") ? adminCookie : customerCookie)).text();
    assert.ok(html.includes(reason));
    assert.ok(html.includes("needs attention") || html.includes("Needs attention"));
    if (!path.startsWith("/admin")) assert.ok(!html.includes(resultPath), "Held orders do not show a customer download link");
  }
  assert.equal((await request(resultPath, customerCookie)).status, 403);
  if (otherCustomerCookie) {
    assert.equal((await request(`/orders/${sangerOrder.id}`, otherCustomerCookie)).status, 404);
    assert.equal((await request(resultPath, otherCustomerCookie)).status, 403);
  }
  const filtered = await (await request(`/admin/orders?status=ON_HOLD&q=${encodeURIComponent(sanger.orderName)}`, adminCookie)).text();
  assert.ok(filtered.includes(`/admin/orders/${sangerOrder.id}`));
  const dashboard = await (await request("/dashboard", customerCookie)).text();
  assert.ok(dashboard.includes("Orders need your attention") && dashboard.includes(sangerOrder.orderNumber));
  assert.equal((await patchStatus({ ...hold, status: "COMPLETED", expectedRevision: 2 })).status, 409, "Hold cannot bypass explicit resolution even with a result uploaded");
  assert.equal((await patchStatus({ ...hold, reason: "Changed body" }, holdKey)).status, 409);
  const updatedReason = `Please send the lab a photo of tube S1 ${stamp}.`;
  assert.equal((await patchStatus({ status: "ON_HOLD", reason: updatedReason, expectedRevision: 2 })).status, 200);
  assert.equal((await patchStatus({ status: "RECEIVED", reason: "Resolved", expectedRevision: 2 })).status, 409, "A stale administrator cannot clear a newer hold message");
  assert.equal((await patchStatus({ status: "RECEIVED", expectedRevision: 3 })).status, 400);
  const resolution = `Tube S1 was confirmed ${stamp}. The lab can continue processing.`;
  const resolveKey = randomUUID();
  const resolve = { status: "RECEIVED", reason: resolution, expectedRevision: 3 };
  assert.equal((await patchStatus(resolve, resolveKey)).status, 200);
  assert.equal((await patchStatus(resolve, resolveKey)).status, 200);
  assert.equal((await patchStatus(hold, holdKey)).status, 200, "A delayed successful hold retry is not a new hold");
  const resumed = await db.order.findUniqueOrThrow({ where: { id: sangerOrder.id }, include: { samples: true } });
  assert.equal(resumed.status, "RECEIVED");
  assert.equal(resumed.statusRevision, 4);
  assert.equal(resumed.holdReason, null);
  assert.equal(resumed.holdPreviousStatus, null);
  assert.deepEqual(resumed.pricingSnapshot, initialPrice);
  assert.deepEqual(resumed.fulfillmentSnapshot, initialFulfillment);
  assert.deepEqual(resumed.samples.map(sample => sample.sampleName), initialSamples);
  const resumedPage = await (await request(`/orders/${sangerOrder.id}`, customerCookie)).text();
  assert.ok(resumedPage.includes("Order hold resolved") && resumedPage.includes(resolution));
  assert.equal((await request(resultPath, customerCookie)).status, 403, "Resolving a hold does not publish the uploaded result");
  assert.equal((await patchStatus({ status: "COMPLETED", expectedRevision: 4 })).status, 200);
  assert.equal((await request(resultPath, customerCookie)).status, 200);
  assert.equal((await patchStatus({ status: "ON_HOLD", reason: "The released file needs another review. Please wait for our update.", expectedRevision: 5 })).status, 200);
  assert.equal((await request(resultPath, customerCookie)).status, 403);
  assert.equal((await db.order.findUniqueOrThrow({ where: { id: sangerOrder.id } })).holdPreviousStatus, "QC");
  assert.equal((await patchStatus({ status: "QC", reason: "File review finished; release will follow.", expectedRevision: 6 })).status, 200);
  assert.equal((await patchStatus({ status: "COMPLETED", expectedRevision: 7 })).status, 200);

  for (const other of [wholeOrder, oligoOrder]) {
    const path = `/api/admin/orders/${other.id}/status`;
    assert.equal((await request(path, adminCookie, { status: "ON_HOLD", reason: `Please confirm the requested specifications ${stamp}.`, expectedRevision: 0 }, "PATCH", { "Idempotency-Key": randomUUID() })).status, 200);
    if (other.id === oligoOrder.id) assert.equal((await request(path, adminCookie, { status: "PROCESSING", reason: "Attempt to bypass quote approval", expectedRevision: 1 }, "PATCH", { "Idempotency-Key": randomUUID() })).status, 409);
    assert.equal((await request(path, adminCookie, { status: "RECEIVED", reason: "Specifications confirmed; lab review continues.", expectedRevision: 1 }, "PATCH", { "Idempotency-Key": randomUUID() })).status, 200);
  }
  const messages = await db.$queryRaw<Notification[]>`SELECT "eventKey", "kind", "userId", "recipient", "bodyText", "status", "attempts" FROM "CustomerNotification" WHERE "userId" = ${customerSession.user.id}`;
  const sangerMessages = messages.filter(message => message.bodyText.includes(`Order: ${sangerOrder.orderNumber}\n`));
  assert.equal(sangerMessages.filter(message => message.kind === "ORDER_ATTENTION").length, 3);
  assert.equal(sangerMessages.filter(message => message.kind === "ORDER_RESUMED").length, 2);
  assert.equal(sangerMessages.filter(message => message.kind === "RESULT_READY").length, 1, "Resolving and re-completing does not duplicate result-ready mail");
  for (const message of sangerMessages) {
    assert.equal(message.recipient, customerSession.user.email);
    assert.equal(message.status, "PREVIEW");
    assert.equal(message.attempts, 0);
    assert.ok(!message.bodyText.includes("finance@example.invalid"));
    assert.ok(message.bodyText.includes(`/orders/${sangerOrder.id}`));
  }
  assert.ok(sangerMessages.some(message => message.kind === "ORDER_ATTENTION" && message.bodyText.includes(reason)));
  assert.ok(sangerMessages.some(message => message.kind === "ORDER_RESUMED" && message.bodyText.includes(resolution)));
  console.log("PASS: Dropbox permissions, publication, revision conflicts, canonical immutable delivery snapshots, all-service constraints, and audited/idempotent customer-visible order holds with preview-only notifications.");
  return { orderIds: [sangerOrder.id, wholeOrder.id, oligoOrder.id], locationIds: [location.id, inactive.id] };
}
