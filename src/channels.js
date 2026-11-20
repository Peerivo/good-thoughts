async function request(url,headers,payload,{requireId=false,requireTelegramReceipt=false}={}) {
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),8000);
 try{
  const result=await fetch(url,{method:'POST',headers,body:JSON.stringify(payload),signal:controller.signal});
  if(!result.ok)throw Error('remote_http_'+result.status);
  const data=await result.json();
  if(data?.ok===false)throw Error('remote_api_failed');
  if(requireId&&(typeof data?.id!=='string'||!data.id.trim()))throw Error('remote_missing_receipt');
  if(requireTelegramReceipt&&(data?.ok!==true||!Number.isSafeInteger(data?.result?.message_id)||data.result.message_id<=0))throw Error('remote_missing_receipt');
 }finally{clearTimeout(timer);}
}
export async function sendEmail(conf,{to,subject,text}) {
 if(!conf.resendKey||!conf.mailFrom)throw Error('email_unconfigured');
 return request('https://api.resend.com/emails',
  {'Authorization':'Bearer '+conf.resendKey,'Content-Type':'application/json'},
  {from:conf.mailFrom,to,subject,text},{requireId:true});
}
export async function sendTelegram(conf,{chatId,text}) {
 if(!conf.telegramToken)throw Error('telegram_unconfigured');
 return request('https://api.telegram.org/bot'+conf.telegramToken+'/sendMessage',
  {'Content-Type':'application/json'}, {chat_id:chatId,text},{requireTelegramReceipt:true});
}
