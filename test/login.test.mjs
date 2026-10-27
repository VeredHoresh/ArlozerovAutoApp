import test from 'node:test';
import assert from 'node:assert/strict';
import { Fizikal } from '../fizikal.mjs';
test('login uses the thin endpoint that returns member branches', async () => {
  const client = new Fizikal();
  client.call = async (path, params, method, body, session) => {
    assert.equal(path, '/JLoginService.svc/UserThin');
    assert.equal(method, 'POST');
    assert.equal(body.MainCompanyID, 230);
    assert.equal(body.MainBranchID, 23);
    assert.deepEqual(body.UserIDs, ['0500000000']);
    assert.equal(session, null);
    return { Token: 'test-token', MainBranch: { CompanyID: 230, ID: 23, LoggedUser: { ID: 99, FirstName: 'Test' } } };
  };
  assert.deepEqual(await client.login('050 000-0000', 'test-only'), { name: 'Test' });
  assert.equal(client.session.userId, 99);
});
test('login does not silently select a member from a family account', async () => {
  const client = new Fizikal();
  const member = id => ({ CompanyID: 230, ID: 23, LoggedUser: { ID: id } });
  client.call = async () => ({ Token: 'test-token', MainBranch: member(1), OtherBranches: [member(2)] });
  await assert.rejects(client.login('0500000000', 'test-only'), /Multiple family members/);
  assert.equal(client.session, null);
});
test('expired authenticated reads reconnect once and use the renewed member token', async t => {
  const original=globalThis.fetch; t.after(()=>{globalThis.fetch=original;});
  const client=new Fizikal(); client.config={server:'https://m.fizikal.co.il/wsw',headers:{}}; client.session={token:'expired',userId:1};
  let calls=0, renewals=0;
  globalThis.fetch=async(url,options)=>{
    calls++;
    if(calls===1)return {ok:true,json:async()=>({ResultCode:2})};
    assert.equal(options.headers.TOKEN,'renewed'); assert.equal(url.searchParams.get('userId'),'2');
    return {ok:true,json:async()=>({ResultCode:1,Data:[]})};
  };
  client.reauthenticate=async()=>{renewals++;client.session={token:'renewed',userId:2};return true;};
  assert.deepEqual(await client.call('/JActivityService.svc/User',{userId:1}),[]);
  assert.equal(calls,2);assert.equal(renewals,1);
});
test('a rejected mutation is not automatically replayed during session renewal', async t => {
  const original=globalThis.fetch;t.after(()=>{globalThis.fetch=original;});
  const client=new Fizikal();client.config={server:'https://m.fizikal.co.il/wsw',headers:{}};client.session={token:'expired',userId:1};
  let calls=0;globalThis.fetch=async()=>{calls++;return {ok:true,json:async()=>({ResultCode:2})};};
  client.reauthenticate=async()=>{throw new Error('Must not replay a booking');};
  await assert.rejects(client.call('/JActivityService.svc/User',{},'PUT',{}));
  assert.equal(calls,1);
});
