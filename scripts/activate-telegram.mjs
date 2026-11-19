import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

export const BOT_USERNAME='DobryeMysliFactoryBot';
export const WEBHOOK_URL='https://dobro.peerivo.net/api/telegram/webhook';
const COMMANDS=[
 {command:'start',description:'Начать общение'},
 {command:'help',description:'Как задать вопрос'},
 {command:'gratitude',description:'Практика благодарности'},
 {command:'mindfulness',description:'Осознанность'},
 {command:'reframe',description:'Посмотреть на ситуацию иначе'},
 {command:'inspiration',description:'Вдохновение'},
 {command:'mood',description:'Поддержка настроения'}
];
function parseEnv(contents){
 const env={};
 for(const row of contents.split(/\r?\n/)){
  const match=row.match(/^\s*([A-Z][A-Z_0-9]*)=(.*)\s*$/);
  if(!match)continue;
  let value=match[2].trim();
  if((value.startsWith('"')&&value.endsWith('"'))||(value.startsWith("'")&&value.endsWith("'")))value=value.slice(1,-1);
  env[match[1]]=value;
 }
 return env;
}
export function loadConfig(file='/etc/peerivo/good-thoughts.env'){
 // Secrets may be provisioned via systemd EnvironmentFile or a root-only local file.
 const fromFile=parseEnv(readFileSync(file,'utf8'));
 return {
  token:process.env.TELEGRAM_BOT_TOKEN||fromFile.TELEGRAM_BOT_TOKEN,
  secret:process.env.TELEGRAM_WEBHOOK_SECRET||fromFile.TELEGRAM_WEBHOOK_SECRET
 };
}
export function validateConfig({token,secret}){
 if(typeof token!=='string'||!(/^\d{5,16}:[A-Za-z0-9_-]{30,}$/.test(token))){
  throw new Error('Telegram bot token is missing or invalid; do not put it in GitHub or chat.');
 }
 if(typeof secret!=='string'||!(/^[A-Za-z0-9_-]{32,128}$/.test(secret))){
  throw new Error('Telegram webhook secret must be a random 32–128-character value.');
 }
}
export async function activate(config,request=fetch){
 validateConfig(config);
 const endpoint='https://api.telegram.org/bot'+config.token+'/';
 async function call(method,payload){
  const ctrl=new AbortController();
  const timeout=setTimeout(()=>ctrl.abort(),9000);
  try{
   const response=await request(endpoint+method,{method:'POST',headers:{'content-type':'application/json'},
     body:JSON.stringify(payload),signal:ctrl.signal});
   if(!response.ok)throw Error('Telegram API unavailable: '+method+' HTTP '+response.status);
   const result=await response.json();
   if(!result.ok)throw Error('Telegram API refused request: '+method);
   return result.result;
  }finally{clearTimeout(timeout);}
 }
 const me=await call('getMe',{});
 if(me?.username?.toLowerCase()!==BOT_USERNAME.toLowerCase()){
  throw Error('Unexpected Telegram bot identity; refusing webhook registration.');
 }
 await call('setMyCommands',{commands:COMMANDS});
 await call('setWebhook',{url:WEBHOOK_URL,secret_token:config.secret,
   allowed_updates:['message'],drop_pending_updates:false,max_connections:8});
 const info=await call('getWebhookInfo',{});
 if(info?.url!==WEBHOOK_URL)throw Error('Webhook verification failed');
 return {ok:true,bot:'@'+BOT_USERNAME,webhook:WEBHOOK_URL,commands:COMMANDS.length};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  const file=process.env.GOOD_THOUGHTS_ENV_FILE||'/etc/peerivo/good-thoughts.env';
  const result=await activate(loadConfig(file));
  console.log('Telegram webhook and commands configured:',result.bot,result.webhook);
 }catch(error){
  console.error('Telegram activation blocked:',error.message);
  process.exitCode=1;
 }
}
