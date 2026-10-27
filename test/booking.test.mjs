import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore } from '../store.mjs';
import { Scheduler } from '../scheduler.mjs';
import { normalize, DAY } from '../time.mjs';
function fixture(t, { live = true, timestamp = '2026-10-28T19:00:00+02:00' } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'arlo-test-'));
  const store = openStore(dir);
  t.after(() => { store.db.close(); rmSync(dir, { recursive: true }); });
  const a = normalize({ LessonID: 123, ID: 0, Name: 'Yoga', DateJson: timestamp.slice(0, 10).replaceAll('-', '/'), StartDateTimeJson: timestamp, StartHour: '190000', DurationInMinutes: 50, Status: 3, EmployeeID: 1 });
  let now = a.dueAt - 10000, status = 3, sends = 0, failAfterSend = false;
  const rule = { id: 'r1', lessonId: a.lessonId, weekday: a.weekday, time: a.time, enabled: true, waitlist: false };
  store.db.prepare('INSERT INTO rules VALUES (?,?)').run(rule.id, JSON.stringify(rule));
  store.set('credentials', store.encrypt({ phone: '0500000000', password: 'test-only' }));
  const client = { session: { userId: 1 }, async calendar() { return [{ ...a, status }]; }, async register() { sends++; status = 2; if (failAfterSend) throw new Error('Network connection lost after server committed'); } };
  const scheduler = new Scheduler(store, client, { live, now: () => now });
  return { store, scheduler, a, rule, client, setNow(v) { now = v; }, setStatus(v) { status = v; }, failAfterSend() { failAfterSend = true; }, sends: () => sends, job: () => store.db.prepare('SELECT * FROM jobs').get() };
}
test('24 hours means elapsed 24 hours across Israel DST change', () => {
  const a = normalize({ LessonID: 1, StartHour: '080000', StartDateTimeJson: '2026-10-25T08:00:00+02:00' });
  assert.equal(a.startsAt - a.dueAt, DAY);
  assert.equal(new Date(a.dueAt).toISOString(), '2026-10-24T06:00:00.000Z');
  assert.equal(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', hour: '2-digit' }).format(a.dueAt), '09');
});
test('does not book early, books on target, and does not duplicate across restart', async t => {
  const f = fixture(t); await f.scheduler.sync();
  await f.scheduler.tick(); assert.equal(f.sends(), 0);
  f.setNow(f.a.dueAt); await f.scheduler.tick();
  assert.equal(f.sends(), 1); assert.equal(f.job().status, 'registered');
  const restarted = new Scheduler(f.store, f.client, { live: true, now: () => f.a.dueAt + 1000 });
  await restarted.tick(); assert.equal(f.sends(), 1);
});
test('reconciles uncertain booking response before retrying mutation', async t => {
  const f = fixture(t); await f.scheduler.sync(); f.failAfterSend(); f.setNow(f.a.dueAt); await f.scheduler.tick();
  assert.equal(f.job().status, 'retry'); assert.equal(f.sends(), 1);
  f.setNow(f.a.dueAt + 5001); await f.scheduler.tick();
  assert.equal(f.job().status, 'registered'); assert.equal(f.sends(), 1);
});
test('full class is not waitlisted without an explicit preference', async t => {
  const f = fixture(t); await f.scheduler.sync(); f.setStatus(1); f.setNow(f.a.dueAt); await f.scheduler.tick();
  assert.equal(f.sends(), 0); assert.equal(f.job().status, 'failed');
});
test('preview mode never registers', async t => {
  const f = fixture(t, { live: false }); await f.scheduler.sync(); f.setNow(f.a.dueAt); await f.scheduler.tick();
  assert.equal(f.sends(), 0); assert.equal(f.job().status, 'pending');
});
test('a rule created after opening does not trigger an immediate late booking', async t => {
  const f = fixture(t); f.setNow(f.a.dueAt + 5000); await f.scheduler.sync(); await f.scheduler.tick();
  assert.equal(f.job(), undefined); assert.equal(f.sends(), 0);
});
test('paused rules cannot book previously queued occurrences', async t => {
  const f = fixture(t); await f.scheduler.sync();
  f.store.db.prepare('UPDATE rules SET data=?').run(JSON.stringify({ ...f.rule, enabled: false }));
  f.setNow(f.a.dueAt); await f.scheduler.tick();
  assert.equal(f.sends(), 0); assert.equal(f.job().status, 'cancelled');
});
test('restart after the grace period marks missed and never books late', async t => {
  const f = fixture(t); await f.scheduler.sync(); f.setNow(f.a.dueAt + 121000); await f.scheduler.tick();
  assert.equal(f.sends(), 0); assert.equal(f.job().status, 'missed');
});
test('encrypted credentials round-trip and do not contain plaintext', t => {
  const f = fixture(t), secret = f.store.get('credentials');
  assert.ok(!secret.includes('test-only'));
  assert.equal(f.store.decrypt(secret).password, 'test-only');
});
test('waitlisting requires preference and is confirmed separately', async t => {
  const f = fixture(t);
  f.store.db.prepare('UPDATE rules SET data=?').run(JSON.stringify({ ...f.rule, waitlist: true }));
  await f.scheduler.sync(); f.setStatus(1);
  let requestedWaitlist;
  f.client.register = async (a, waitlist) => { requestedWaitlist = waitlist; f.setStatus(4); };
  f.setNow(f.a.dueAt); await f.scheduler.tick();
  assert.equal(requestedWaitlist, true); assert.equal(f.job().status, 'waitlisted');
});
test('a pinned instructor substitution does not register the original occurrence', async t => {
  const f = fixture(t);
  f.store.db.prepare('UPDATE rules SET data=?').run(JSON.stringify({ ...f.rule, pinInstructor: true, instructorId: 1 }));
  await f.scheduler.sync();
  f.client.calendar = async () => [{ ...f.a, instructorId: 2 }];
  f.setNow(f.a.dueAt); await f.scheduler.tick();
  assert.equal(f.sends(), 0); assert.equal(f.job().status, 'cancelled');
});
test('removing a rule while schedule refresh is in flight cannot create jobs', async t => {
  const f = fixture(t);
  f.client.calendar = async () => { f.store.db.prepare('DELETE FROM rules').run(); return [f.a]; };
  await f.scheduler.sync(); assert.equal(f.job(), undefined);
});

test('one-time opening uses club window, survives restart and runs with weekly booking paused', async t => {
  const f = fixture(t, { live: false });
  const a = { ...f.a, status: 6, clubWindow: { NumberOfDays: 2, NumberOfMinutes: 30 } };
  const dueAt = a.startsAt - 2 * DAY - 30 * 60000;
  f.setNow(dueAt - 1000);
  const result = f.scheduler.scheduleOnce(a);
  assert.equal(result.opensAt, dueAt); assert.equal(result.openingEstimated, false);
  f.store.db.prepare('DELETE FROM rules').run();
  await f.scheduler.sync(); assert.equal(f.job().ruleId, 'one-time');
  const restarted = new Scheduler(f.store, f.client, { live: false, now: () => dueAt - 1 });
  await restarted.tick(); assert.equal(f.sends(), 0);
  const onTime = new Scheduler(f.store, f.client, { live: false, now: () => dueAt });
  await onTime.tick(); assert.equal(f.sends(), 1); assert.equal(f.job().status, 'registered');
  await onTime.tick(); assert.equal(f.sends(), 1);
});
test('one-time schedule cancellation prevents a send and weekly sync does not replace it', async t => {
  const f = fixture(t); f.scheduler.scheduleOnce({ ...f.a, status: 6 }, true);
  await f.scheduler.sync(); assert.equal(f.job().ruleId, 'one-time');
  assert.equal(JSON.parse(f.job().data).scheduledWaitlist, true);
  f.scheduler.cancelScheduled(f.a.key);
  f.setNow(f.a.dueAt); await f.scheduler.tick(); assert.equal(f.sends(), 0); assert.equal(f.job().status, 'cancelled');
});
test('one-time uncertain result is reconciled without duplicate registration', async t => {
  const f = fixture(t, { live: false }); f.scheduler.scheduleOnce({ ...f.a, status: 6 });
  f.failAfterSend(); f.setNow(f.a.dueAt); await f.scheduler.tick(); assert.equal(f.sends(), 1);
  f.setNow(f.a.dueAt + 5001); await f.scheduler.tick(); assert.equal(f.sends(), 1); assert.equal(f.job().status, 'registered');
});
test('one-time waitlist preference is respected and late restarts do not book', async t => {
  const f = fixture(t, { live: false }); f.scheduler.scheduleOnce({ ...f.a, status: 6 }, true);
  f.setStatus(1); f.client.register = async (a, waitlist) => { assert.equal(waitlist, true); f.setStatus(4); };
  f.setNow(f.a.dueAt); await f.scheduler.tick(); assert.equal(f.job().status, 'waitlisted');
  const g = fixture(t, { live: false }); g.scheduler.scheduleOnce({ ...g.a, status: 6 });
  g.setNow(g.a.dueAt + 121000); await g.scheduler.tick(); assert.equal(g.job().status, 'missed'); assert.equal(g.sends(), 0);
});
test('opening calculation preserves elapsed time at DST and labels fallback; invalid scheduling is rejected', async t => {
  const f = fixture(t, { timestamp: '2026-10-25T08:00:00+02:00' });
  const result = f.scheduler.scheduleOnce({ ...f.a, status: 6 });
  assert.equal(result.openingEstimated, true); assert.equal(result.opensAt, f.a.startsAt - DAY);
  assert.throws(() => f.scheduler.scheduleOnce({ ...f.a, status: 3 }));
  assert.throws(() => f.scheduler.scheduleOnce({ ...f.a, status: 6, paid: true }));
});
