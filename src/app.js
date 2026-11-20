import {createServer} from 'node:http';
import {createHash,randomUUID,randomInt,timingSafeEqual} from 'node:crypto';
import {readFileSync,existsSync} from 'node:fs';
import {join,extname} from 'node:path';
import {openStore,consumeLimit} from './store.js';
import {sendEmail,sendTelegram} from './channels.js';

const CATEGORIES=['support','gratitude','mindfulness','reframe','inspiration','mood'];
const EMAIL_RE=/^[^\s@<>]{1,64}@[^\s@<>]{1,190}\.[^\s@<>]{2,}$/;
const hash=v=>createHash('sha256').update(v).digest('hex');
function equal(a,b) {
 if(typeof a!=='string'||typeof b!=='string')return false;
 const x=Buffer.from(a),y=Buffer.from(b);
 return x.length===y.length&&timingSafeEqual(x,y);
}
const time=()=>Date.now();

export function createApp(options={}) {
 const config={
  dbPath:options.dbPath||process.env.DB_PATH||'./data/good-thoughts.sqlite',
  resendKey:options.resendKey??process.env.RESEND_API_KEY??'',
  mailFrom:options.mailFrom??process.env.MAIL_FROM??'',
  telegramToken:options.telegramToken??process.env.TELEGRAM_BOT_TOKEN??'',
  telegramSecret:options.telegramSecret??process.env.TELEGRAM_WEBHOOK_SECRET??'',
  adminToken:options.adminToken??process.env.ADMIN_TOKEN??''
 };
 const db=openStore(config.dbPath);
 const emailSender=options.emailSender||((message)=>sendEmail(config,message));
 const telegramSender=options.telegramSender||((message)=>sendTelegram(config,message));
 const ipHash=v=>hash(v+':'+config.adminToken);
 function ownerNotification(id,kind) {
  db.prepare("INSERT INTO owner_notifications(id,request_id,kind,created_at) VALUES(?,?,?,?)").run(randomUUID(),id,kind,time());
 }
 const mailEnabled=()=>Boolean(options.emailSender||(config.resendKey&&config.mailFrom));
 const telegramEnabled=()=>Boolean(config.telegramToken&&config.telegramSecret);
 const json=(res,status,body)=>{
  res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',
    'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});
  res.end(JSON.stringify(body));
 };
 async function body(req){
  let size=0,parts=[];
  for await(const chunk of req){size+=chunk.length;if(size>8000)throw Object.assign(Error('large'),{status:413});parts.push(chunk);}
  try{return JSON.parse(Buffer.concat(parts).toString('utf8'));}
  catch{throw Object.assign(Error('json'),{status:400});}
 }
 async function handle(req,res){
  const path=(req.url||'/').split('?')[0],method=req.method;
  const ip=req.socket.remoteAddress==='127.0.0.1'
    ?(typeof req.headers['x-real-ip']==='string'?req.headers['x-real-ip']:'loopback')
    :(req.socket.remoteAddress||'unknown');
  if(method==='GET'&&path==='/api/health')return json(res,200,{
    status:'ok',service:'good-thoughts',version:2,approvalRequired:true,
    emailEnabled:mailEnabled()&&Boolean(config.resendKey&&config.mailFrom),
    telegramEnabled:telegramEnabled()});
  if(method==='GET'&&path==='/api/categories')return json(res,200,{categories:CATEGORIES});
  if(method==='POST'&&path==='/api/requests'){
    if(!mailEnabled())return json(res,503,{message:'Подтверждение по email пока не подключено.'});
    const b=await body(req);
    const email=typeof b?.email==='string'?b.email.trim().toLowerCase():'';
    const question=typeof b?.question==='string'?b.question.trim():'';
    const category=typeof b?.category==='string'?b.category:'support';
    if(!EMAIL_RE.test(email)||!CATEGORIES.includes(category)||question.length<5||question.length>1500)
      return json(res,400,{message:'Проверьте email и вопрос (5–1500 символов).'});
    const t=time();
    if(!consumeLimit(db,ipHash('ip:'+ip),6,3600000,t)||
       !consumeLimit(db,ipHash('email:'+email),5,86400000,t))
      return json(res,429,{message:'Слишком много обращений. Попробуйте позже.'});
    const id=randomUUID(),code=String(randomInt(0,1000000)).padStart(6,'0');
    db.prepare('INSERT INTO requests(id,channel,category,question,email,status,code_hash,code_expires,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)')
     .run(id,'email',category,question,email,'pending_verification',hash(id+':'+code+':'+config.adminToken),t+600000,t,t);
    try{
      await emailSender({to:email,subject:'Код подтверждения — Фабрика добрых мыслей',
       text:'Ваш шестизначный код: '+code+'\nДействует 10 минут. Если это были не вы, просто проигнорируйте письмо.'});
    }catch(err){
      db.prepare("DELETE FROM requests WHERE id=? AND status='pending_verification'").run(id);
      return json(res,503,{message:'Не удалось отправить код. Обращение не принято.'});
    }
    return json(res,202,{requestId:id,message:'Код отправлен. Подтвердите email, чтобы ваш вопрос попал в очередь.'});
  }
  if(method==='POST'&&path==='/api/verify'){
    const b=await body(req);
    if(typeof b?.requestId!=='string'||typeof b?.code!=='string'||!/^\d{6}$/.test(b.code))
      return json(res,400,{message:'Введите шестизначный код.'});
    const r=db.prepare('SELECT * FROM requests WHERE id=?').get(b.requestId);
    if(!r||r.channel!=='email'||r.status!=='pending_verification')
      return json(res,400,{message:'Обращение не найдено или уже подтверждено.'});
    if(r.attempts>=5)return json(res,429,{message:'Слишком много попыток.'});
    if(r.code_expires<time()){
      db.prepare("UPDATE requests SET status='expired',code_hash=NULL,updated_at=? WHERE id=?").run(time(),r.id);
      return json(res,410,{message:'Код истёк. Отправьте вопрос ещё раз.'});
    }
    if(!equal(r.code_hash,hash(r.id+':'+b.code+':'+config.adminToken))){
      db.prepare('UPDATE requests SET attempts=attempts+1,updated_at=? WHERE id=?').run(time(),r.id);
      return json(res,400,{message:'Неверный код.'});
    }
    db.prepare("UPDATE requests SET status='queued',code_hash=NULL,code_expires=NULL,queued_at=?,updated_at=? WHERE id=?").run(time(),time(),r.id);
    ownerNotification(r.id,'new_question');
    return json(res,200,{message:'Вопрос подтверждён. Подготовим ответ и отправим после проверки.'});
  }
  if(method==='POST'&&path==='/api/telegram/webhook'){
    if(!telegramEnabled())return json(res,503,{message:'Telegram disabled'});
    if(!equal(req.headers['x-telegram-bot-api-secret-token'],config.telegramSecret))
      return json(res,403,{message:'Forbidden'});
    const b=await body(req);
    if(!Number.isSafeInteger(b?.update_id))return json(res,400,{message:'Invalid update'});
    if(db.prepare('SELECT 1 FROM telegram_updates WHERE update_id=?').get(b.update_id))
      return json(res,200,{ok:true,duplicate:true});
    db.prepare('INSERT INTO telegram_updates(update_id,received_at) VALUES(?,?)').run(b.update_id,time());
    const m=b.message;
    if(!m||m.chat?.type!=='private'||!Number.isSafeInteger(m.chat.id)||typeof m.text!=='string')
      return json(res,200,{ok:true});
    const chatId=String(m.chat.id),text=m.text.trim();
    if(/^\/(?:start|help)(?:\s|$)/.test(text)){
      try{await telegramSender({chatId,text:'Добро пожаловать в Фабрику добрых мыслей 🌿\nНапишите, что вас волнует. Можно использовать команды /gratitude, /mindfulness, /reframe, /inspiration, /mood.'});}catch{}
      return json(res,200,{ok:true});
    }
    if(text.length<5||text.length>1500){
      try{await telegramSender({chatId,text:'Напишите вопрос от 5 до 1500 символов.'});}catch{}
      return json(res,200,{ok:true});
    }
    if(!consumeLimit(db,ipHash('chat:'+chatId),5,3600000,time())){
      try{await telegramSender({chatId,text:'Пожалуйста, отправьте следующий вопрос позже.'});}catch{}
      return json(res,200,{ok:true});
    }
    const commands={'/gratitude':'gratitude','/mindfulness':'mindfulness','/reframe':'reframe',
      '/inspiration':'inspiration','/mood':'mood'};
    const first=text.split(' ')[0],category=commands[first]||'support';
    const question=category==='support'?text:(text.slice(first.length).trim()||'Помоги мне с практикой: '+category);
    const id=randomUUID(),t=time();
    db.prepare('INSERT INTO requests(id,channel,category,question,chat_id,status,created_at,queued_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)')
      .run(id,'telegram',category,question,chatId,'queued',t,t,t);
    ownerNotification(id,'new_question');
    try{await telegramSender({chatId,text:'Спасибо! Вопрос принят 🌿 Подготовим ответ и отправим после проверки.'});}catch{}
    return json(res,200,{ok:true});
  }
  if(path.startsWith('/api/internal/')){
    if(config.adminToken.length<20||!equal(req.headers.authorization,'Bearer '+config.adminToken))
      return json(res,401,{message:'Unauthorized'});
    if(method==='GET'&&path==='/api/internal/summary'){
      return json(res,200,{counts:db.prepare('SELECT status,COUNT(*) AS count FROM requests GROUP BY status').all()});
    }
    if(method==='GET'&&path==='/api/internal/pending'){
      const requests=db.prepare("SELECT id,channel,category,question,created_at,queued_at FROM requests WHERE status='queued' ORDER BY queued_at LIMIT 20").all();
      const approvals=db.prepare("SELECT id,channel,category,question,answer,draft_version,draft_updated_at,status FROM requests WHERE status IN ('awaiting_approval','revision_requested') ORDER BY draft_updated_at LIMIT 20").all();
      const failures=db.prepare("SELECT id,channel,delivery_error FROM requests WHERE status='delivery_failed' ORDER BY updated_at LIMIT 20").all();
      return json(res,200,{requests,awaitingApproval:approvals,failedDeliveries:failures});
    }
    if(method==='GET'&&path==='/api/internal/notifications'){
      return json(res,200,{notifications:db.prepare("SELECT id,kind,request_id,created_at FROM owner_notifications WHERE status='pending' ORDER BY created_at LIMIT 20").all()});
    }
    if(method==='POST'&&path==='/api/internal/notification-sent'){
      const b=await body(req);
      if(typeof b?.id!=='string'||!Number.isSafeInteger(b?.issueNumber)||b.issueNumber<=0)
        return json(res,400,{message:'Invalid receipt'});
      const changed=db.prepare("UPDATE owner_notifications SET status='sent',issue_number=?,sent_at=? WHERE id=? AND status='pending'").run(b.issueNumber,time(),b.id);
      if(!changed.changes)return json(res,409,{message:'Already recorded or unknown'});
      return json(res,200,{status:'recorded'});
    }
    if(method==='POST'&&path==='/api/internal/draft'){
      const b=await body(req);
      if(typeof b?.id!=='string'||typeof b?.answer!=='string'||b.answer.trim().length<10||b.answer.length>3900)
        return json(res,400,{message:'Invalid draft'});
      const changed=db.prepare("UPDATE requests SET status='awaiting_approval',answer=?,draft_version=draft_version+1,approved_at=NULL,approved_by=NULL,approved_version=NULL,draft_updated_at=?,updated_at=? WHERE id=? AND status IN ('queued','revision_requested','awaiting_approval')").run(b.answer.trim(),time(),time(),b.id);
      if(!changed.changes)return json(res,409,{message:'Not eligible for drafting'});
      const row=db.prepare('SELECT id,draft_version FROM requests WHERE id=?').get(b.id);
      ownerNotification(b.id,'draft_v'+row.draft_version);
      return json(res,200,{id:row.id,status:'awaiting_approval',draftVersion:row.draft_version,message:'Черновик сохранён. Отправка запрещена до одобрения владельца.'});
    }
    if(method==='POST'&&path==='/api/internal/approve'){
      const b=await body(req);
      if(typeof b?.id!=='string'||!Number.isSafeInteger(b.version)||!['approve','revise'].includes(b.decision))
        return json(res,400,{message:'Invalid decision'});
      const newStatus=b.decision==='approve'?'approved':'revision_requested';
      const changed=db.prepare("UPDATE requests SET status=?,approved_version=?,approved_by=?,approved_at=?,updated_at=? WHERE id=? AND status='awaiting_approval' AND draft_version=? AND answer IS NOT NULL")
       .run(newStatus,b.decision==='approve'?b.version:null,b.decision==='approve'?'owner':null,b.decision==='approve'?time():null,time(),b.id,b.version);
      if(!changed.changes)return json(res,409,{message:'Draft changed or decision already recorded'});
      return json(res,200,{id:b.id,status:newStatus,draftVersion:b.version});
    }
    if(method==='POST'&&path==='/api/internal/answer'){
      return json(res,410,{message:'Direct delivery was disabled. Use /draft, /approve and /deliver.'});
    }
    if(method==='POST'&&path==='/api/internal/deliver'){
      const b=await body(req);
      if(typeof b?.id!=='string'||!Number.isSafeInteger(b.version))
        return json(res,400,{message:'Invalid delivery request'});
      // Explicit owner approval on the exact immutable draft version is mandatory.
      const claimed=db.prepare("UPDATE requests SET status='processing',updated_at=? WHERE id=? AND status='approved' AND approved_by='owner' AND approved_version=? AND draft_version=? AND approved_at IS NOT NULL AND answer IS NOT NULL")
       .run(time(),b.id,b.version,b.version);
      if(!claimed.changes)return json(res,409,{message:'Not approved for this draft version'});
      const r=db.prepare('SELECT * FROM requests WHERE id=?').get(b.id);
      try {
        if(r.channel==='email')await emailSender({to:r.email,subject:'Ваш ответ — Фабрика добрых мыслей',text:r.answer+'\n\nС заботой, Фабрика добрых мыслей'});
        else await telegramSender({chatId:r.chat_id,text:r.answer});
        db.prepare("UPDATE requests SET status='delivered',delivered_at=?,delivery_error=NULL,updated_at=? WHERE id=?").run(time(),time(),r.id);
        db.prepare("INSERT INTO deliveries(request_id,channel,state,attempted_at) VALUES(?,?,?,?)").run(r.id,r.channel,'delivered',time());
        return json(res,200,{id:r.id,status:'delivered'});
      }catch(err){
        const error=String(err?.message||'delivery_failed').replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,60);
        // Ambiguous remote timeout is NOT proof of non-delivery. Never automatic retry.
        db.prepare("UPDATE requests SET status='delivery_failed',delivery_error=?,updated_at=? WHERE id=?").run(error,time(),r.id);
        db.prepare("INSERT INTO deliveries(request_id,channel,state,attempted_at,error_code) VALUES(?,?,?,?,?)").run(r.id,r.channel,'failed',time(),error);
        return json(res,502,{id:r.id,status:'delivery_failed',message:'Доставка не подтверждена. Нужна ручная сверка до повторной отправки.'});
      }
    }
    return json(res,404,{message:'Unknown admin route'});
  }
  if((method==='GET'||method==='HEAD')&&!path.startsWith('/api/')){
    const isAsset=/^\/assets\/[A-Za-z0-9_.-]+$/.test(path);
    const isBrandAsset=path==='/dm-logo.png'||path==='/dm-icon.png';
    const file=(isAsset||isBrandAsset)?join(process.cwd(),'dist',path):join(process.cwd(),'dist','index.html');
    if(!existsSync(file))return json(res,404,{message:'Frontend not built'});
    const ext=extname(file),contentType={'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png'}[ext]||'application/octet-stream';
    res.writeHead(200,{'Content-Type':contentType+'; charset=utf-8','X-Content-Type-Options':'nosniff',
      'Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; img-src 'self' data:; connect-src 'self'; script-src 'self'; style-src 'self'; base-uri 'none'; frame-ancestors 'none'"});
    return method==='HEAD'?res.end():res.end(readFileSync(file));
  }
  return json(res,404,{message:'Not found'});
 }
 const server=createServer((req,res)=>Promise.resolve().then(()=>handle(req,res)).catch(err=>{
  const status=err?.status||500;
  if(!res.headersSent)json(res,status,{message:status===413?'Слишком большой запрос.':'Ошибка запроса. Попробуйте позже.'});
  else res.end();
  if(status===500)console.error('good_thoughts_request_error',err?.name||'Error');
 }));
 return {db,server,close:()=>new Promise(ok=>server.close(()=>{db.close();ok();}))};
}
