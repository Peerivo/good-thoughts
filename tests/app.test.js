import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../src/app.js';

async function setup(extra={}) {
 const dir=mkdtempSync(join(tmpdir(),'dm-')), emails=[], telegram=[];
 const app=createApp({dbPath:join(dir,'test.sqlite'),adminToken:'admin_token_that_is_at_least_20_chars',
  emailSender:async m=>emails.push(m),telegramSender:async m=>telegram.push(m),
  ...extra});
 await new Promise(ok=>app.server.listen(0,'127.0.0.1',ok));
 const url='http://127.0.0.1:'+app.server.address().port;
 const call=async(path,data,headers={})=>{
  const response=await fetch(url+path,{method:data===undefined?'GET':'POST',
    headers:{'content-type':'application/json',...headers},body:data===undefined?undefined:JSON.stringify(data)});
  return {status:response.status,body:await response.json()};
 };
 return {app,dir,emails,telegram,call,done:async()=>{await app.close();rmSync(dir,{recursive:true,force:true});}};
}
const VALID={category:'support',question:'Мне не хватает поддержки сегодня.',email:'test@example.org'};
test('email confirmation -> draft -> owner approval -> one delivery; no direct auto-send',async()=>{
 const s=await setup();const hdr={authorization:'Bearer admin_token_that_is_at_least_20_chars'};
 try{
  const first=await s.call('/api/requests',VALID);
  assert.equal(first.status,202);
  assert.equal(s.emails.length,1);
  assert.equal((await s.call('/api/internal/pending')).status,401);
  let q=await s.call('/api/internal/pending',undefined,hdr);
  assert.equal(q.body.requests.length,0);
  const code=s.emails[0].text.match(/[0-9]{6}/)[0];
  assert.equal((await s.call('/api/verify',{requestId:first.body.requestId,code:code==='999999'?'888888':'999999'})).status,400);
  assert.equal((await s.call('/api/verify',{requestId:first.body.requestId,code})).status,200);
  q=await s.call('/api/internal/pending',undefined,hdr);
  assert.equal(q.body.requests.length,1);
  assert.equal(q.body.requests[0].question,VALID.question);
  const notices=await s.call('/api/internal/notifications',undefined,hdr);
  assert.equal(notices.body.notifications.length,1);
  assert.equal(notices.body.notifications[0].kind,'new_question');
  assert.equal((await s.call('/api/internal/answer',{id:first.body.requestId,answer:'Этот путь устарел.'},hdr)).status,410);
  const answer='Вы можете дать себе немного времени и сделать маленький шаг.';
  const draft=await s.call('/api/internal/draft',{id:first.body.requestId,answer},hdr);
  assert.equal(draft.status,200);
  assert.equal(draft.body.status,'awaiting_approval');
  assert.equal(s.emails.length,1,'drafting must never send');
  const id=first.body.requestId,version=draft.body.draftVersion;
  assert.equal((await s.call('/api/internal/deliver',{id,version},hdr)).status,409);
  const review=await s.call('/api/internal/pending',undefined,hdr);
  assert.equal(review.body.awaitingApproval[0].answer,answer);
  assert.equal((await s.call('/api/internal/approve',{id,version,decision:'approve'},hdr)).status,200);
  assert.equal(s.emails.length,1,'approving alone must not send');
  const result=await s.call('/api/internal/deliver',{id,version},hdr);
  assert.equal(result.status,200);
  assert.equal(s.emails.length,2);
  assert.match(s.emails[1].text,/маленький шаг/);
  assert.equal((await s.call('/api/internal/deliver',{id,version},hdr)).status,409);
  assert.equal((await s.call('/api/verify',{requestId:id,code})).status,400);
 }finally{await s.done();}
});
test('unconfigured mail refuses requests rather than pretending to send',async()=>{
 const s=await setup({emailSender:null});
 try{
  const response=await s.call('/api/health');
  assert.equal(response.status,200);
  const r=await s.call('/api/requests',VALID);
  assert.equal(r.status,503);
 }finally{await s.done();}
});
test('failed verification-email delivery leaves no confirmed or pending question',async()=>{
 const s=await setup({emailSender:async()=>{throw Error('provider_unavailable');}});
 const hdr={authorization:'Bearer admin_token_that_is_at_least_20_chars'};
 try{
  const result=await s.call('/api/requests',VALID);
  assert.equal(result.status,503);
  assert.equal(result.body.requestId,undefined,'do not expose a nonexistent request');
  const pending=await s.call('/api/internal/pending',undefined,hdr);
  assert.equal(pending.status,200);
  assert.deepEqual(pending.body.requests,[]);
  assert.deepEqual(pending.body.awaitingApproval,[]);
  const summary=await s.call('/api/internal/summary',undefined,hdr);
  assert.deepEqual(summary.body.counts,[],'failed email must roll back the unverified row');
  const notices=await s.call('/api/internal/notifications',undefined,hdr);
  assert.deepEqual(notices.body.notifications,[],'do not notify owner of an unconfirmed question');
 }finally{await s.done();}
});
test('rejects invalid input and throttles repeated requests',async()=>{
 const s=await setup();
 try{
  assert.equal((await s.call('/api/requests',{...VALID,email:'invalid'})).status,400);
  for(let i=0;i<5;i++)assert.equal((await s.call('/api/requests',VALID)).status,202);
  assert.equal((await s.call('/api/requests',VALID)).status,429);
 }finally{await s.done();}
});
test('telegram requires secret, ignores duplicate update, queues private chat',async()=>{
 const s=await setup({telegramToken:'dummy_bot',telegramSecret:'this-is-a-secret'});
 try{
  const incoming={update_id:18,message:{chat:{id:12345,type:'private'},text:'Мне нужна поддержка в этот день'}};
  assert.equal((await s.call('/api/telegram/webhook',incoming)).status,403);
  const headers={'x-telegram-bot-api-secret-token':'this-is-a-secret'};
  assert.equal((await s.call('/api/telegram/webhook',incoming,headers)).status,200);
  assert.equal((await s.call('/api/telegram/webhook',incoming,headers)).body.duplicate,true);
  const pending=await s.call('/api/internal/pending',undefined,{authorization:'Bearer admin_token_that_is_at_least_20_chars'});
  assert.equal(pending.body.requests.length,1);
  assert.equal(pending.body.requests[0].channel,'telegram');
  assert.equal(s.telegram.length,1);
 }finally{await s.done();}
});
test('rejection, revised draft, stale approvals, and version gate work',async()=>{
 const s=await setup();const hdr={authorization:'Bearer admin_token_that_is_at_least_20_chars'};
 try {
  const r=await s.call('/api/requests',VALID),id=r.body.requestId;
  const code=s.emails[0].text.match(/[0-9]{6}/)[0];
  await s.call('/api/verify',{requestId:id,code});
  const one=await s.call('/api/internal/draft',{id,answer:'Вариант первый для отправки клиенту.'},hdr);
  const v1=one.body.draftVersion;
  assert.equal((await s.call('/api/internal/approve',{id,version:v1,decision:'revise'},hdr)).body.status,'revision_requested');
  assert.equal((await s.call('/api/internal/deliver',{id,version:v1},hdr)).status,409);
  const two=await s.call('/api/internal/draft',{id,answer:'Новый исправленный ответ для клиента.'},hdr);
  assert.equal(two.body.draftVersion,v1+1);
  assert.equal((await s.call('/api/internal/approve',{id,version:v1,decision:'approve'},hdr)).status,409);
  assert.equal((await s.call('/api/internal/approve',{id,version:v1+1,decision:'approve'},hdr)).status,200);
  assert.equal((await s.call('/api/internal/deliver',{id,version:v1},hdr)).status,409);
  assert.equal(s.emails.length,1);
  assert.equal((await s.call('/api/internal/deliver',{id,version:v1+1},hdr)).status,200);
  assert.match(s.emails[1].text,/исправленный/);
  assert.doesNotMatch(s.emails[1].text,/Вариант первый/);
 }finally{await s.done();}
});
test('ambiguous delivery failure never silently retries or resends',async()=>{
 const sent=[];
 const s=await setup({emailSender:async msg=>{sent.push(msg);if(sent.length===2)throw Error('timeout_unknown');}});
 const hdr={authorization:'Bearer admin_token_that_is_at_least_20_chars'};
 try{
  const r=await s.call('/api/requests',VALID),id=r.body.requestId;
  const code=sent[0].text.match(/[0-9]{6}/)[0];
  await s.call('/api/verify',{requestId:id,code});
  const draft=await s.call('/api/internal/draft',{id,answer:'Этот бережный ответ должен остаться неизменным.'},hdr);
  const version=draft.body.draftVersion;
  await s.call('/api/internal/approve',{id,version,decision:'approve'},hdr);
  const failure=await s.call('/api/internal/deliver',{id,version},hdr);
  assert.equal(failure.status,502);
  assert.equal(failure.body.status,'delivery_failed');
  assert.equal((await s.call('/api/internal/deliver',{id,version},hdr)).status,409);
  assert.equal((await s.call('/api/internal/answer',{id,answer:'Другой ответ'},hdr)).status,410);
  assert.equal(sent.length,2);
  assert.equal((await s.call('/api/internal/pending',undefined,hdr)).body.failedDeliveries.length,1);
 }finally{await s.done();}
});
test('notification outbox is owner-only and records a single issue receipt',async()=>{
 const s=await setup(),hdr={authorization:'Bearer admin_token_that_is_at_least_20_chars'};
 try{
  const r=await s.call('/api/requests',VALID),id=r.body.requestId;
  const code=s.emails[0].text.match(/[0-9]{6}/)[0];
  await s.call('/api/verify',{requestId:id,code});
  const d=await s.call('/api/internal/draft',{id,answer:'Нужен отдельный предварительно одобренный ответ.'},hdr);
  const n=await s.call('/api/internal/notifications',undefined,hdr);
  assert.equal(n.body.notifications.length,2);
  assert.deepEqual(new Set(n.body.notifications.map(x=>x.kind)),new Set(['new_question','draft_v'+d.body.draftVersion]));
  const n0=n.body.notifications[0];
  assert.equal((await s.call('/api/internal/notification-sent',{id:n0.id,issueNumber:9})).status,401);
  assert.equal((await s.call('/api/internal/notification-sent',{id:n0.id,issueNumber:9},hdr)).status,200);
  assert.equal((await s.call('/api/internal/notification-sent',{id:n0.id,issueNumber:9},hdr)).status,409);
  assert.equal((await s.call('/api/internal/notifications',undefined,hdr)).body.notifications.length,1);
 }finally{await s.done();}
});

test('HEAD on public frontend matches GET status and content type without body',async()=>{
 const s=await setup();
 try {
  const port=s.app.server.address().port;
  const base='http://127.0.0.1:'+port;
  const get=await fetch(base+'/');
  const head=await fetch(base+'/',{method:'HEAD'});
  assert.equal(head.status,get.status);
  assert.equal(head.headers.get('content-type'),get.headers.get('content-type'));
  assert.equal((await head.arrayBuffer()).byteLength,0);
  assert.equal((await fetch(base+'/api/internal/pending',{method:'HEAD'})).status,401);
 }finally{await s.done();}
});

// Regression: private questions must never be readable with an invalid token or cached.
test('owner-only summary and notification APIs reject unauthenticated reads',async()=>{
 const s=await setup();
 try {
  const base='http://127.0.0.1:'+s.app.server.address().port;
  for(const path of ['/api/internal/summary','/api/internal/notifications']){
   const anonymous=await fetch(base+path);
   assert.equal(anonymous.status,401,path);
   assert.equal(anonymous.headers.get('cache-control'),'no-store');
   const authorized=await fetch(base+path,{headers:{authorization:'Bearer admin_token_that_is_at_least_20_chars'}});
   assert.equal(authorized.status,200,path);
   assert.equal(authorized.headers.get('cache-control'),'no-store');
  }
 }finally{await s.done();}
});

test('private pending API rejects wrong bearer and disables caching',async()=>{
 const s=await setup();
 try {
  const base='http://127.0.0.1:'+s.app.server.address().port;
  const wrong=await fetch(base+'/api/internal/pending',{headers:{authorization:'Bearer incorrect_token_that_is_long_enough'}});
  assert.equal(wrong.status,401);
  assert.equal(wrong.headers.get('cache-control'),'no-store');
  const valid=await fetch(base+'/api/internal/pending',{headers:{authorization:'Bearer admin_token_that_is_at_least_20_chars'}});
  assert.equal(valid.status,200);
  assert.equal(valid.headers.get('cache-control'),'no-store');
  assert.equal(valid.headers.get('x-content-type-options'),'nosniff');
 }finally{await s.done();}
});
