import React,{useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import './style.css';

const choices=[
 {id:'support',icon:'♡',title:'Поддержка',desc:'Когда хочется быть услышанным'},
 {id:'gratitude',icon:'✦',title:'Благодарность',desc:'Замечать хорошее в обычном'},
 {id:'mindfulness',icon:'◌',title:'Осознанность',desc:'Вернуться в настоящий момент'},
 {id:'reframe',icon:'↗',title:'Новый взгляд',desc:'Мягко переосмыслить трудности'},
 {id:'inspiration',icon:'☼',title:'Вдохновение',desc:'Найти силы продолжать'},
 {id:'mood',icon:'☘',title:'Тепло для души',desc:'Немного света в сложный день'}
];
const okJson=async(path, data)=>{
 const res=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
 const result=await res.json();
 if(!res.ok) throw Error(result.message||'Не удалось выполнить запрос.');
 return result;
};
function Logo(){
 return <img className="logo-mark" src="/dm-logo.png?source=owner-20261119" alt="ДМ — Фабрика добрых мыслей" width="108" height="61" />;
}
function App(){
 const [category,setCategory]=useState('support');
 const [question,setQuestion]=useState('');
 const [email,setEmail]=useState('');
 const [verifiedEmail,setVerifiedEmail]=useState(null);
 const emailRemembered=Boolean(verifiedEmail&&email.trim().toLowerCase()===verifiedEmail);
 const [code,setCode]=useState('');
 const [requestId,setRequestId]=useState('');
 const [phase,setPhase]=useState('write');
 const [loading,setLoading]=useState(false);
 const [error,setError]=useState('');
 const [agreed,setAgreed]=useState(false);
 const [channels,setChannels]=useState({emailEnabled:false,telegramEnabled:false,checking:true});
 useEffect(()=>{
  let active=true;
  fetch('/api/health',{cache:'no-store'}).then(async response=>{
   if(!response.ok)throw Error('offline');
   const data=await response.json();
   if(active)setChannels({
    emailEnabled:data.emailEnabled===true,
    telegramEnabled:data.telegramEnabled===true,
    checking:false
   });
  }).catch(()=>{if(active)setChannels({emailEnabled:false,telegramEnabled:false,checking:false});});
  fetch('/api/email-session',{cache:'no-store'}).then(async response=>{
   if(!response.ok)return;
   const data=await response.json();
   if(active&&typeof data.verifiedEmail==='string'){setVerifiedEmail(data.verifiedEmail);setEmail(prev=>prev||data.verifiedEmail);}
  }).catch(()=>{});
  return ()=>{active=false;};
 },[]);
 const submit=async(e)=>{
  e.preventDefault();setError('');setLoading(true);
  try{
   const result=await okJson('/api/requests',{category,question,email});
   setRequestId(result.requestId);
   if(result.requiresVerification===false){setVerifiedEmail(email.trim().toLowerCase());setPhase('done');}
   else {if(emailRemembered)setVerifiedEmail(null);setPhase('verify');}
  }catch(err){setError(err.message);}finally{setLoading(false);}
 };
 const verify=async(e)=>{
  e.preventDefault();setError('');setLoading(true);
  try{const result=await okJson('/api/verify',{requestId,code});setVerifiedEmail(result.verifiedEmail||email.trim().toLowerCase());setPhase('done');}
  catch(err){setError(err.message);}finally{setLoading(false);}
 };
 const forgetEmail=async()=>{
  setError('');setLoading(true);
  try{await okJson('/api/email-session/forget',{});setVerifiedEmail(null);setEmail('');}
  catch(err){setError(err.message);}finally{setLoading(false);}
 };
 return <div className="site">
  <header className="top"><div className="brand"><Logo/><span><b>Фабрика</b><small>добрых мыслей</small></span></div>
   <nav className="site-nav" aria-label="Навигация"><a href="https://peerivo.net/">← На главную Peerivo.net</a></nav></header>
  <main>
   <section className="hero">
    <span className="eyebrow">✦ ДОБРО НАЧИНАЕТСЯ С МЫСЛИ</span>
    <h1>Иногда всё начинается<br/>с одной <em>доброй мысли.</em></h1>
    <p className="lead">Расскажите, что у вас на душе. Здесь можно попросить поддержку, вдохновение или просто найти новый взгляд на привычное.</p>
    <div className="hero-bottom"><span className="sun">☼</span><span>Без оценок. Без спешки. С уважением к вам.</span></div>
   </section>
   <section className="form-card" id="ask">
    {!channels.checking&&!channels.emailEnabled&&<div className="service-notice" role="status"><b>Приём вопросов с сайта пока готовится.</b><p>Настраиваем подтверждение email и доставку ответов. Просмотреть направления поддержки можно уже сейчас, но отправка формы временно выключена.</p></div>}
    {!channels.checking&&<div className="bot-notice" role="status">
      {channels.telegramEnabled
       ? <><b>Telegram-бот подключён:</b> <a href="https://t.me/DobryeMysliFactoryBot" target="_blank" rel="noopener noreferrer">@DobryeMysliFactoryBot</a></>
       : <><b>Наш Telegram-бот:</b> @DobryeMysliFactoryBot (подключаем)</>}
    </div>}
    {phase==='write'&&<form onSubmit={submit}>
     <span className="eyebrow">01 / ВЫБЕРИТЕ НАПРАВЛЕНИЕ</span>
     <h2>Чем мы можем помочь?</h2>
     <div className="categories">{choices.map(ch=><button type="button" key={ch.id} className={'choice '+(category===ch.id?'selected':'')} aria-pressed={category===ch.id} onClick={()=>setCategory(ch.id)}>
      <span className="choice-icon">{ch.icon}</span><span><b>{ch.title}</b><small>{ch.desc}</small></span></button>)}</div>
     <div className="form-line"><span className="eyebrow">02 / ВАШИ СЛОВА</span><label htmlFor="question">О чём вам хочется поговорить?</label>
      <textarea id="question" minLength="5" maxLength="1500" required value={question} onChange={e=>setQuestion(e.target.value)} placeholder="Например: сегодня мне тревожно перед важным разговором..." rows="5"/></div>
     <div className="form-line"><span className="eyebrow">03 / КУДА ОТВЕТИТЬ</span><label htmlFor="email">Ваш email</label>
      <input id="email" type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com"/>
      <span className="hint">{emailRemembered?'✓ Email уже подтверждён. Новый код не нужен.':'Подтвердите email шестизначным кодом один раз в этом браузере.'}</span>
      {verifiedEmail&&<button className="text-button" type="button" disabled={loading} onClick={forgetEmail}>Забыть подтверждённый email в этом браузере</button>}</div>
     <label className="consent"><input type="checkbox" checked={agreed} onChange={e=>setAgreed(e.target.checked)} required/> <span>Согласен(на) на обработку вопроса и email для получения ответа. Не указывайте конфиденциальные данные.</span></label>
     {error&&<div role="alert" className="error">{error}</div>}
     <button className="submit" type="submit" disabled={!agreed||loading||!channels.emailEnabled}>{loading?'Отправляем…':'Отправить добрую мысль'} <span aria-hidden="true">↗</span></button>
     <p className="hint under">После подтверждения подготовим ответ. Он придёт после проверки владельцем проекта; срок зависит от согласования.</p>
    </form>}
    {phase==='verify'&&<form onSubmit={verify} className="phase">
      <span className="eyebrow">ПОДТВЕРЖДЕНИЕ EMAIL</span><h2>Проверьте почту</h2>
      <p>Мы отправили на <b>{email}</b> шестизначный код. Он действителен 10 минут.</p>
      <label htmlFor="code">Код подтверждения</label><input id="code" inputMode="numeric" pattern="[0-9]{6}" minLength="6" maxLength="6" autoFocus required value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,'').slice(0,6))} placeholder="000000"/>
      {error&&<div role="alert" className="error">{error}</div>}
      <button className="submit" disabled={loading||code.length!==6}>{loading?'Проверяем…':'Подтвердить обращение'} <span>↗</span></button>
      <button className="text-button" type="button" onClick={()=>{setPhase('write');setCode('');setError('');}}>Изменить email или вопрос</button>
     </form>}
    {phase==='done'&&<div className="phase done" role="status"><span className="done-icon">✓</span><span className="eyebrow">ВОПРОС ПРИНЯТ</span><h2>Спасибо за доверие!</h2>
      <p>Ваш email подтверждён. Вопрос попал в очередь. Мы подготовим ответ и отправим его после проверки.</p>
      <button className="submit" onClick={()=>{setPhase('write');setQuestion('');setCode('');setRequestId('');}}>Задать ещё один вопрос ↗</button>
     </div>}
   </section>
   <section className="lower"><div><span className="eyebrow">НАШ ПОДХОД</span><h2>Чуть больше света<br/>в каждом дне.</h2></div>
    <p>Мы не обещаем чудес и не требуем улыбаться через силу. Иногда важнее просто быть услышанным и найти одну маленькую опору на сегодня.</p></section>
  </main>
  <footer><span>© Фабрика добрых мыслей · ДМ</span><span>Это пространство поддержки, а не экстренная или медицинская помощь.</span></footer>
 </div>;
}
createRoot(document.getElementById('root')).render(<App/>);
