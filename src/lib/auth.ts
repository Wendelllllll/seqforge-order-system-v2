import { prismaAdapter } from "@better-auth/prisma-adapter";
import { betterAuth } from "better-auth";

import { prisma } from "@/lib/prisma";
import { enqueueNewCustomer } from "@/lib/internal-notifications";
import { enqueueEmailVerification } from "@/lib/customer-notifications";

export const auth = betterAuth({
  appName: "SeqForge Order System",
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    autoSignIn: true,
  },
  emailVerification: {
    sendOnSignUp: false,
    sendOnSignIn: false,
    autoSignInAfterVerification: false,
    expiresIn: 60 * 60,
    sendVerificationEmail: async ({ user, url }) => { await enqueueEmailVerification(prisma, user, url); },
  },
  databaseHooks: {
    user: {
      create: {
        after: async (user) => { await enqueueNewCustomer(prisma, user); },
      },
    },
  },
  user: {
    additionalFields: {
      role: {
        type: ["customer", "admin"],
        required: false,
        defaultValue: "customer",
        input: false,
      },
      firstName: {
        type: "string",
        required: true,
      },
      lastName: {
        type: "string",
        required: true,
      },
      organization: {
        type: "string",
        required: true,
      },
      labName: {
        type: "string",
        required: true,
      },
      phone: {
        type: "string",
        required: false,
      },
    },
  },
  trustedOrigins: [process.env.BETTER_AUTH_URL || "http://localhost:3000"],
});

export type AuthSession = typeof auth.$Infer.Session;
