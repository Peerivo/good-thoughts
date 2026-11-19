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
test('new website question stays unqueued until valid email confirmation; delivers once',async()=>{
 const s=await setup();
 try{
  const first=await s.call('/api/requests',VALID);
  assert.equal(first.status,202);
  assert.equal(s.emails.length,1);
  let queue=await s.call('/api/internal/pending');
  assert.equal(queue.status,401);
  queue=await s.call('/api/internal/pending',undefined,{authorization:'Bearer admin_token_that_is_at_least_20_chars'});
  assert.equal(queue.body.requests.length,0);
  const code=s.emails[0].text.match(/\d{6}/)[0];
  assert.equal((await s.call('/api/verify',{requestId:first.body.requestId,code:code==='999999'?'888888':'999999'})).status,400);
  assert.equal((await s.call('/api/verify',{requestId:first.body.requestId,code})).status,200);
  queue=await s.call('/api/internal/pending',undefined,{authorization:'Bearer admin_token_that_is_at_least_20_chars'});
  assert.equal(queue.body.requests.length,1);
  assert.equal(queue.body.requests[0].question,VALID.question);
  const answer=await s.call('/api/internal/answer',{id:first.body.requestId,answer:'Вы можете дать себе немного времени и сделать маленький шаг.'},{authorization:'Bearer admin_token_that_is_at_least_20_chars'});
  assert.equal(answer.status,200);
  assert.equal(s.emails.length,2);
  assert.equal((await s.call('/api/internal/answer',{id:first.body.requestId,answer:'Другой ответ совершенно нежелателен.'},{authorization:'Bearer admin_token_that_is_at_least_20_chars'})).status,409);
  assert.equal((await s.call('/api/verify',{requestId:first.body.requestId,code})).status,400);
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
test('failed delivery retains the prepared answer and retries without losing it',async()=>{
 const sent=[];
 const s=await setup({emailSender:async msg=>{sent.push(msg);if(sent.length===2)throw Error('test_failure');}});
 try{
  const intake=await s.call('/api/requests',VALID);
  const code=sent[0].text.match(/[0-9]{6}/)[0];
  assert.equal((await s.call('/api/verify',{requestId:intake.body.requestId,code})).status,200);
  const hdr={authorization:'Bearer admin_token_that_is_at_least_20_chars'};
  const first=await s.call('/api/internal/answer',{id:intake.body.requestId,answer:'Первый бережный ответ, который нужно сохранить.'},hdr);
  assert.equal(first.status,502);
  assert.equal(first.body.status,'delivery_failed');
  const pending=await s.call('/api/internal/pending',undefined,hdr);
  assert.equal(pending.body.failedDeliveries.length,1);
  const second=await s.call('/api/internal/answer',{id:intake.body.requestId,answer:'Другой ответ не должен заменить предыдущий.'},hdr);
  assert.equal(second.status,200);
  assert.equal(sent.length,3);
  assert.match(sent[2].text,/Первый бережный ответ/);
  assert.doesNotMatch(sent[2].text,/Другой ответ/);
 }finally{await s.done();}
});
