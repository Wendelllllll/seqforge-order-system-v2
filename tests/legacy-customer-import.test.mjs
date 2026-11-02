import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { hashPassword } from 'better-auth/crypto';
import 'dotenv/config';
import { importCustomers, validatePayload } from '../scripts/legacy-customer-import.mjs';

test('legacy import preserves existing identities, supports original passwords, requires verification and is atomic', async t => {
  const database = new URL(process.env.DATABASE_URL || '');
  assert(['localhost','127.0.0.1'].includes(database.hostname), 'Migration tests require local PostgreSQL');
  const schema = `seqforge_legacy_test_${randomUUID().replaceAll('-','')}`;
  database.searchParams.set('schema',schema);
  Object.assign(process.env,{DATABASE_URL:database.toString(),BETTER_AUTH_URL:'https://migration.example.test',BETTER_AUTH_SECRET:randomUUID()+randomUUID(),CUSTOMER_MAIL_MODE:'preview',CUSTOMER_MAIL_FROM:'sender@example.invalid',INTERNAL_MAIL_MODE:'off',CONTACT_MAIL_MODE:'off',SMTP_HOST:'',SMTP_USER:'',SMTP_PASSWORD:'',NODE_ENV:'test'});
  const db = new PrismaClient({datasourceUrl:database.toString()});
  let authDb;
  try {
    execFileSync(process.execPath,['node_modules/prisma/build/index.js','migrate','deploy'],{env:process.env,stdio:'pipe',windowsHide:true});
    const {auth} = await import('../src/lib/auth.ts');
    authDb = (await import('../src/lib/prisma.ts')).prisma;
    const password = 'oldPW7'; // Existing short passwords must continue to work.
    const base = {legacyId:'101',legacyUsername:'legacy-name',orderCount:1,orderNumbers:['190101'],firstOrderDate:'2026-01-02',lastOrderDate:'2026-01-02',email:'migrated@example.invalid',name:'Migrated Customer',firstName:'Migrated',lastName:'Customer',organization:'Test Lab',labName:'',phone:null,passwordHash:await hashPassword(password)};
    const payload = {format:1,batch:'isolated-test',range:{from:'2026-01-01',through:'2026-11-02'},eligible:[base],review:[{legacyId:'999',reason:'SOURCE_ACCOUNT_MISSING'}]};
    const existing = await auth.api.signUpEmail({body:{email:'existing@example.invalid',password:'ExistingPassword!2026',name:'Existing Customer',firstName:'Existing',lastName:'Customer',organization:'Existing Lab',labName:'Existing PI'}});
    await db.user.update({where:{id:existing.user.id},data:{emailVerified:true}});
    const before = await db.user.findUniqueOrThrow({where:{id:existing.user.id},include:{accounts:true}});
    payload.eligible.push({...base,legacyId:'102',email:'existing@example.invalid'});
    await t.test('dry-run is read-only and existing email is skipped',async()=>{
      const report = await importCustomers(db,payload);
      assert.equal(report.wouldCreate,1); assert.equal(report.existingPreserved,1); assert.equal(report.created,0);
      assert.equal(await db.user.count(),1);
    });
    await t.test('import does not send mail, grant admin, copy orders, or overwrite credentials',async()=>{
      const report = await importCustomers(db,payload,{apply:true});
      assert.equal(report.created,1); assert.equal(report.reviewRequired,1);
      assert.deepEqual(await db.user.findUniqueOrThrow({where:{id:existing.user.id},include:{accounts:true}}),before);
      assert.equal(await db.order.count(),0); assert.equal(await db.customerNotification.count(),0); assert.equal(await db.internalNotification.count(),0);
      const user=await db.user.findUniqueOrThrow({where:{id:'legacy_retrogen_101'}});
      assert.equal(user.role,'customer'); assert.equal(user.emailVerified,false);
    });
    await t.test('original short password authenticates; wrong password fails; verification changes only after confirmation',async()=>{
      const login=await auth.api.signInEmail({body:{email:base.email,password}});
      assert.equal(login.user.emailVerified,false);
      await assert.rejects(auth.api.signInEmail({body:{email:base.email,password:'Incorrect!2026'}}));
      await auth.api.sendVerificationEmail({body:{email:base.email,callbackURL:'https://migration.example.test/dashboard'}});
      assert.equal((await db.user.findUniqueOrThrow({where:{id:login.user.id}})).emailVerified,false);
      const mail=await db.customerNotification.findFirstOrThrow({where:{userId:login.user.id},orderBy:{createdAt:'desc'}});
      assert.equal(mail.status,'PREVIEW');
      const link=new URL(mail.bodyText.match(/https:\/\/[^\s]+/)[0]);
      await auth.api.verifyEmail({query:{token:link.searchParams.get('token')}});
      assert.equal((await db.user.findUniqueOrThrow({where:{id:login.user.id}})).emailVerified,true);
    });
    await t.test('repeating an import cannot reset a subsequently changed password or verification',async()=>{
      const changed=await hashPassword('ChangedPassword!2026');
      await db.account.update({where:{id:'legacy_retrogen_credential_101'},data:{password:changed}});
      const report=await importCustomers(db,payload,{apply:true});
      assert.equal(report.created,0); assert.equal(report.alreadyImported,1);
      assert.equal((await db.account.findUniqueOrThrow({where:{id:'legacy_retrogen_credential_101'}})).password,changed);
      assert.equal((await db.user.findUniqueOrThrow({where:{id:'legacy_retrogen_101'}})).emailVerified,true);
    });
    await t.test('malformed hashes, plaintext fields and duplicate identities are rejected',()=>{
      assert.throws(()=>validatePayload({...payload,eligible:[{...base,password:'must-not-be-present'}]}));
      assert.throws(()=>validatePayload({...payload,eligible:[{...base,passwordHash:'plaintext'}]}));
      assert.throws(()=>validatePayload({...payload,eligible:[base,base]}));
      assert.throws(()=>validatePayload({...payload,eligible:[{...base,firstOrderDate:'2025-12-31'}]}));
    });
    await t.test('credential insertion failure rolls back new user insertion',async()=>{
      await db.account.create({data:{id:'conflict-fixture',accountId:'legacy_retrogen_103',providerId:'credential',userId:existing.user.id,password:await hashPassword('Fixture!2026')}});
      await assert.rejects(importCustomers(db,{...payload,eligible:[{...base,legacyId:'103',email:'rollback@example.invalid'}]},{apply:true}));
      assert.equal(await db.user.findUnique({where:{id:'legacy_retrogen_103'}}),null);
    });
  } finally {
    if(authDb) await authDb.$disconnect();
    assert.match(schema,/^seqforge_legacy_test_[a-f0-9]{32}$/);
    await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await db.$disconnect();
  }
});
