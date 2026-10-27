import test from 'node:test';
import assert from 'node:assert/strict';
import { singleBooking, cancelBooking } from '../bookings.mjs';
import { Fizikal } from '../fizikal.mjs';
function fake(status = 3) {
  let writes = 0;
  const a = { key:'1:future:190000', startsAt:Date.now()+86400000, status };
  return { a, get writes() { return writes; }, async calendar() { return [{...a}]; }, async register(current, waitlist) { writes++; a.status = waitlist ? 4 : 2; }, async cancel() { writes++; a.status = 3; } };
}
test('single booking confirms member status and does not repeat existing registration', async () => {
  const client = fake();
  assert.equal((await singleBooking(client, client.a.key, '2026-10-28')).status, 'registered');
  assert.equal((await singleBooking(client, client.a.key, '2026-10-28')).already, true);
  assert.equal(client.writes, 1);
});
test('full classes require waitlist preference', async () => {
  const client = fake(1);
  await assert.rejects(singleBooking(client,client.a.key,'2026-10-28'), /Enable the waitlist/);
  assert.equal(client.writes,0);
  assert.equal((await singleBooking(client,client.a.key,'2026-10-28',true)).status,'waitlisted');
});
test('lost mutation response is reconciled without a second registration', async () => {
  const client = fake();
  client.register = async () => { client.a.status=2; throw new Error('Connection lost'); };
  assert.equal((await singleBooking(client,client.a.key,'2026-10-28')).status,'registered');
});
test('cancel confirms removal and a second cancellation sends no mutation', async () => {
  const client = fake(2);
  assert.equal((await cancelBooking(client,client.a.key,'2026-10-28')).status,'cancelled');
  assert.equal((await cancelBooking(client,client.a.key,'2026-10-28')).already,true);
  assert.equal(client.writes,1);
});
test('club rejection never reports cancellation success', async () => {
  const client = fake(2); client.cancel=async()=>{throw new Error('Deadline passed');};
  await assert.rejects(cancelBooking(client,client.a.key,'2026-10-28'),/Deadline passed/);
});
test('waitlist cancellation uses waitlist API and late cancellation is blocked', async () => {
  const client=new Fizikal(); client.session={userId:1};
  let route, method;
  client.call=async(p,params,m)=>{route=p;method=m;};
  const a={status:4,date:'2026-10-28',raw:{StartHour:'190000'}};
  await client.cancel(a); assert.equal(route,'/JActivityService.svc/Waitlist'); assert.equal(method,'DELETE');
  await client.cancel({...a,status:2}); assert.equal(route,'/JActivityService.svc/User2');
  await assert.rejects(client.cancel({...a,status:8}),/deadline/);
});
