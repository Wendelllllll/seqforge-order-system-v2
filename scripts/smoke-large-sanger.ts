import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { blankOrder, blankSample, blankReaction, orderSchema } from "../src/lib/order-intake";
import { priceOrder, pricingSchema } from "../src/lib/pricing";
import { rateScheduleSchema } from "../src/lib/rate-schedule";
import type { OrderDefaults } from "../src/lib/order-defaults";

export async function runLargeSangerSmoke({ origin, customerCookie, adminCookie, customerId, fulfillment }: {
  origin: string; customerCookie: string; adminCookie: string; customerId: string; fulfillment: OrderDefaults;
}) {
  const schema = process.env.SEQFORGE_SMOKE_SCHEMA || "";
  assert.match(schema, /^seqforge_smoke_[a-f0-9]{32}$/);
  assert.equal(new URL(process.env.DATABASE_URL!).searchParams.get("schema"), schema);
  assert.match(origin, /^http:\/\/localhost:\d+$/);
  assert.notEqual(new URL(origin).port, "3000");
  assert.equal(process.env.CUSTOMER_MAIL_MODE, "preview");
  assert.equal(process.env.INTERNAL_MAIL_MODE, "preview");
  assert.equal(process.env.SMTP_PASSWORD, "");
  const db = new PrismaClient();
  try {
    const scheduleResponse = await fetch(`${origin}/api/account/pricing`, { headers: { cookie: customerCookie } });
    assert.equal(scheduleResponse.status, 200);
    const schedule = rateScheduleSchema.parse(await scheduleResponse.json());
    const draft = orderSchema.parse({
      ...blankOrder(), orderName: "ISOLATED eight plates two primers", container: "Plate", fulfillment,
      samples: Array.from({ length: 768 }, (_, i) => ({
        ...blankSample(`S${i + 1}`), sampleName: `Bulk-${String(i + 1).padStart(4, "0")}`,
        plateLabel: `Plate-${String(Math.floor(i / 96) + 1).padStart(2, "0")}`,
        well: `${"ABCDEFGH"[i % 8]}${Math.floor((i % 96) / 8) + 1}`,
        templateLength: "5000", concentration: "100",
        reactions: ["T7", "T3"].map(primerName => ({ ...blankReaction(), primerSource: "SeqForge universal primer", primerName })),
      })),
    });
    const expected = priceOrder(draft, schedule);
    assert.equal(expected.lines[0].quantity, 1536);
    const key = randomUUID();
    const submit = () => fetch(`${origin}/api/orders`, {
      method: "POST", headers: { origin, cookie: customerCookie, "Content-Type": "application/json", "Idempotency-Key": key,
        "X-Pricing-Revision": String(schedule.revision), "X-Customer-Pricing-Revision": String(schedule.customerRevision ?? 0),
        "X-Pricing-Customer-Id": customerId, "X-Pricing-Catalog-Version": "2" }, body: JSON.stringify(draft),
    });
    const started = performance.now();
    const response = await submit();
    const elapsedMs = Math.round(performance.now() - started);
    assert.equal(response.status, 201, await response.clone().text());
    const order = await response.json() as { id: string; orderNumber: string };
    const saved = await db.order.findUniqueOrThrow({ where: { id: order.id }, include: { samples: { orderBy: { position: "asc" }, include: { reactions: { orderBy: { position: "asc" } } } } } });
    assert.equal(saved.samples.length, 768);
    assert.equal(saved.samples.reduce((sum, sample) => sum + sample.reactions.length, 0), 1536);
    for (const [i, sample] of saved.samples.entries()) {
      assert.equal(sample.sampleName, draft.samples[i].sampleName);
      assert.equal(sample.plateLabel, draft.samples[i].plateLabel);
      assert.equal(sample.well, draft.samples[i].well);
      assert.deepEqual(sample.reactions.map(reaction => reaction.primerName), ["T7", "T3"]);
    }
    assert.deepEqual(pricingSchema.parse(saved.pricingSnapshot), expected);
    for (const retried of await Promise.all([submit(), submit()])) {
      assert.equal(retried.status, 201);
      assert.equal((await retried.json() as { id: string }).id, order.id);
    }
    assert.equal(await db.order.count({ where: { userId: customerId, submissionKey: key } }), 1);
    assert.equal(await db.customerNotification.count({ where: { eventKey: `order:${order.id}` } }), 1);
    for (const [path, cookie] of [[`/orders/${order.id}`, customerCookie], [`/admin/orders/${order.id}`, adminCookie], [`/manifest/${order.id}`, customerCookie]]) {
      const page = await fetch(origin + path, { headers: { cookie } });
      assert.equal(page.status, 200, path);
      const html = await page.text();
      assert.ok(html.includes("Plate-08"), "Every plate must remain available");
      if (path.startsWith("/manifest")) assert.ok(html.includes("Bulk-0768"), "Printable manifest must include the final sample");
    }
    console.log(`PASS: eight-plate HTTP order saved 768 samples/1536 reactions in ${elapsedMs} ms (isolated local environment), all wells/primers/prices round-trip, duplicate retries reuse one order, customer/admin/complete print routes work; preview mail only.`);
  } finally { await db.$disconnect(); }
}
