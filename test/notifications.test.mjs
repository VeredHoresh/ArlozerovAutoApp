import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createECDH, randomBytes } from 'node:crypto';
import { openStore } from '../store.mjs';
import { PushNotifications, validateSubscription, notificationPayload, loadPushKeys } from '../notifications.mjs';
function subscription() { const e=createECDH('prime256v1');e.generateKeys();return {endpoint:'https://fcm.googleapis.com/fcm/send/test',keys:{p256dh:e.getPublicKey().toString('base64url'),auth:randomBytes(16).toString('base64url')}}; }
function fixture(t,{send=async()=>{},deviceActive=()=>true}={}) {
 const dir=mkdtempSync(join(tmpdir(),'hug-push-')),store=openStore(dir);let now=1000;const keys=loadPushKeys(dir);
 const notifier=new PushNotifications(store,{keys,send,deviceActive,now:()=>now});
 t.after(()=>{notifier.stop();store.db.close();rmSync(dir,{recursive:true});});
 const job=(status='registered',at=2000,attempts=1)=>{store.db.prepare('INSERT OR REPLACE INTO jobs(key,ruleId,dueAt,startsAt,status,attempts,nextAt,updatedAt,data) VALUES (?,?,?,?,?,?,?,?,?)').run('job','one-time',0,Date.parse('2026-10-28T17:45:00+02:00'),status,attempts,0,at,JSON.stringify({name:'יוגה'}));};
 return {store,notifier,job,keys,dir,setNow:n=>now=n};
}
test('push validates provider endpoints and keys instead of accepting arbitrary server fetch targets',()=>{
 const value=subscription();assert.equal(validateSubscription(value).endpoint,value.endpoint);
 for(const endpoint of ['http://fcm.googleapis.com/a','https://127.0.0.1/a','https://fcm.googleapis.com.evil.example/a','https://fcm.googleapis.com:8443/a','https://user@fcm.googleapis.com/a'])assert.throws(()=>validateSubscription({...value,endpoint}));
 assert.throws(()=>validateSubscription({...value,keys:{auth:'x',p256dh:'x'}}));
});
test('only new final results are sent once, with encrypted subscriptions and Israel dates',async t=>{
 const sent=[];const f=fixture(t,{send:async(s,p)=>sent.push(JSON.parse(p))});f.job('registered',500);f.notifier.subscribe(subscription(),'phone');
 await f.notifier.flush();assert.equal(sent.length,0);f.job('retry');await f.notifier.flush();assert.equal(sent.length,0);
 f.job('registered');await f.notifier.flush();await f.notifier.flush();assert.equal(sent.length,1);assert.match(sent[0].title,/אושרה/);assert.match(sent[0].body,/17:45/);assert.equal(sent[0].url,'/?view=upcoming');
 const stored=f.store.db.prepare('SELECT data FROM push_subscriptions').get().data;assert.ok(!stored.includes('fcm.googleapis.com'));
 assert.deepEqual(loadPushKeys(f.dir),f.keys);
 const restarted=new PushNotifications(f.store,{keys:f.keys,send:async()=>sent.push('duplicate'),now:()=>3000});await restarted.flush();assert.equal(sent.length,1);
});
test('transient delivery failures retry and expired subscriptions are removed',async t=>{
 let calls=0;const f=fixture(t,{send:async()=>{if(++calls===1)throw new Error('temporary');}});f.notifier.subscribe(subscription(),'phone');f.job();await f.notifier.flush();await f.notifier.flush();assert.equal(calls,1);
 f.setNow(32000);await f.notifier.flush();assert.equal(calls,2);
 const g=fixture(t,{send:async()=>{throw Object.assign(new Error('gone'),{statusCode:410});}});g.notifier.subscribe(subscription(),'other');g.job();await g.notifier.flush();assert.equal(g.store.db.prepare('SELECT COUNT(*) AS n FROM push_subscriptions').get().n,0);
});
test('revoked devices cannot receive push and opting out clears pending deliveries',async t=>{
 let sent=0;const f=fixture(t,{deviceActive:()=>false,send:async()=>sent++});f.notifier.subscribe(subscription(),'phone');f.job();await f.notifier.flush();assert.equal(sent,0);assert.equal(f.store.db.prepare('SELECT COUNT(*) AS n FROM push_subscriptions').get().n,0);
 const g=fixture(t,{send:async()=>sent++});g.notifier.subscribe(subscription(),'phone');g.job();g.notifier.unsubscribeDevice('phone');await g.notifier.flush();assert.equal(sent,0);
});
test('waitlist and failed results have distinct Hebrew messages',()=>{
 for(const [status,word]of [['waitlisted','ההמתנה'],['failed','לא הושלמה'],['missed','חלף']])assert.ok(notificationPayload({key:'x',status,startsAt:Date.now(),data:'{"name":"יוגה"}'}).title.includes(word));
});
