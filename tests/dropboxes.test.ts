import assert from "node:assert/strict";
import { test } from "node:test";
import { blankOrder, orderSchema } from "../src/lib/order-intake";
import { dropboxInputSchema, dropboxOrderUrl, dropboxSnapshot, type DropboxLocation } from "../src/lib/dropboxes";
import { readDefaults } from "../src/lib/order-defaults";
import { newPlasmidSample } from "../src/lib/whole-plasmid";
import { safeAuthReturn } from "../src/lib/order-resume";

const location: DropboxLocation = { id: "fixture-dropbox", name: "Fixture campus", address: "Fixture address", placementInstructions: "", pickupSchedule: "", accessNotes: "", latitude: 32.8, longitude: -117.2, active: true, revision: 1, updatedAt: "2026-10-23T00:00:00Z" };
function draft() {
  const value = blankOrder();
  Object.assign(value.fulfillment, { deliveryMethod: "Dropbox", dropboxId: location.id, dropbox: dropboxSnapshot(location), contactName: "Fixture", contactPhone: "555", billingOrganization: "Fixture", billingContactName: "Fixture", billingEmail: "fixture@example.test", billingAddress: "Fixture address" });
  Object.assign(value.samples[0], { sampleName: "Fixture", tubeLabel: "T1" });
  value.samples[0].reactions[0].primerName = "T7";
  return value;
}
test("dropbox input preserves unspecified operations details and validates coordinate pairs", () => {
  assert.equal(dropboxInputSchema.safeParse(location).success, true);
  assert.equal(dropboxInputSchema.safeParse({ ...location, latitude: null, longitude: null }).success, true);
  for (const invalid of [{ latitude: 91 }, { longitude: -181 }, { latitude: null }, { name: "" }]) assert.equal(dropboxInputSchema.safeParse({ ...location, ...invalid }).success, false);
});
test("Sanger and Whole Plasmid require a matching selected dropbox; Oligo rejects incoming dropboxes", () => {
  const value = draft();
  assert.equal(orderSchema.safeParse(value).success, true);
  assert.equal(orderSchema.safeParse({ ...value, fulfillment: { ...value.fulfillment, dropboxId: "forged-id" } }).success, false);
  assert.equal(orderSchema.safeParse({ ...value, fulfillment: { ...value.fulfillment, dropbox: undefined } }).success, false);
  const sample = newPlasmidSample([], "Tubes");
  Object.assign(sample, { sampleName: "Fixture plasmid", tubeLabel: "P1", templateLength: "5000" });
  assert.equal(orderSchema.safeParse({ ...value, service: "WHOLE_PLASMID", submissionMode: "Whole plasmid", samples: [sample] }).success, true);
  const oligo = orderSchema.safeParse({ ...value, service: "OLIGO", submissionMode: "Oligo standard", samples: [] });
  assert.equal(oligo.success, false);
  if (!oligo.success) assert.ok(oligo.error.issues.some(issue => issue.path.join(".") === "fulfillment.deliveryMethod"));
});
test("saved delivery defaults keep dropbox details and historical defaults remain readable", () => {
  const value = draft().fulfillment;
  assert.deepEqual(readDefaults(value).dropbox, dropboxSnapshot(location));
  assert.equal(readDefaults(blankOrder().fulfillment).deliveryMethod, "Pickup");
  assert.equal("active" in dropboxSnapshot(location), false);
});
test("dropbox order links retain the choice through Sanger options and exclude Oligo", () => {
  assert.equal(dropboxOrderUrl("sanger", location.id, "pre-mixed"), "/orders/new?service=sanger&type=pre-mixed&dropbox=fixture-dropbox");
  assert.equal(dropboxOrderUrl("oligo", location.id), "/orders/new?service=oligo");
  assert.equal(safeAuthReturn("/orders/new?service=sanger&type=standard&dropbox=ucsd-tata-hall"), "/orders/new?service=sanger&type=standard&dropbox=ucsd-tata-hall");
  assert.equal(safeAuthReturn("/orders/new?service=sanger&dropbox=https%3A%2F%2Fevil.test"), "/orders/new?service=sanger");
});
