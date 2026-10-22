import { loadEnvConfig } from "@next/env";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { getInternalMailConfig, internalMailErrorCode } from "../src/lib/internal-mail";
import { dispatchInternalNotifications, enqueueInternalNotification, retryInternalNotification } from "../src/lib/internal-notifications";

loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");
const db = new PrismaClient();
const action = process.argv[2] || "status";
async function main() {
  const config = getInternalMailConfig();
  console.log("Mode:", config.mode);
  if (config.mode !== "off") console.log("From:", config.from, "\nOnly recipient:", config.recipient);
  if (action === "status") {
    console.table(await db.$queryRaw`SELECT "id", "kind", "status", "recipient", "attempts", "lastError", "createdAt" FROM "InternalNotification" ORDER BY "createdAt" DESC LIMIT 15`);
    console.log("PREVIEW sends nothing. SENT means the SMTP server accepted the message, not confirmed inbox delivery.");
  } else if (action === "test") {
    if (config.mode !== "smtp") {
      console.log("Nothing sent. Configure SMTP and switch INTERNAL_MAIL_MODE to smtp first. Passwords stay in .env.local.");
      return;
    }
    const id = await enqueueInternalNotification(db, { eventKey: `test:${randomUUID()}`, kind: "TEST", subject: "Email setup test",
      text: "This is a SeqForge internal email setup test.\n\nNo customer account or order was created.\nOnly the configured internal recipient receives this message.\nPlease check the inbox and spam folder." });
    if (id) console.log(await dispatchInternalNotifications(db, 1, undefined, id));
  } else if (action === "flush") {
    console.log(await dispatchInternalNotifications(db, 20));
  } else if (action === "retry" && process.argv[3]) {
    console.log("Retrying a failed/expired attempt can duplicate a message if SMTP accepted it before a connection was lost.");
    await retryInternalNotification(db, process.argv[3]);
    console.log(await dispatchInternalNotifications(db, 1, undefined, process.argv[3]));
  } else {
    throw new Error("Use status, test, flush, or retry <notification-id>.");
  }
}
main().catch(error => {
  console.error("Email command did not complete:", internalMailErrorCode(error));
  console.error("Check the mail configuration and apply database migrations. No credentials are printed.");
  process.exitCode = 1;
}).finally(() => db.$disconnect());
