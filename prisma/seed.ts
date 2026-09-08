import "dotenv/config";

import { auth } from "../src/lib/auth";
import { prisma } from "../src/lib/prisma";

const users = [
  {
    email: "admin@seqforge.local",
    password: "SeqForgeDemo!2026",
    name: "SeqForge Admin",
    firstName: "SeqForge",
    lastName: "Admin",
    organization: "SeqForge, Inc.",
    labName: "Operations",
    phone: "858-555-0100",
    role: "admin",
  },
  {
    email: "scientist@demo.local",
    password: "DemoCustomer!2026",
    name: "Maya Chen",
    firstName: "Maya",
    lastName: "Chen",
    organization: "Coastal Research Institute",
    labName: "Chen Molecular Biology Lab",
    phone: "858-555-0142",
    role: "customer",
  },
] as const;

async function seed() {
  const database = new URL(process.env.DATABASE_URL || "");
  if (process.env.NODE_ENV === "production" || process.env.BETTER_AUTH_URL !== "http://localhost:3000" || !["localhost", "127.0.0.1"].includes(database.hostname)) {
    throw new Error("Demo seeding is permitted only against a local development database and localhost application.");
  }
  for (const user of users) {
    let existing = await prisma.user.findUnique({
      where: { email: user.email },
      include: { accounts: true },
    });

    if (existing && existing.accounts.length === 0) {
      await prisma.user.delete({ where: { id: existing.id } });
      existing = null;
    }

    if (!existing) {
      await auth.api.signUpEmail({
        body: {
          email: user.email,
          password: user.password,
          name: user.name,
          firstName: user.firstName,
          lastName: user.lastName,
          organization: user.organization,
          labName: user.labName,
          phone: user.phone,
        },
      });
    }

    await prisma.user.update({
      where: { email: user.email },
      data: { role: user.role },
    });
  }
}

seed()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
