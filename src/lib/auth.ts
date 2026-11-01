import { prismaAdapter } from "@better-auth/prisma-adapter";
import { betterAuth } from "better-auth";

import { prisma } from "@/lib/prisma";
import { enqueueNewCustomer } from "@/lib/internal-notifications";
import { enqueueEmailVerification } from "@/lib/customer-notifications";
import { deliverPasswordReset, RESET_TOKEN_SECONDS } from "@/lib/password-reset";

export const auth = betterAuth({
  appName: "SeqForge Order System",
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  // Verification is exposed only through our deliberate confirmation POST.
  // Server-side auth.api.verifyEmail remains available with this HTTP route disabled.
  // Password recovery uses our same-origin, account-independent throttled routes.
  disabledPaths: ["/verify-email", "/request-password-reset", "/reset-password"],
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    autoSignIn: true,
    resetPasswordTokenExpiresIn: RESET_TOKEN_SECONDS,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, token, url }) => { await deliverPasswordReset(prisma, user, token, url); },
    onPasswordReset: async ({ user }) => {
      await prisma.verification.deleteMany({ where: { value: user.id, identifier: { startsWith: "reset-password:" } } });
    },
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
