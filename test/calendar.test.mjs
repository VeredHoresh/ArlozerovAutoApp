import test from 'node:test';
import assert from 'node:assert/strict';
import { Fizikal } from '../fizikal.mjs';
test('single day loading fetches only that day and shares simultaneous requests', async () => {
  const client = new Fizikal(); let reads = 0;
  client.fetchCalendarDay = async date => { reads++; await new Promise(resolve => setTimeout(resolve, 5)); return [{date}]; };
  const [a,b] = await Promise.all([client.calendar('2026-10-28','2026-10-28'),client.calendar('2026-10-28','2026-10-28')]);
  assert.equal(reads,1); assert.deepEqual(a,b); assert.equal(a.length,1);
  await client.calendar('2026-10-28','2026-10-28'); assert.equal(reads,1);
});
test('background ranges use bounded daily requests rather than a slow week request', async () => {
  const client = new Fizikal(); let active=0,max=0;
  client.fetchCalendarDay = async date => { max=Math.max(max,++active); await new Promise(resolve=>setTimeout(resolve,5)); active--; return [{date}]; };
  const result=await client.calendar('2026-10-25','2026-10-31');
  assert.equal(result.length,7); assert.equal(max,3); assert.equal(result[6].date,'2026-10-31');
});
