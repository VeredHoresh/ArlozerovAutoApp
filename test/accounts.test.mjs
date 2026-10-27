import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Accounts, sessionCookie } from '../accounts.mjs';
import { createApplication } from '../server.mjs';
import { normalize } from '../time.mjs';
function fixture() {
  const members = new Map();
  const clientFactory = () => ({
    session: null, dayCache: new Map(),
    async login(phone,password) {
      if (password !== 'test-password' || !['0500000001','0500000002'].includes(phone)) throw new Error('Invalid credentials');
      const userId=phone.endsWith('1')?1:2;
      this.session={userId,token:'token-'+userId,name:'Member '+userId};
      if(!members.has(userId))members.set(userId,{status:3,writes:0});
    },
    async calendar() {
      return [normalize({LessonID:7,ID:0,Name:'Yoga',StartDateTimeJson:'2050-10-28T19:00:00+02:00',StartHour:'190000',DurationInMinutes:45,Status:members.get(this.session.userId).status})];
    },
    async upcoming() { return (await this.calendar()).filter(a=>[2,4].includes(a.status)); },
    async register() { const m=members.get(this.session.userId);m.status=2;m.writes++; },
    async cancel() { const m=members.get(this.session.userId);m.status=3;m.writes++; }
  });
  return {clientFactory,members};
}
test('phone sessions survive server restart, slide on use, and are stored only as hashes',async t=>{
  const dir=mkdtempSync(join(tmpdir(),'arlo-accounts-')); const f=fixture();let now=Date.now();
  let accounts=new Accounts(dir,undefined,{...f,workers:false,now:()=>now});
  t.after(()=>{accounts.close();rmSync(dir,{recursive:true});});
  const a=await accounts.login('0500000001','test-password');const token=accounts.issue(a.account.id);
  assert.ok(!JSON.stringify(accounts.root.db.prepare('SELECT * FROM devices').all()).includes(token));
  const id=a.account.id;accounts.close();accounts=new Accounts(dir,undefined,{...f,workers:false,now:()=>now});
  assert.equal(accounts.authenticate(token).account.id,id);
  now+=300*86400000;assert.ok(accounts.authenticate(token));
  now+=300*86400000;assert.ok(accounts.authenticate(token));
  now+=366*86400000;assert.equal(accounts.authenticate(token),null);
  assert.match(sessionCookie(token,true),/HttpOnly; SameSite=Strict/);assert.match(sessionCookie(token,true),/Secure/);
});
test('each phone account has isolated rules, schedules, booking writes and cancellation exclusions',async t=>{
  const dir=mkdtempSync(join(tmpdir(),'arlo-http-')), f=fixture();
  const accounts=new Accounts(dir,undefined,{...f,workers:false});const server=createApplication(accounts);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));accounts.close();rmSync(dir,{recursive:true});});
  const origin=`http://127.0.0.1:${server.address().port}`;
  async function req(path,cookie,method='GET',data,extra={}) {
    const res=await fetch(origin+'/api/'+path,{method,headers:{Origin:origin,...(cookie?{Cookie:cookie}:{}),...(data?{'Content-Type':'application/json'}:{}),...extra},body:data?JSON.stringify(data):undefined});
    return {status:res.status,data:await res.json(),cookie:res.headers.get('set-cookie')?.split(';')[0]};
  }
  assert.equal((await req('state')).status,401);
  const a=await req('auth',null,'POST',{phone:'0500000001',password:'test-password'});
  const b=await req('auth',null,'POST',{phone:'0500000002',password:'test-password'});
  assert.equal(a.status,200);assert.equal(b.status,200);assert.notEqual(a.cookie,b.cookie);
  const ca=(await req('calendar?start=2050-10-28&days=1',a.cookie)).data.classes[0];
  const wrongAccount=(await req('state',b.cookie)).data.accountId;
  assert.equal((await req('bookings/register',a.cookie,'POST',{key:ca.key,date:ca.date},{'X-Arlo-Account':wrongAccount})).status,409);
  assert.equal(f.members.get(1).writes,0);
  const rule=await req('rules',a.cookie,'POST',{key:ca.key,start:ca.date});assert.equal(rule.status,201);
  assert.equal((await req('state',a.cookie)).data.rules.length,1);
  assert.equal((await req('state',b.cookie)).data.rules.length,0);
  assert.equal((await req('rules/'+rule.data.rule.id,b.cookie,'PATCH',{enabled:false})).status,404);
  assert.equal((await req('rules/'+rule.data.rule.id,b.cookie,'DELETE')).status,404);
  assert.equal((await req('bookings/register',a.cookie,'POST',{key:ca.key,date:ca.date})).data.status,'registered');
  assert.equal(f.members.get(1).writes,1);assert.equal(f.members.get(2).writes,0);
  assert.equal((await req('bookings',b.cookie)).data.classes.length,0);
  const cb=(await req('calendar?start=2050-10-28&days=1',b.cookie)).data.classes[0];assert.equal(cb.status,3);
  await req('bookings/cancel',b.cookie,'POST',{key:ca.key,date:ca.date});
  assert.equal(f.members.get(1).status,2);assert.equal(f.members.get(1).writes,1);
  assert.equal((await req('state',a.cookie)).data.jobs.length,0);
  assert.equal((await req('state',b.cookie)).data.jobs[0].status,'cancelled');
  const a2=await req('auth',null,'POST',{phone:'0500000001',password:'test-password'});
  await req('logout',a.cookie,'POST');assert.equal((await req('state',a.cookie)).status,401);
  assert.equal((await req('state',a2.cookie)).status,200);assert.equal((await req('state',b.cookie)).status,200);
  await req('account',a2.cookie,'DELETE');assert.equal((await req('state',a2.cookie)).status,401);
  assert.equal((await req('state',b.cookie)).status,200);
});
test('legacy rules migrate only to the verified original member',async t=>{
  const dir=mkdtempSync(join(tmpdir(),'arlo-migrate-')),f=fixture();const accounts=new Accounts(dir,undefined,{...f,workers:false});
  t.after(()=>{accounts.close();rmSync(dir,{recursive:true});});
  accounts.root.set('credentials',accounts.root.encrypt({phone:'0500000001',password:'test-password'}));
  accounts.root.db.prepare('INSERT INTO rules VALUES (?,?)').run('old-rule',JSON.stringify({id:'old-rule',enabled:true}));
  const b=await accounts.login('0500000002','test-password');assert.equal(b.store.rules().length,0);
  const a=await accounts.login('0500000001','test-password');assert.equal(a.store.rules()[0].id,'old-rule');
  assert.equal(b.store.rules().length,0);assert.equal(accounts.root.get('credentials'),undefined);
});

test('scheduled registration API stores only the signed-in member request and supports cancellation', async t => {
  const dir=mkdtempSync(join(tmpdir(),'arlo-scheduled-http-')), f=fixture();
  const accounts=new Accounts(dir,undefined,{...f,workers:false,live:false});const server=createApplication(accounts);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));accounts.close();rmSync(dir,{recursive:true});});
  const origin=`http://127.0.0.1:${server.address().port}`;
  const a=await accounts.login('0500000001','test-password'), b=await accounts.login('0500000002','test-password');
  f.members.get(1).status=6;f.members.get(2).status=6;
  const token=accounts.issue(a.account.id), otherToken=accounts.issue(b.account.id);
  const c=(await a.client.calendar())[0];const payload={key:c.key,date:c.date,waitlist:true};
  const post=async (path,token,data=payload)=>{const r=await fetch(origin+'/api/bookings/'+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...(token?{Cookie:`arlo_session=${token}`}:{})},body:JSON.stringify(data)});return {status:r.status,data:await r.json()};};
  assert.equal((await post('schedule',null)).status,401);
  const scheduled=await post('schedule',token);assert.equal(scheduled.status,201);assert.equal(scheduled.data.scheduled,true);
  assert.equal(a.store.db.prepare('SELECT ruleId FROM jobs').get().ruleId,'one-time');
  assert.equal(b.store.db.prepare('SELECT COUNT(*) AS n FROM jobs').get().n,0);
  assert.equal((await post('unschedule',otherToken)).status,400);
  assert.equal(a.store.db.prepare('SELECT status FROM jobs').get().status,'pending');
  assert.equal((await post('unschedule',token)).status,200);
  assert.equal(a.store.db.prepare('SELECT status FROM jobs').get().status,'cancelled');assert.equal(f.members.get(1).writes,0);
});

test('saving a weekly rule reuses the selected day without fetching a week or waiting for reconnect', async t => {
  const dir=mkdtempSync(join(tmpdir(),'arlo-fast-rule-')), f=fixture();let now=Date.now();
  const accounts=new Accounts(dir,undefined,{...f,workers:false,now:()=>now}),server=createApplication(accounts);
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  t.after(async()=>{await new Promise(r=>server.close(r));accounts.close();rmSync(dir,{recursive:true});});
  const a=await accounts.login('0500000001','test-password');const data=await a.schedule('2050-10-28',1);const c=data.classes[0];
  // The club is unavailable now, but trusted per-account metadata is already stored.
  a.client.session=null;a.client.login=()=>new Promise(()=>{});a.client.calendar=()=>{throw new Error('unexpected club read');};now+=31000;
  const origin=`http://127.0.0.1:${server.address().port}`,token=accounts.issue(a.account.id);
  const r=await fetch(origin+'/api/rules',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:`arlo_session=${token}`},body:JSON.stringify({key:c.key,start:c.date})});
  assert.equal(r.status,201);assert.equal(a.store.rules().length,1);
});
test('saved calendar retains manual booking restrictions when raw club data is omitted', async t => {
  const dir=mkdtempSync(join(tmpdir(),'arlo-manual-metadata-')),f=fixture();const accounts=new Accounts(dir,undefined,{...f,workers:false});
  t.after(()=>{accounts.close();rmSync(dir,{recursive:true});});
  const a=await accounts.login('0500000001','test-password');a.client.calendar=async()=>[normalize({LessonID:1,StartHour:'190000',StartDateTimeJson:'2050-10-28T19:00:00+02:00',RequireReserve:true})];
  const data=await a.schedule('2050-10-28',1);assert.equal(data.classes[0].raw,undefined);assert.equal(data.classes[0].manualBooking,true);
});

test('push subscriptions belong to the authenticated phone and are revoked on logout',async t=>{
 const {createECDH,randomBytes}=await import('node:crypto');const e=createECDH('prime256v1');e.generateKeys();
 const subscription={endpoint:'https://fcm.googleapis.com/fcm/send/phone-test',keys:{p256dh:e.getPublicKey().toString('base64url'),auth:randomBytes(16).toString('base64url')}};
 const dir=mkdtempSync(join(tmpdir(),'hug-push-http-')),f=fixture(),accounts=new Accounts(dir,undefined,{...f,workers:false});const server=createApplication(accounts);
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(async()=>{await new Promise(r=>server.close(r));accounts.close();rmSync(dir,{recursive:true});});
 const origin=`http://127.0.0.1:${server.address().port}`;const a=await accounts.login('0500000001','test-password'),b=await accounts.login('0500000002','test-password');const ta=accounts.issue(a.account.id),tb=accounts.issue(b.account.id);
 const req=(route,token,method='GET',data)=>fetch(origin+'/api/'+route,{method,headers:{Origin:origin,'Content-Type':'application/json',...(token?{Cookie:`arlo_session=${token}`}:{})},body:data?JSON.stringify(data):undefined});
 assert.equal((await req('push/config',null)).status,401);assert.equal((await req('push/subscription',ta,'POST',subscription)).status,201);
 assert.equal((await(await req('push/config',ta)).json()).enabled,true);assert.equal((await(await req('push/config',tb)).json()).enabled,false);
 await req('push/subscription',tb,'DELETE');assert.equal((await(await req('push/config',ta)).json()).enabled,true);
 await req('logout',ta,'POST');assert.equal(a.store.db.prepare('SELECT COUNT(*) AS n FROM push_subscriptions').get().n,0);
});

test('active-account warming fetches today and tomorrow once and yields near booking deadlines',async t=>{
 const {israelDate,shiftDate}=await import('../time.mjs');const dir=mkdtempSync(join(tmpdir(),'hug-warm-')),f=fixture();let now=Date.now();
 const accounts=new Accounts(dir,undefined,{...f,workers:true,now:()=>now});t.after(()=>{accounts.close();rmSync(dir,{recursive:true});});
 const a=await accounts.login('0500000001','test-password'),calls=[];const original=a.client.calendar.bind(a.client);a.client.calendar=async(start,end)=>{calls.push([start,end]);return original(start,end)};
 await a.warmSchedule();assert.deepEqual(calls,[[israelDate(now),israelDate(now)],[shiftDate(israelDate(now),1),shiftDate(israelDate(now),1)]]);
 await a.warmSchedule();assert.equal(calls.length,2);
 now+=120001;a.store.db.prepare('INSERT INTO jobs(key,ruleId,dueAt,startsAt,status,nextAt,updatedAt,data) VALUES (?,?,?,?,?,?,?,?)').run('near','one-time',now+30000,now+86400000,'pending',now+30000,now,'{}');
 await a.warmSchedule();assert.equal(calls.length,2);
});
