import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Operational importer, not a public endpoint. Input contains salted hashes only.
// Never update existing users, grant roles, import orders, or invoke signup/mail hooks.
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const customerId = legacyId => `legacy_retrogen_${legacyId}`;
export function validatePayload(data) {
  assert.equal(data.format, 1, 'Unsupported import format');
  assert.match(data.batch, /^[a-z0-9-]{1,100}$/, 'Invalid batch');
  assert.match(data.range.from, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(data.range.through, /^\d{4}-\d{2}-\d{2}$/);
  assert(data.range.from <= data.range.through);
  assert(Array.isArray(data.eligible) && data.eligible.length <= 2500);
  assert(Array.isArray(data.review));
  const ids = new Set(), emails = new Set();
  const permitted = new Set(['legacyId','legacyUsername','orderCount','firstOrderDate','lastOrderDate','orderNumbers','email','firstName','lastName','name','organization','labName','phone','orderDefaults','passwordHash']);
  for (const row of data.eligible) {
    assert(Object.keys(row).every(key => permitted.has(key)), 'Unexpected customer field; do not include raw secrets');
    assert.match(row.legacyId, /^\d{1,12}$/);
    assert(!ids.has(row.legacyId), 'Duplicate legacy identity'); ids.add(row.legacyId);
    assert.equal(row.email, row.email.trim().toLowerCase());
    assert.match(row.email, /^[^\s@]+@[^\s@]+\.[^\s@]+$/);
    assert(row.email.length <= 254 && !emails.has(row.email), 'Duplicate or invalid email'); emails.add(row.email);
    assert.match(row.passwordHash, /^[a-f0-9]{32}:[a-f0-9]{128}$/, 'Expected Better Auth scrypt hash');
    assert(Number.isSafeInteger(row.orderCount) && row.orderCount > 0);
    assert(row.firstOrderDate >= data.range.from && row.lastOrderDate <= data.range.through && row.firstOrderDate <= row.lastOrderDate, 'Outside approved date range');
    assert(Array.isArray(row.orderNumbers) && row.orderNumbers.length > 0 && row.orderNumbers.every(n => /^\d+$/.test(n)));
    for (const key of ['name','firstName','lastName','organization','labName','legacyUsername']) assert(typeof row[key] === 'string' && row[key].length <= 500, 'Invalid profile field');
    assert(row.name.length > 0);
    assert(row.phone === null || (typeof row.phone === 'string' && row.phone.length <= 60));
    if (row.orderDefaults !== undefined) {
      const d = row.orderDefaults;
      assert.deepEqual(Object.keys(d).sort(), ['deliveryMethod','pickupLocation','pickupInstructions','contactName','contactPhone','piName','billingOrganization','billingContactName','billingEmail','billingAddress','paymentMethod'].sort());
      assert.equal(d.deliveryMethod,'Dropbox');
      assert.equal(d.paymentMethod,'Invoice');
      for (const key of Object.keys(d)) assert(typeof d[key] === 'string' && d[key].length <= ({contactName:120,contactPhone:60,piName:120,billingOrganization:200,billingContactName:120,billingEmail:254,billingAddress:1000}[key] || 500));
      assert.equal(d.pickupLocation,''); assert.equal(d.pickupInstructions,''); assert.equal(d.billingEmail,'');
    }
  }
  return data;
}

async function protectedState(tx, originalUserIds, originalAccountIds) {
  const users = await tx.user.findMany({where:originalUserIds ? {id:{in:originalUserIds}} : {},orderBy:{id:'asc'}});
  const accounts = await tx.account.findMany({where:originalAccountIds ? {id:{in:originalAccountIds}} : {},orderBy:{id:'asc'}});
  const orders = await tx.order.findMany({orderBy:{id:'asc'}});
  const pricing = await tx.pricingSchedule.findMany({orderBy:{id:'asc'}});
  const overrides = await tx.customerPricing.findMany({orderBy:{userId:'asc'}});
  const counter = await tx.orderCounter.findMany({orderBy:{month:'asc'}});
  const internalMail = await tx.internalNotification.count();
  const customerMail = await tx.customerNotification.count();
  return {users,accounts,orders,pricing,overrides,counter,internalMail,customerMail};
}

export async function importCustomers(db, raw, {apply=false}={}) {
  const data = validatePayload(raw);
  return db.$transaction(async tx => {
    if (apply) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('legacy-retrogen-customer-import', 0))`;
      // Prevent a concurrent signup or reset between conflict detection and insert.
      await tx.$executeRaw`LOCK TABLE "User", "Account" IN SHARE ROW EXCLUSIVE MODE`;
    }
    const before = await protectedState(tx);
    const byEmail = new Map();
    for (const user of before.users) {
      const key = user.email.trim().toLowerCase();
      assert(!byEmail.has(key), 'Target has ambiguous normalized emails'); byEmail.set(key,user);
    }
    const byId = new Map(before.users.map(user => [user.id,user]));
    const additions = [], skipped = [], alreadyImported = [];
    for (const row of data.eligible) {
      const id = customerId(row.legacyId);
      const idMatch = byId.get(id), emailMatch = byEmail.get(row.email);
      if (idMatch) {
        assert.equal(idMatch.email,row.email,'Legacy ID belongs to a different email');
        // Never reapply imported passwords: the customer may have changed them.
        assert.equal(idMatch.role,'customer','Unexpected role on migrated identity');
        alreadyImported.push({legacyId:row.legacyId,userId:id}); continue;
      }
      if (emailMatch) { skipped.push({legacyId:row.legacyId,userId:emailMatch.id,reason:'EXISTING_NEW_SITE_ACCOUNT_PRESERVED'}); continue; }
      additions.push(row);
    }
    if (apply && additions.length) {
      const users = additions.map(row => ({id:customerId(row.legacyId),name:row.name,email:row.email,emailVerified:false,role:'customer',firstName:row.firstName,lastName:row.lastName,organization:row.organization,labName:row.labName,phone:row.phone,...(row.orderDefaults ? {orderDefaults:row.orderDefaults} : {})}));
      const accounts = additions.map(row => ({id:`legacy_retrogen_credential_${row.legacyId}`,accountId:customerId(row.legacyId),providerId:'credential',userId:customerId(row.legacyId),password:row.passwordHash}));
      assert.equal((await tx.user.createMany({data:users})).count,users.length);
      assert.equal((await tx.account.createMany({data:accounts})).count,accounts.length);
      const saved = await tx.user.findMany({where:{id:{in:users.map(u=>u.id)}},include:{accounts:true}});
      assert.equal(saved.length,users.length);
      for (const user of saved) {
        assert.equal(user.role,'customer'); assert.equal(user.emailVerified,false);
        assert.equal(user.accounts.length,1); assert.equal(user.accounts[0].providerId,'credential');
        const source = additions.find(row=>customerId(row.legacyId)===user.id);
        assert.equal(digest(user.accounts[0].password),digest(source.passwordHash),'Credential import mismatch');
      }
      const after = await protectedState(tx,before.users.map(u=>u.id),before.accounts.map(a=>a.id));
      assert.equal(digest(after),digest(before),'Import changed existing data or queued notifications');
    }
    return {batch:data.batch,applied:apply,created:apply?additions.length:0,wouldCreate:additions.length,existingPreserved:skipped.length,alreadyImported:alreadyImported.length,reviewRequired:data.review.length,protectedUserCount:before.users.length,protectedAccountCount:before.accounts.length,protectedOrderCount:before.orders.length,protectedDataSha256:digest(before),rows:additions.map(row=>({legacyId:row.legacyId,userId:customerId(row.legacyId),email:row.email})),skipped,previouslyImported:alreadyImported,completedAt:new Date().toISOString()};
  },{isolationLevel:apply?'Serializable':'RepeatableRead',timeout:60000,maxWait:10000});
}

async function main() {
  const [mode,payloadPath,reportPath,expectedHash,snapshot] = process.argv.slice(2);
  assert(['check','apply'].includes(mode),'Usage: check|apply payload report sha256 [verified-snapshot-name]');
  assert.equal(new URL(process.env.BETTER_AUTH_URL).origin,'https://seqforgebio.com','Wrong target origin');
  const bytes = await readFile(payloadPath);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),expectedHash,'Payload digest mismatch');
  if(mode==='apply') assert.match(snapshot||'',/^seqforge-before-customer-import-\d{8}$/,'A verified pre-import snapshot is required');
  // The application image supplies the same Prisma client as the deployed site.
  const require = createRequire(resolve(process.cwd(),'package.json'));
  const {PrismaClient} = require('@prisma/client');
  const db = new PrismaClient();
  try {
    const report = await importCustomers(db,JSON.parse(bytes.toString()),{apply:mode==='apply'});
    await writeFile(reportPath,JSON.stringify({...report,snapshot:snapshot||null},null,2),{mode:0o600,flag:'wx'});
    const summary=Object.fromEntries(Object.entries(report).filter(([key])=>!['rows','skipped','previouslyImported'].includes(key)));
    console.log(JSON.stringify(summary));
  } finally {await db.$disconnect();}
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error=>{console.error(`Legacy import failed (${error.code||error.name||'Error'}). Review privately; no raw customer data is logged.`);process.exitCode=1;});
}
