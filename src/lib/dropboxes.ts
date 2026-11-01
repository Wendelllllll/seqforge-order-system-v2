import { z } from "zod";

export const dropboxFieldsSchema = z.object({
  name: z.string().trim().min(1).max(120),
  address: z.string().trim().min(1).max(500),
  placementInstructions: z.string().trim().max(1000),
  pickupSchedule: z.string().trim().max(500),
  accessNotes: z.string().trim().max(1000),
  latitude: z.number().finite().min(-90).max(90).nullable(),
  longitude: z.number().finite().min(-180).max(180).nullable(),
  active: z.boolean(),
});
export const dropboxInputSchema = dropboxFieldsSchema.refine(value => (value.latitude === null) === (value.longitude === null), { message: "Enter both map coordinates, or leave both blank.", path: ["latitude"] });
export const dropboxUpdateSchema = dropboxFieldsSchema.extend({ expectedRevision: z.number().int().min(1) }).refine(value => (value.latitude === null) === (value.longitude === null), { message: "Enter both map coordinates, or leave both blank.", path: ["latitude"] });
export const dropboxSnapshotSchema = dropboxFieldsSchema.omit({ active: true }).extend({ id: z.string().min(1).max(100), revision: z.number().int().min(1) });
export type DropboxSnapshot = z.infer<typeof dropboxSnapshotSchema>;
export type DropboxInput = z.infer<typeof dropboxInputSchema>;
export type DropboxLocation = DropboxInput & { id: string; revision: number; updatedAt: string };
export function dropboxSnapshot(location: DropboxLocation): DropboxSnapshot {
  return dropboxSnapshotSchema.parse(location);
}
export function dropboxOrderUrl(service: string, id?: string, type?: string) {
  const params = new URLSearchParams({ service });
  if (type) params.set("type", type);
  if (id && service !== "oligo") params.set("dropbox", id);
  return `/orders/new?${params}`;
}
