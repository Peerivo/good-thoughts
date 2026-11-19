import React,{useState} from 'react';
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
 return <span className="logo-mark" aria-label="ДМ">
  <svg role="img" viewBox="0 0 84 84" xmlns="http://www.w3.org/2000/svg">
   <defs><linearGradient id="glow" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#f4ce7a"/><stop offset=".54" stopColor="#d990ac"/><stop offset="1" stopColor="#8b75d2"/></linearGradient></defs>
   <circle cx="42" cy="42" r="38" fill="#f9f0ec"/>
   <path d="M14 20 Q27 12 34 23 Q45 40 32 60 L10 60 L9 68 M19 28 L16 51 L26 51 Q36 41 29 30Z" fill="url(#glow)" stroke="#5b3e67" strokeWidth="2" strokeLinejoin="round"/>
   <path d="M39 60 L46 19 L57 44 L71 19 L77 60 L65 60 L63 43 L55 58 L49 43 L47 60Z" fill="url(#glow)" stroke="#5b3e67" strokeWidth="2" strokeLinejoin="round"/>
   <path d="M38 14 Q46 2 54 14" fill="none" stroke="#e4ad7b" strokeWidth="3" strokeLinecap="round"/>
  </svg>
 </span>;
}
function App(){
 const [category,setCategory]=useState('support');
 const [question,setQuestion]=useState('');
 const [email,setEmail]=useState('');
 const [code,setCode]=useState('');
 const [requestId,setRequestId]=useState('');
 const [phase,setPhase]=useState('write');
 const [loading,setLoading]=useState(false);
 const [error,setError]=useState('');
 const [agreed,setAgreed]=useState(false);
 const submit=async(e)=>{
  e.preventDefault();setError('');setLoading(true);
  try{
   const result=await okJson('/api/requests',{category,question,email});
   setRequestId(result.requestId);setPhase('verify');
  }catch(err){setError(err.message);}finally{setLoading(false);}
 };
 const verify=async(e)=>{
  e.preventDefault();setError('');setLoading(true);
  try{await okJson('/api/verify',{requestId,code});setPhase('done');}
  catch(err){setError(err.message);}finally{setLoading(false);}
 };
 return <div className="site">
  <header className="top"><div className="brand"><Logo/><span><b>Фабрика</b><small>добрых мыслей</small></span></div>
   <span className="pill">Место, где мысли становятся добрее</span></header>
  <main>
   <section className="hero">
    <span className="eyebrow">✦ ДОБРО НАЧИНАЕТСЯ С МЫСЛИ</span>
    <h1>Иногда всё начинается<br/>с одной <em>доброй мысли.</em></h1>
    <p className="lead">Расскажите, что у вас на душе. Здесь можно попросить поддержку, вдохновение или просто найти новый взгляд на привычное.</p>
    <div className="hero-bottom"><span className="sun">☼</span><span>Без оценок. Без спешки. С уважением к вам.</span></div>
   </section>
   <section className="form-card" id="ask">
    {phase==='write'&&<form onSubmit={submit}>
     <span className="eyebrow">01 / ВЫБЕРИТЕ НАПРАВЛЕНИЕ</span>
     <h2>Чем мы можем помочь?</h2>
     <div className="categories">{choices.map(ch=><button type="button" key={ch.id} className={'choice '+(category===ch.id?'selected':'')} aria-pressed={category===ch.id} onClick={()=>setCategory(ch.id)}>
      <span className="choice-icon">{ch.icon}</span><span><b>{ch.title}</b><small>{ch.desc}</small></span></button>)}</div>
     <div className="form-line"><span className="eyebrow">02 / ВАШИ СЛОВА</span><label htmlFor="question">О чём вам хочется поговорить?</label>
      <textarea id="question" minLength="5" maxLength="1500" required value={question} onChange={e=>setQuestion(e.target.value)} placeholder="Например: сегодня мне тревожно перед важным разговором..." rows="5"/></div>
     <div className="form-line"><span className="eyebrow">03 / КУДА ОТВЕТИТЬ</span><label htmlFor="email">Ваш email</label>
      <input id="email" type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com"/>
      <span className="hint">Отправим шестизначный код для подтверждения, а затем — ответ.</span></div>
     <label className="consent"><input type="checkbox" checked={agreed} onChange={e=>setAgreed(e.target.checked)} required/> <span>Согласен(на) на обработку вопроса и email для получения ответа. Не указывайте конфиденциальные данные.</span></label>
     {error&&<div role="alert" className="error">{error}</div>}
     <button className="submit" type="submit" disabled={!agreed||loading}>{loading?'Отправляем код…':'Отправить добрую мысль'} <span aria-hidden="true">↗</span></button>
     <p className="hint under">После подтверждения постараемся ответить в течение часа. Ответы приходят не мгновенно.</p>
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
      <p>Ваш email подтверждён. Вопрос попал в очередь, и мы постараемся ответить в течение часа.</p>
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
