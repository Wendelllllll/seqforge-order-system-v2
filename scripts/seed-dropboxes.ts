import "dotenv/config";
import { PrismaClient } from "@prisma/client";

// User-confirmed initial sites. Coordinates describe campus buildings, not the
// unconfirmed box position. Exact placement and pickup schedule remain blank.
// Source: OpenStreetMap ways 31839879, 821246683, 233678061, 544060339.
const locations = [
  { id: "ucsd-muir-biology", name: "UCSD · Muir Biology Building", address: "Muir Biology Building, UC San Diego, La Jolla, CA 92093", latitude: 32.8784468, longitude: -117.2410408 },
  { id: "ucsd-tata-hall", name: "UCSD · Tata Hall", address: "Tata Hall for the Sciences, UC San Diego, La Jolla, CA 92093", latitude: 32.8764549, longitude: -117.2417207 },
  { id: "ucr-genomics", name: "UCR · Genomics Building", address: "Genomics Building, 3401 Watkins Drive, UC Riverside, Riverside, CA 92521", latitude: 33.9715932, longitude: -117.3261700 },
  { id: "ucr-boyce-hall", name: "UCR · Boyce Hall", address: "Boyce Hall, UC Riverside, Riverside, CA 92521", latitude: 33.9735096, longitude: -117.3249640 },
];
const db = new PrismaClient();
async function seedDropboxes() {
try {
  for (const location of locations) await db.$executeRaw`INSERT INTO "DropboxLocation" ("id","name","address","latitude","longitude","placementInstructions","pickupSchedule","accessNotes","active","updatedAt") VALUES (${location.id}, ${location.name}, ${location.address}, ${location.latitude}, ${location.longitude}, '', '', '', true, CURRENT_TIMESTAMP) ON CONFLICT ("id") DO NOTHING`;
  console.log("Initial dropbox sites added where missing; existing admin edits preserved.");
} finally { await db.$disconnect(); }
}
seedDropboxes().catch(error => { console.error("Dropbox initialization failed", error instanceof Error ? error.name : "Unknown error"); process.exitCode = 1; });
