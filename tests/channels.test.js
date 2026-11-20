import test from 'node:test';
import assert from 'node:assert/strict';
import {sendEmail,sendTelegram} from '../src/channels.js';

test('Resend success requires a nonempty provider receipt ID',async()=>{
 const original=globalThis.fetch;
 const conf={resendKey:'dummy_key',mailFrom:'noreply@example.org'};
 const mail={to:'user@example.org',subject:'Confirmation',text:'Test'};
 try{
  for(const payload of [{},{id:''},{ok:false},{id:null}]){
   globalThis.fetch=async()=>new Response(JSON.stringify(payload),{status:200,headers:{'content-type':'application/json'}});
   await assert.rejects(sendEmail(conf,mail),/remote_missing_receipt|remote_api_failed/);
  }
  globalThis.fetch=async()=>new Response(JSON.stringify({id:'email_test_receipt'}),{status:200,headers:{'content-type':'application/json'}});
  await assert.doesNotReject(sendEmail(conf,mail));
 }finally{globalThis.fetch=original;}
});


test('Telegram delivery requires a successful message receipt, not HTTP 200 alone',async()=>{
 const original=globalThis.fetch;
 const conf={telegramToken:'dummy_test_token'};
 const message={chatId:'12345',text:'Test'};
 try{
  for(const payload of [{},{ok:true},{ok:false,result:{message_id:9}},{ok:true,result:{}},{ok:true,result:{message_id:0}},{ok:true,result:{message_id:'9'}}]){
   globalThis.fetch=async()=>new Response(JSON.stringify(payload),{status:200,headers:{'content-type':'application/json'}});
   await assert.rejects(sendTelegram(conf,message),/remote_missing_receipt|remote_api_failed/);
  }
  globalThis.fetch=async()=>new Response(JSON.stringify({ok:true,result:{message_id:9}}),{status:200,headers:{'content-type':'application/json'}});
  await assert.doesNotReject(sendTelegram(conf,message));
 }finally{globalThis.fetch=original;}
});
