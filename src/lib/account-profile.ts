import { z } from "zod";

export const accountProfileSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required.").max(100),
  lastName: z.string().trim().min(1, "Last name is required.").max(100),
  organization: z.string().trim().min(1, "Organization is required.").max(200),
  labName: z.string().trim().min(1, "Laboratory is required.").max(200),
  phone: z.string().trim().max(50),
}).strict();
export type AccountProfile = z.infer<typeof accountProfileSchema>;
