import test from 'node:test';
import assert from 'node:assert/strict';
import {sendEmail} from '../src/channels.js';

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
