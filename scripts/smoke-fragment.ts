import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { blankOrder, blankSample, orderSchema } from "../src/lib/order-intake";
import { blankFragmentSettings, FRAGMENT_HOLD_REASON } from "../src/lib/fragment-analysis";
import { rateScheduleSchema } from "../src/lib/rate-schedule";
import { pricingSchema } from "../src/lib/pricing";
import type { OrderDefaults } from "../src/lib/order-defaults";

export async function runFragmentSmoke({ origin, customerCookie, adminCookie, customerId, fulfillment }: { origin: string; customerCookie: string; adminCookie: string; customerId: string; fulfillment: OrderDefaults }) {
  const schema = process.env.SEQFORGE_SMOKE_SCHEMA || "";
  assert.match(schema, /^seqforge_smoke_[a-f0-9]{32}$/);
  assert.equal(new URL(process.env.DATABASE_URL!).searchParams.get("schema"), schema);
  assert.match(origin, /^http:\/\/localhost:\d+$/); assert.notEqual(new URL(origin).port, "3000");
  assert.equal(process.env.CUSTOMER_MAIL_MODE, "preview"); assert.equal(process.env.INTERNAL_MAIL_MODE, "preview"); assert.equal(process.env.SMTP_PASSWORD, "");
  const db = new PrismaClient();
  try {
    const schedule = rateScheduleSchema.parse(await (await fetch(`${origin}/api/account/pricing`, { headers: { cookie: customerCookie } })).json());
    const draft = orderSchema.parse({ ...blankOrder(), service: "FRAGMENT_ANALYSIS", submissionMode: "Fragment analysis", orderName: "ISOLATED Fragment Analysis eight plates", container: "Plate", fulfillment,
      fragmentAnalysis: { ...blankFragmentSettings(), dyes: "6-FAM, HEX", minSize: "100", maxSize: "500", sizeStandard: "Requested standard for laboratory review" },
      samples: Array.from({ length: 768 }, (_, i) => ({ ...blankSample(`F${i + 1}`), sampleName: `Fragment-${i + 1}`, templateType: "PCR product", reactions: [], plateLabel: `Plate-${Math.floor(i / 96) + 1}`, well: `${"ABCDEFGH"[i % 8]}${Math.floor(i % 96 / 8) + 1}`, notes: i === 767 ? "Final fragment sample" : "" })),
    });
    const key = randomUUID();
    const headers = { origin, cookie: customerCookie, "Content-Type": "application/json", "Idempotency-Key": key, "X-Pricing-Revision": String(schedule.revision), "X-Customer-Pricing-Revision": String(schedule.customerRevision ?? 0), "X-Pricing-Customer-Id": customerId, "X-Pricing-Catalog-Version": "2" };
    const submit = () => fetch(`${origin}/api/orders`, { method: "POST", headers, body: JSON.stringify(draft) });
    const response = await submit(); assert.equal(response.status, 201, await response.clone().text());
    const { id } = await response.json() as { id: string };
    const saved = await db.order.findUniqueOrThrow({ where: { id }, include: { samples: { include: { reactions: true }, orderBy: { position: "asc" } } } });
    assert.equal(saved.status, "ON_HOLD"); assert.equal(saved.holdReason, FRAGMENT_HOLD_REASON);
    assert.deepEqual(saved.fragmentSnapshot, draft.fragmentAnalysis); assert.equal(saved.samples.length, 768);
    assert.equal(saved.samples[767].notes, "Final fragment sample"); assert.ok(saved.samples.every(s => s.reactions.length === 0));
    const price = pricingSchema.parse(saved.pricingSnapshot); assert.equal(price.subtotalCents, null); assert.equal(price.pendingQuote, true);
    assert.equal((await (await submit()).json() as { id: string }).id, id);
    const mail = await db.customerNotification.findFirstOrThrow({ where: { eventKey: `order:${id}` } });
    assert.ok(mail.bodyText.includes("Fragment Analysis") && mail.bodyText.includes("Quote pending"));
    assert.equal(await db.customerNotification.count({ where: { eventKey: `order:${id}` } }), 1);
    for (const [path, cookie] of [[`/orders/${id}`, customerCookie], [`/admin/orders/${id}`, adminCookie], [`/manifest/${id}`, customerCookie], ["/admin?service=FRAGMENT_ANALYSIS", adminCookie]]) {
      const page = await fetch(origin + path, { headers: { cookie } }); assert.equal(page.status, 200, path);
      const html = await page.text(); assert.ok(html.includes("Fragment Analysis"));
      if (path.includes("/manifest/")) assert.ok(html.includes("Fragment-768"));
    }
    for (const status of ["PROCESSING", "COMPLETED"]) {
      const result = await fetch(`${origin}/api/admin/orders/${id}/status`, { method: "PATCH", headers: { origin, cookie: adminCookie, "Content-Type": "application/json", "Idempotency-Key": randomUUID() }, body: JSON.stringify({ status, reason: "Test attempt before quote approval", expectedRevision: 0 }) });
      assert.equal(result.status, 409); assert.match(await result.text(), /quote approval/);
    }
    const upload = await fetch(`${origin}/api/admin/orders/${id}/result`, { method: "POST", headers: { origin, cookie: adminCookie } });
    assert.equal(upload.status, 409);
    const anonymous = await fetch(`${origin}/orders/${id}`, { redirect: "manual" }); assert.ok([302, 303, 307, 308].includes(anonymous.status));
    assert.equal((await db.order.findUniqueOrThrow({ where: { id } })).status, "ON_HOLD");
    console.log("PASS: Fragment Analysis 768 samples, immutable method/unknown-price snapshots, held submission, idempotency, preview notifications, customer/admin/full print, privacy and processing/result gates.");
  } finally { await db.$disconnect(); }
}
