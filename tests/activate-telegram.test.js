import test from 'node:test';
import assert from 'node:assert/strict';
import {activate,BOT_USERNAME,WEBHOOK_URL,validateConfig} from '../scripts/activate-telegram.mjs';
const valid={token:'123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghi1234',secret:'x'.repeat(40)};
test('Telegram activation rejects missing credentials',()=>{
 assert.throws(()=>validateConfig({token:'',secret:''}),/missing or invalid/);
 assert.throws(()=>validateConfig({...valid,secret:'too-short'}),/random 32/);
});
test('Telegram activation verifies bot identity, registers commands and signed webhook',async()=>{
 const calls=[];
 const request=async (url,options)=>{
  const method=url.split('/').at(-1),b=JSON.parse(options.body);
  calls.push({method,body:b});
  const result=method==='getMe'?{username:BOT_USERNAME}:method==='getWebhookInfo'?{url:WEBHOOK_URL}:true;
  return {ok:true,json:async()=>({ok:true,result})};
 };
 const result=await activate(valid,request);
 assert.equal(result.ok,true);
 assert.deepEqual(calls.map(c=>c.method),['getMe','setMyCommands','setWebhook','getWebhookInfo']);
 assert.equal(calls[2].body.secret_token,valid.secret);
 assert.equal(calls[2].body.url,WEBHOOK_URL);
 assert.equal(calls[2].body.drop_pending_updates,false);
});
test('bot identity mismatch rejects activation before changing webhook',async()=>{
 const calls=[];
 const request=async url=>{
  calls.push(url.split('/').at(-1));
  return {ok:true,json:async()=>({ok:true,result:{username:'AnotherBot'}})};
 };
 await assert.rejects(()=>activate(valid,request),/Unexpected Telegram bot identity/);
 assert.deepEqual(calls,['getMe']);
});
