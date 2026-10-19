'use client';
import {useState,useEffect,useRef,useCallback} from 'react';
import {ArrowUpRight,ArrowRight,Plus,LogIn,Link2,Check,Copy,Users,Clock3,HelpCircle,X,Crown,Pencil,Send,LogOut,Sparkles,Download,RotateCcw,WifiOff,Loader2,BookOpen,Shuffle,Settings2} from 'lucide-react';
import {PACKS} from '../lib/words.js';
import {DrawEvent,renderDrawing} from '../lib/canvas';
import {Avatar,Balloon,BrandMark} from '../components/doodles';
import {DrawingBoard} from '../components/drawing-board';
import {RankedHub} from '../components/ranked-hub';
import {ChallengeHub} from '../components/challenge-hub';
type Player={id:string;name:string;avatar:number;score:number;online:boolean;color:string};
type History={roundId:string;word:string;drawerId:string;drawerName:string;guessed:string[];reason:string};
type State={code:string;revision:number;phase:'lobby'|'choose'|'drawing'|'submit'|'vote'|'reveal'|'finished';hostId:string;settings:{pack:string;seconds:number;cycles:number;mode?:string;customWords?:string[]};players:Player[];me:string;drawerId:string;turn:number;total:number;roundId:string;deadline:number;now:number;guessed:string[];word:string|null;hint:string;choices:string[];chat:{id:string;name:string;text:string;type:string;at:number}[];history:History[];bluffSubmitted:boolean;voted:boolean;privateHint:string|null;feedback:string|null;options:{id:string;text:string;mine:boolean;correct?:boolean;votes?:number;authors?:string[]}[]};
type Session={code:string;token:string;playerId:string};
type Result={error?:string;state?:State;events?:DrawEvent[];history?:History[];code?:string;token?:string;playerId?:string};
function savePNG(events:DrawEvent[],word:string){
 const canvas=document.createElement('canvas');canvas.width=1000;canvas.height=780;
 const art=document.createElement('canvas');art.width=1000;art.height=650;renderDrawing(art,events);
 const ctx=canvas.getContext('2d');if(!ctx)return;
 ctx.fillStyle='#f4f3ed';ctx.fillRect(0,0,1000,780);ctx.drawImage(art,0,0);
 ctx.fillStyle='#292c25';ctx.font='bold 34px sans-serif';ctx.fillText(word,40,709);
 ctx.fillStyle='#73786b';ctx.font='18px sans-serif';ctx.fillText('DRAW & GUESS  /  画里有话',40,751);
 const link=document.createElement('a');link.download='画里有话-'+word+'.png';link.href=canvas.toDataURL('image/png');link.click();
}
function MiniArt({events}:{events:DrawEvent[]}){const ref=useRef<HTMLCanvasElement>(null);useEffect(()=>{if(ref.current)renderDrawing(ref.current,events)},[events]);return <canvas ref={ref} width={1000} height={650} aria-label="本局画作"/>}
export default function Game(){
 const [view,setView]=useState<'ranked'|'friends'|'async'>('ranked'),[challengeId,setChallengeId]=useState('');
 const [name,setName]=useState(''),[avatar,setAvatar]=useState(0),[pack,setPack]=useState('everyday');
 const [roomMode,setRoomMode]=useState('classic');
 const [customDraft,setCustomDraft]=useState<string|null>(null);
 const [tab,setTab]=useState<'create'|'join'>('create'),[joinCode,setJoinCode]=useState('');
 const [session,setSession]=useState<Session|null>(null),[state,setState]=useState<State|null>(null);
 const [events,setEvents]=useState<DrawEvent[]>([]),[busy,setBusy]=useState(false),[ready,setReady]=useState(false);
 const [error,setError]=useState(''),[toast,setToast]=useState(''),[help,setHelp]=useState(false),[practice,setPractice]=useState(false);
 const [practiceEvents,setPracticeEvents]=useState<DrawEvent[]>([]),[guess,setGuess]=useState(''),[copied,setCopied]=useState(false),[online,setOnline]=useState(true);
 const [gallery,setGallery]=useState<{history:History[];events:DrawEvent[]}|null>(null),[galleryLoading,setGalleryLoading]=useState(false);
 const [clock,setClock]=useState(0),[offset,setOffset]=useState(0),[confirmLeave,setConfirmLeave]=useState(false);
 const current=useRef<State|null>(null),sess=useRef<Session|null>(null),cursor=useRef(0),round=useRef(''),revision=useRef(-1);
 const queued=useRef<DrawEvent[]>([]),drawingSend=useRef(false),chatBottom=useRef<HTMLDivElement>(null);
 const pollAbort=useRef<AbortController|null>(null),lastCorrect=useRef(0);
 current.current=state;sess.current=session;
 const notify=useCallback((message:string)=>setToast(message),[]);
 useEffect(()=>{if(!toast)return;const t=setTimeout(()=>setToast(''),3000);return()=>clearTimeout(t)},[toast]);
 useEffect(()=>{
  const room=new URLSearchParams(location.search).get('room')?.toUpperCase()||'';
  const challenge=new URLSearchParams(location.search).get('challenge')||'';
  if(/^[a-f0-9]{20}$/.test(challenge)){setChallengeId(challenge);setView('async');}
  setName(localStorage.getItem('dg-name')||'');setAvatar(Number(localStorage.getItem('dg-avatar')||0));
  if(/^[A-Z2-9]{6}$/.test(room)){setView('friends');setJoinCode(room);setTab('join');try{const stored=JSON.parse(sessionStorage.getItem('dg-session-'+room)||'null');if(stored?.token)setSession(stored)}catch{}}
  setClock(Date.now());setReady(true);
 },[]);
 useEffect(()=>{const t=setInterval(()=>setClock(Date.now()),250);return()=>clearInterval(t)},[]);
 useEffect(()=>{
  if(!help&&!practice&&!confirmLeave)return;
  const previous=document.activeElement as HTMLElement|null;
  const dialog=document.querySelector<HTMLElement>('[role="dialog"]');
  const selector='button:not(:disabled),input:not(:disabled),select:not(:disabled),[tabindex="0"]';
  dialog?.querySelector<HTMLElement>(selector)?.focus();
  const oldOverflow=document.body.style.overflow;document.body.style.overflow='hidden';
  const keyboard=(event:KeyboardEvent)=>{
   if(event.key==='Escape'){setHelp(false);setPractice(false);setConfirmLeave(false);}
   if(event.key==='Tab'&&dialog){
    const items=[...dialog.querySelectorAll<HTMLElement>(selector)];const first=items[0],last=items.at(-1);
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
   }
  };
  document.addEventListener('keydown',keyboard);
  return()=>{document.removeEventListener('keydown',keyboard);document.body.style.overflow=oldOverflow;previous?.focus();};
 },[help,practice,confirmLeave]);
 const apply=useCallback((next:State)=>{
  if(next.revision<revision.current)return;revision.current=next.revision;
  if(next.roundId!==round.current){round.current=next.roundId;cursor.current=0;queued.current=[];setEvents([]);setGuess('');}
  setOffset(next.now-Date.now());setState(next);
  if(next.guessed.length>lastCorrect.current&&next.phase!=='lobby')notify(next.guessed.includes(next.me)?'猜中了！你的默契值正在上升。':'有人猜中了，线索越来越清晰！');
  lastCorrect.current=next.guessed.length;
 },[notify]);
 const mergeEvents=useCallback((incoming:DrawEvent[])=>{
  if(!incoming.length)return;for(const event of incoming)if(event.seq)cursor.current=Math.max(cursor.current,event.seq);
  setEvents(previous=>{const map=new Map(previous.map(e=>[e.key,e]));for(const e of incoming)map.set(e.key,e);return [...map.values()]});
 },[]);
 const clearSession=useCallback(()=>{
  if(sess.current)sessionStorage.removeItem('dg-session-'+sess.current.code);
  pollAbort.current?.abort();sess.current=null;setSession(null);setState(null);setEvents([]);setGallery(null);revision.current=-1;round.current='';cursor.current=0;queued.current=[];
  history.replaceState(null,'',location.pathname);setConfirmLeave(false);setView('ranked');
 },[]);
 useEffect(()=>{
  if(!session)return;let cancelled=false,timer:ReturnType<typeof setTimeout>;
  const poll=async()=>{
   const controller=new AbortController();pollAbort.current=controller;const timeout=setTimeout(()=>controller.abort(),9000);
   try{
    const res=await fetch('/api/game?action=state&code='+session.code+'&cursor='+cursor.current+'&round='+round.current,{headers:{Authorization:'Bearer '+session.token},signal:controller.signal,cache:'no-store'});
    const data:Result=await res.json();if(cancelled)return;
    if(!res.ok){if(res.status===401||res.status===404){clearSession();setError(data.error||'房间已结束。');return;}throw new Error(data.error)}
    setOnline(true);if(data.state){apply(data.state);if(data.state.roundId===round.current)mergeEvents(data.events||[]);}
   }catch{if(!cancelled)setOnline(false);}
   finally{clearTimeout(timeout);if(!cancelled)timer=setTimeout(poll,650);}
  };
  poll();return()=>{cancelled=true;clearTimeout(timer);pollAbort.current?.abort();};
 },[session,apply,mergeEvents,clearSession]);
 useEffect(()=>{chatBottom.current?.scrollIntoView({behavior:'smooth',block:'nearest'});},[state?.chat.length]);
 useEffect(()=>{
  if(state?.phase!=='finished'||!session)return;let cancelled=false;setGalleryLoading(true);
  fetch('/api/game?action=gallery&code='+session.code,{headers:{Authorization:'Bearer '+session.token},cache:'no-store'}).then(async r=>{const d=await r.json() as {error?:string;history:History[];events:DrawEvent[]};if(!r.ok)throw new Error(d.error);if(!cancelled)setGallery(d);}).catch(()=>{if(!cancelled)notify('画作回顾暂时没有加载成功，刷新页面可以重试。');}).finally(()=>{if(!cancelled)setGalleryLoading(false)});
  return()=>{cancelled=true};
 },[state?.phase,session,notify]);
 async function api(action:string,extra:Record<string,unknown>={}){
  const res=await fetch('/api/game',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,...(sess.current||{}),...extra}),signal:AbortSignal.timeout(12000)});
  const data:Result=await res.json();if(!res.ok)throw new Error(data.error||'操作暂时没有成功。');return data;
 }
 async function action(type:string,extra:Record<string,unknown>={}){
  if(busy)return;setBusy(true);setError('');
  try{const data=await api(type,extra);if(type==='leave'){clearSession();return;}if(data.state)apply(data.state);if(type==='start'){setGallery(null);lastCorrect.current=0;}return data;}
  catch(e){notify(e instanceof Error?e.message:'请稍后再试。')}finally{setBusy(false);}
 }
 async function enter(){
  if(busy)return;
  if(!name.trim()){setError('先给自己取一个昵称吧。');document.getElementById('nickname')?.focus();return;}
  if(tab==='join'&&!/^[A-Z2-9]{6}$/.test(joinCode.toUpperCase())){setError('请输入 6 位房间码。');return;}
  setBusy(true);setError('');
  try{
   const data=await api(tab==='create'?'create':'join',{name:name.trim(),avatar,pack,mode:roomMode,...(tab==='join'?{code:joinCode.toUpperCase()}: {})});
   const s={code:data.code!,token:data.token!,playerId:data.playerId!};
   localStorage.setItem('dg-name',name.trim());localStorage.setItem('dg-avatar',String(avatar));sessionStorage.setItem('dg-session-'+s.code,JSON.stringify(s));
   revision.current=-1;round.current='';setSession(s);if(data.state)apply(data.state);history.replaceState(null,'','?room='+s.code);
  }catch(e){setError(e instanceof Error?e.message:'暂时没接上，请再试一次。');}finally{setBusy(false);}
 }
 async function invite(){
  const text=location.origin+location.pathname+'?room='+session?.code;
  try{await navigator.clipboard.writeText(text);setCopied(true);notify('邀请链接已复制，发给朋友就好。');setTimeout(()=>setCopied(false),2500);}
  catch{setToast('长按或选中房间码复制：'+session?.code);}
 }
 function onDrawing(incoming:DrawEvent[]){setEvents(previous=>[...previous,...incoming]);queued.current.push(...incoming);}
 useEffect(()=>{
  const timer=setInterval(async()=>{
   const s=sess.current,st=current.current;
   if(!s||!st||st.phase!=='drawing'||st.me!==st.drawerId||drawingSend.current||!queued.current.length)return;
   drawingSend.current=true;const batch=queued.current.splice(0,12),roundId=st.roundId;
   try{
    for(let attempt=0;attempt<3;attempt++){try{await api('draw',{events:batch,roundId});setOnline(true);break;}catch(e){if(current.current?.roundId!==roundId)break;if(attempt===2)throw e;}}
   }catch(e){setOnline(false);setEvents(prev=>prev.filter(event=>!batch.some(item=>item.key===event.key)));notify(e instanceof Error?e.message:'部分笔画未同步，请重新画这一笔。');}
   finally{drawingSend.current=false;}
  },160);return()=>clearInterval(timer);
 },[notify]);
 const remaining=state?Math.max(0,Math.ceil((state.deadline-(clock+offset))/1000)):0;
 const isHost=state?.me===state?.hostId,isDrawer=state?.me===state?.drawerId;
 const drawer=state?.players.find(p=>p.id===state.drawerId),guessed=state?.guessed.includes(state.me);
 const estimated=state?Math.ceil(state.players.length*(state.settings.seconds+12)*state.settings.cycles/60):4;
 const packInfo=PACKS.find(p=>p.id===(state?.settings.pack||pack))||PACKS[0];
 function navigate(next:'ranked'|'friends'|'async'){setView(next);setChallengeId('');setError('');history.replaceState(null,'',location.pathname);window.scrollTo({top:0,behavior:'smooth'});}
 return <main className={state?'app in-room':'app'}>
  <header className="site-header"><button className="brand" aria-label="画里有话首页" onClick={()=>state?setConfirmLeave(true):navigate('ranked')}><BrandMark/><span>画里有话<small>DRAW & GUESS</small></span></button>{!state&&!session&&<nav className="main-mode-nav" aria-label="游戏模式"><button className={view==='ranked'?'active':''} onClick={()=>navigate('ranked')}><Sparkles size={16}/><span>段位对战</span></button><button className={view==='async'?'active':''} onClick={()=>navigate('async')}><Link2 size={16}/><span>异步挑战</span></button><button className={view==='friends'?'active':''} onClick={()=>navigate('friends')}><Users size={16}/><span>好友房间</span></button></nav>}<div className="header-right">{state&&<span className={'connection '+(!online?'offline':'')}><span className="live-dot"/>{online?'已连接':'正在重新连接'}</span>}<button className="help-button" onClick={()=>setHelp(true)}><HelpCircle size={17}/><span>怎么玩</span></button>{state&&<button className="icon-button" title="离开房间" aria-label="离开房间" onClick={()=>setConfirmLeave(true)}><LogOut size={19}/></button>}</div></header>
  {!state&&!session&&view==='ranked'&&<RankedHub notify={notify} onFriends={(mode='classic')=>{setRoomMode(mode);navigate('friends')}} onAsync={()=>navigate('async')} onBrushes={()=>setPractice(true)}/>}
  {!state&&!session&&view==='async'&&<ChallengeHub id={challengeId} notify={notify} onHome={()=>navigate('ranked')}/>}
  {!state&&!session&&view==='friends'&&<div className="home">
   <section className="hero"><div className="hero-copy">
    <div className="eyebrow"><span className="tiny-star">✳</span> GOOD DRAWINGS. GREAT MISUNDERSTANDINGS.</div>
    <h1>画得离谱，<br/><span className="underline-word">猜得默契<svg viewBox="0 0 360 17" aria-hidden="true"><path d="M4 12C91 2 228 1 355 10" stroke="#c6e77c" strokeWidth="10" strokeLinecap="round"/></svg></span>。</h1>
    <p className="hero-description">把链接丢进群里，和朋友画一局。<br/>画技可以没有，想象力尽管放飞。</p>
    <div className="entry-form"><div className="home-mode-selector" role="group" aria-label="好友局玩法">{[['classic','经典画猜'],['bluff','假答案'],['three','三笔挑战']].map(([id,label])=><button key={id} className={roomMode===id?'selected':''} onClick={()=>setRoomMode(id)}>{label}</button>)}</div><div className="entry-tabs"><button className={tab==='create'?'active':''} onClick={()=>{setTab('create');setError('')}}><Plus size={17}/>开个房间</button><button className={tab==='join'?'active':''} onClick={()=>{setTab('join');setError('')}}><LogIn size={17}/>加入朋友</button></div>
     <form onSubmit={e=>{e.preventDefault();enter()}}><label htmlFor="nickname">先介绍一下你自己</label><div className="identity-row"><button type="button" className="avatar-picker" aria-label="更换头像" title="点击更换头像" onClick={()=>setAvatar((avatar+1)%8)}><Avatar index={avatar}/><span><Shuffle size={12}/></span></button><input id="nickname" placeholder="你的昵称" autoComplete="nickname" maxLength={16} value={name} onChange={e=>setName(e.target.value)}/></div>
     {tab==='join'&&<div className="code-input-wrap"><label htmlFor="room-code">朋友的房间码</label><input id="room-code" className="code-input" value={joinCode} placeholder="例如 AB3D5F" autoCapitalize="characters" maxLength={6} onChange={e=>setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z2-9]/g,''))}/></div>}
     {error&&<p className="form-error" role="alert">{error}</p>}
     <button className="primary enter-button" disabled={busy||!ready}>{busy?<Loader2 className="spin" size={20}/>:<>{tab==='create'?(roomMode==='bluff'?'创建假答案房间':roomMode==='three'?'创建三笔挑战房间':'创建经典房间'):'加入这个房间'}<ArrowUpRight size={22}/></>}</button><div className="entry-note"><span>免注册</span><i/><span>2–8 人</span><i/><span>电脑 · 手机都能玩</span></div></form>
    </div>
   </div><div className="hero-visual"><div className="demo-paper"><div className="paper-top"><span><span className="live-dot"/>一幅画，很多种理解</span><span>01 / 03</span></div><Balloon className="hero-balloon"/><span className="pencil-label"><Pencil size={16}/>想象力正在起飞</span><div className="demo-caption"><span>玩法示意</span><span>WHAT AM I?</span></div></div><div className="floating-note note-one">这个…是灯泡吧？<span className="note-dot blue"/></div><div className="floating-note note-two"><Check size={17}/>热气球！<span className="note-dot green"/></div><div className="sticker">画技？<br/>不重要。<svg width="55" height="21" viewBox="0 0 55 21" fill="none" aria-hidden="true"><path d="M4 3c11 19 31 19 47 1" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/></svg></div><button className="practice-button" onClick={()=>setPractice(true)}>先试试画笔 <ArrowRight size={16}/></button></div></section>
   <section className="packs-section"><div className="section-heading"><div><span className="eyebrow">PICK YOUR LITTLE WORLD</span><h2>今天，画点什么？</h2></div><span className="subtle">选个主题，房间里还能再改</span></div><div className="pack-grid">{PACKS.map((p,i)=><button key={p.id} className={'pack-card '+(pack===p.id?'active':'')} style={{'--pack-color':p.color} as React.CSSProperties} onClick={()=>setPack(p.id)} aria-pressed={pack===p.id}><div className="pack-symbol">{i===0?<Sparkles size={28}/>:i===1?<Pencil size={28}/>:<BookOpen size={28}/>}</div><div><h3>{p.name}<small>{p.count.toLocaleString()} 题</small></h3><p>{p.description}</p></div><span className="pack-check">{pack===p.id?<Check size={17}/>:<ArrowUpRight size={18}/>}</span></button>)}</div></section>
   <footer className="home-footer"><span>随手一画，也能成为今天的小快乐。</span><span>Made for your kind of people. <span className="tiny-star">✳</span></span></footer>
  </div>}
  {session&&!state&&<div className="loading-screen"><Loader2 className="spin" size={30}/><h2>正在回到你的房间</h2><p>{online?'马上就好，画笔准备中。':'连接有些慢，正在重新连接…'}</p><button className="text-button" onClick={clearSession}>返回首页</button></div>}
  {state&&<>
   {!online&&<div className="connection-banner" role="status"><WifiOff size={16}/>连接暂时中断，正在尝试恢复。未同步的笔画会提示重画。</div>}
   {state.phase==='lobby'?<section className="lobby">
    <div className="room-breadcrumb">YOUR LITTLE DRAWING CLUB <span>/</span> 私人房间</div>
    <div className="lobby-heading"><div><h1>人齐了，就开画。</h1><p>邀请朋友进来，让这张白纸热闹起来。</p></div><div className="room-code"><span>房间码</span><strong>{state.code}</strong><button onClick={invite} aria-label="复制房间邀请链接">{copied?<Check size={18}/>:<Copy size={18}/>}</button></div></div>
    <div className="lobby-grid"><div className="player-lounge"><div className="panel-title"><span><Users size={18}/>画家候场区</span><span>{state.players.filter(p=>p.online).length} / 8</span></div><div className="seat-grid">{Array.from({length:8},(_,i)=>{const p=state.players[i];return p?<div className={'seat '+(!p.online?'away':'')} key={p.id}><Avatar index={p.avatar}/><strong>{p.name}{p.id===state.me&&<small>你</small>}</strong><span className="seat-role">{p.id===state.hostId?<><Crown size={13}/>房主</>:p.online?<><span className="live-dot"/>已就位</>:'暂时离线'}</span>{isHost&&p.id!==state.me&&<button className="remove-player" title={'移出 '+p.name} aria-label={'移出 '+p.name} onClick={()=>action('kick',{playerId:p.id})}><X size={13}/></button>}</div>:<button key={'empty'+i} className="seat empty-seat" onClick={invite} aria-label="邀请一位朋友"><span className="empty-avatar"><Plus size={24}/></span><span>等一个朋友</span></button>})}</div><div className="invite-strip"><div><Link2 size={19}/><span>好朋友，点链接就能进来。</span></div><button className="secondary" onClick={invite}>{copied?<Check size={16}/>:<Copy size={16}/>} {copied?'已复制':'复制邀请链接'}</button></div></div>
    <aside className="room-settings"><div className="panel-title"><span><Settings2 size={18}/>这一局怎么画</span></div><label>玩法</label><div className="room-mode-picker">{[['classic','经典画猜','轮流画，一起猜'],['bluff','假答案','编假答案，骗到人也得分'],['three','三笔挑战','只能落笔三次，不能擦除']].map(([id,title,desc])=><button key={id} className={(state.settings.mode||'classic')===id?'selected':''} disabled={!isHost||busy} onClick={()=>action('settings',{...state.settings,mode:id})}><span><strong>{title}</strong><small>{desc}</small></span>{(state.settings.mode||'classic')===id&&<Check size={16}/>}</button>)}</div><label>词包</label><div className="room-pack-list">{PACKS.map(p=><button key={p.id} className={state.settings.pack===p.id?'selected':''} disabled={!isHost||busy} onClick={()=>action('settings',{...state.settings,pack:p.id})}><span className="pack-dot" style={{background:p.color}}/>{p.name}{state.settings.pack===p.id&&<Check size={16}/>}</button>)}</div><label>朋友的自定义词库</label><textarea className="custom-words-field" aria-label="自定义词库" value={customDraft??state.settings.customWords?.join('、')??''} placeholder="例如：宇航员、月球基地、太空早餐" maxLength={2500} disabled={!isHost||busy} onChange={e=>setCustomDraft(e.target.value)}/><p className="custom-words-note">用顿号、逗号或换行分开，3–100 个题目。清空并保存可恢复主题词包。</p>{isHost&&<button className="secondary" disabled={busy||customDraft===null} onClick={async()=>{const saved=await action('settings',{...state.settings,customWords:customDraft||''});if(saved)setCustomDraft(null)}}>保存自定义词库</button>}<label>每幅画的时间</label><div className="segments">{[30,40,60,90].map(n=><button key={n} className={state.settings.seconds===n?'selected':''} disabled={!isHost||busy} onClick={()=>action('settings',{...state.settings,seconds:n})}>{n}秒</button>)}</div><label>每人画几次</label><div className="segments">{[1,2].map(n=><button key={n} className={state.settings.cycles===n?'selected':''} disabled={!isHost||busy} onClick={()=>action('settings',{...state.settings,cycles:n})}>{n}次</button>)}</div><div className="game-estimate"><Clock3 size={16}/><span>预计 {estimated} 分钟 · {state.players.length*state.settings.cycles} 幅画</span></div><button className="primary" disabled={!isHost||state.players.filter(p=>p.online).length<(state.settings.mode==='bluff'?3:2)||busy} onClick={()=>action('start')}>{busy?<Loader2 size={18} className="spin"/>:isHost?<>开始画猜 <ArrowRight size={20}/></>:'等待房主开始'}</button><p className="settings-note">{state.players.filter(p=>p.online).length<(state.settings.mode==='bluff'?3:2)?(state.settings.mode==='bluff'?'假答案需要至少 3 位玩家。':'再来一位朋友，就能开始。'):isHost?(state.settings.mode==='bluff'?'猜中 +100，假答案每骗到一票 +70。':'画手和猜中者都能得分。'):'词包和时间由房主设置。'}</p></aside></div><div className="lobby-tip"><span className="tiny-star">✳</span>画得不像也没关系。最有趣的往往就是那一笔。</div>
   </section>:state.phase==='finished'?<section className="results">
    <div className="results-heading"><span className="eyebrow">THAT WAS A LITTLE MASTERPIECE</span><h1>这一局，很有画面。</h1><p>有些是神来之笔，有些是神级误会。</p></div><div className="podium">{[...state.players].sort((a,b)=>b.score-a.score).slice(0,3).map((p,i)=><div key={p.id} className={'winner rank-'+i}><span className="winner-place">{i===0?<Crown size={24}/>:'0'+(i+1)}</span><Avatar index={p.avatar}/><strong>{p.name}</strong><span>{p.score}<small> 分</small></span></div>)}</div><div className="result-actions"><button className="primary" onClick={()=>action('start')} disabled={!isHost||busy||state.players.filter(p=>p.online).length<(state.settings.mode==='bluff'?3:2)}><RotateCcw size={18}/>{isHost?'再画一局':'等待房主再开一局'}</button><button className="secondary" disabled={!isHost||busy} onClick={()=>action('lobby')}>返回房间设置</button><button className="text-button" onClick={invite}><Link2 size={16}/>叫上更多朋友</button></div>
    {state.players.length>3&&<div className="other-results">{[...state.players].sort((a,b)=>b.score-a.score).slice(3).map((p,i)=><span key={p.id}>{i+4}. {p.name} <b>{p.score}</b></span>)}</div>}
    <div className="section-heading gallery-heading"><div><span className="eyebrow">THE GALLERY OF GOOD TIMES</span><h2>把快乐留个底。</h2></div><span className="subtle">{state.history.length} 幅共同回忆</span></div>
    {galleryLoading?<div className="gallery-loading"><Loader2 className="spin" size={24}/>正在整理本局画作…</div>:<div className="gallery-grid">{(gallery?.history||[]).map((h,i)=>{const drawing=gallery?.events.filter(e=>e.roundId===h.roundId)||[];return <article className="gallery-card" key={h.roundId}><div className="gallery-image"><MiniArt events={drawing}/><span className="gallery-number">{String(i+1).padStart(2,'0')}</span></div><div className="gallery-info"><div><h3>{h.word}</h3><p>{h.drawerName} 的作品 · {h.guessed.length} 人猜中</p></div><button className="icon-button" aria-label={'保存 '+h.word} title="保存画作" onClick={()=>savePNG(drawing,h.word)}><Download size={18}/></button></div></article>})}</div>}
    {!galleryLoading&&state.history.length===0&&<p className="empty-gallery">这一局还没有完成的画作，邀请朋友再试一次吧。</p>}
   </section>:<section className="arena">
    <div className="arena-top"><div className="arena-round"><span className="eyebrow">ROUND {String(state.turn).padStart(2,'0')}</span><span>/ {state.total}</span><span className="arena-pack">{state.settings.mode==='bluff'?'假答案俱乐部':state.settings.mode==='three'?'三笔挑战':packInfo.name}</span></div><div className="secret-word"><span>{state.phase==='reveal'?'这一幅画的是':isDrawer?'你的题目':guessed?'你已经猜中了':'猜猜这是什么'}</span><strong>{state.phase==='choose'?'灵感加载中…':state.word||state.hint}</strong></div><div className={'countdown '+(remaining<=10&&state.phase==='drawing'?'urgent':'')}><Clock3 size={19}/><strong>{remaining}</strong><span>秒</span></div></div>
    <div className="arena-grid"><aside className="score-panel"><div className="panel-title"><span>本局画家</span><span>{state.players.length}</span></div><div className="score-list">{[...state.players].sort((a,b)=>b.score-a.score).map((p,i)=><div key={p.id} className={'score-player '+(p.id===state.drawerId?'drawing-now':'')+(!p.online?' away':'')}><span className="player-rank">{i+1}</span><Avatar index={p.avatar}/><div><strong>{p.name}{p.id===state.me&&<small>你</small>}</strong><span>{p.id===state.drawerId?<><Pencil size={12}/>正在画</>:state.guessed.includes(p.id)?'✓ 猜中了':!p.online?'暂时离线':'正在猜'}</span></div><b>{p.score}</b></div>)}</div><button className="text-button" onClick={invite}><Link2 size={15}/>房间 {state.code}</button></aside>
    <div className="center-stage"><div className="drawing-status"><span>{drawer&&<Avatar index={drawer.avatar}/>}<b>{drawer?.name||'画家'}</b>{state.phase==='choose'?'正在挑选灵感':state.phase==='reveal'?'完成了这幅作品':'正在画画'}</span><span>{state.phase==='drawing'?(isDrawer?'用画面表达，别写出答案哦。':'脑洞放大一点。'):'画得像不像，开心都一样。'}</span></div><div className="board-wrap"><DrawingBoard events={events} editable={isDrawer&&state.phase==='drawing'&&online} onEvents={onDrawing} roundId={state.roundId} maxStrokes={state.settings.mode==='three'?3:undefined}/>
     {state.phase==='choose'&&<div className="board-overlay"><div className="choice-content"><span className="overlay-spark">✳</span><h2>{isDrawer?'选一个，开始放飞。':'等一等，好戏就来。'}</h2><p>{isDrawer?'其他人看不到题目，靠你的画来猜。':(drawer?.name||'画家')+' 正在挑选要画的词。'}</p>{isDrawer?<div className="word-choices">{state.choices.map((word,i)=><button key={word} disabled={busy} onClick={()=>action('select',{index:i})}>{word}<ArrowUpRight size={18}/></button>)}</div>:<div className="waiting-dots"><i/><i/><i/></div>}<small>{remaining} 秒后自动选词</small></div></div>}
     {state.phase==='reveal'&&<div className="reveal-ribbon"><span>答案揭晓</span><strong>{state.word}</strong><span>{state.history.at(-1)?.guessed.length||0} 人猜中 · {remaining} 秒后继续</span></div>}
    </div><div className="reactions">{!isDrawer&&state.phase==='drawing'&&state.settings.mode!=='bluff'&&!guessed&&<button className="room-hint-button" disabled={!!state.privateHint} onClick={()=>action('hint')} title="提示扣 30 分">💡 提示 −30</button>}<span>给点回应</span>{['👏','😂','💡','❤️'].map(emoji=><button key={emoji} aria-label={'发送 '+emoji} onClick={()=>api('react',{emoji}).then(d=>{if(d.state)apply(d.state)}).catch(e=>notify(e.message))}>{emoji}</button>)}<span className="reaction-note">{isDrawer?'你的每一笔，都有观众。':guessed?'猜中了！给画家一点掌声吧。':'猜中越快，得分越高。'}</span></div></div>
    {state.settings.mode==='bluff'?<aside className="bluff-panel"><div className="panel-title"><span>脑洞伪装局</span><span>BLUFF</span></div><div className="bluff-stage-label"><span>{state.phase==='drawing'?'01 · 看画':state.phase==='submit'?'02 · 编答案':state.phase==='vote'?'03 · 投票':'04 · 揭晓'}</span><h3>{state.phase==='submit'?'编得像，才骗得到。':state.phase==='vote'?'哪一个才是真的？':state.phase==='reveal'?'谁的脑洞骗到了你？':'先看画，准备一个脑洞。'}</h3></div>
 {state.phase==='drawing'&&<p>{isDrawer?'画好了可以提前结束，大家就能开始编答案。':'先观察画面。等画家完成，再编一个可信的假答案。'}</p>}
 {state.phase==='drawing'&&isDrawer&&<button className="primary" disabled={busy} onClick={()=>action('finishDrawing')}>画好了，开始编答案 <ArrowRight size={17}/></button>}
 {state.phase==='submit'&&(isDrawer?<p>其他人正在编假答案。真正的题目先保密。</p>:state.bluffSubmitted?<div className="bluff-submitted"><Check size={22}/>你的假答案已经混入现场，等待其他玩家。</div>:<form onSubmit={e=>{e.preventDefault();if(!guess.trim())return;const text=guess;setGuess('');action('bluff',{text})}}><label htmlFor="fake-answer">让朋友信以为真</label><input id="fake-answer" maxLength={48} value={guess} placeholder="这幅画可能是…" onChange={e=>setGuess(e.target.value)}/><button className="primary" disabled={busy||!guess.trim()}>提交假答案 <Send size={17}/></button></form>)}
 {(state.phase==='vote'||state.phase==='reveal')&&<div className="bluff-options">{state.options.map((o,i)=><button key={o.id} className={(o.correct?'correct ':'')+(o.mine?'mine':'')} disabled={busy||isDrawer||state.voted||o.mine||state.phase!=='vote'} onClick={()=>action('vote',{optionId:o.id})}><span>{String.fromCharCode(65+i)}</span><strong>{o.text}</strong>{state.phase==='reveal'?<small>{o.correct?'真正题目':o.authors?.length?o.authors.join('、')+' 编的':'系统干扰项'} · {o.votes||0} 票</small>:o.mine?<small>你的假答案 · 不能自投</small>:null}</button>)}</div>}
 {state.phase==='vote'&&<p className="bluff-vote-note">{isDrawer?'画家知道题目，不参与投票。':state.voted?'你已投票，等所有人揭晓。':'选真正的题目得 100 分；你的假答案每骗到一票得 70 分。'}</p>}
 {state.phase==='reveal'&&<p className="bluff-vote-note">下一轮马上开始，换位继续放飞。</p>}
 </aside>:<aside className="chat-panel">{state.privateHint&&<div className="rank-hint">{state.privateHint}</div>}<div className="panel-title"><span>脑洞现场</span><span className="live-label"><span className="live-dot"/>LIVE</span></div><div className="chat-messages" aria-live="polite" aria-relevant="additions">{state.chat.map(message=><div className={'chat-message '+message.type} key={message.id}>{message.name&&<strong>{message.name}</strong>}<span>{message.text}</span></div>)}<div ref={chatBottom}/></div>{state.feedback&&<div className="rank-hint" role="status">{state.feedback}</div>}<form className="guess-form" onSubmit={async e=>{e.preventDefault();if(!guess.trim()||busy)return;const text=guess;setGuess('');await action('guess',{text});}}><label htmlFor="guess">{isDrawer?'你画，大家猜。':guessed?'你已猜中，答案先保密。':state.phase==='drawing'?'猜到就直接输入答案':'下一幅，马上开始。'}</label><div><input id="guess" autoComplete="off" placeholder={state.settings.pack==='english'?'Type your guess…':'输入你的答案…'} value={guess} maxLength={80} disabled={isDrawer||guessed||state.phase!=='drawing'||!online} onChange={e=>setGuess(e.target.value)}/><button type="submit" aria-label="提交答案" disabled={busy||!guess.trim()||isDrawer||guessed||state.phase!=='drawing'||!online}><Send size={17}/></button></div></form></aside>}</div>
   </section>}
  </>}
  {help&&<div className="modal-backdrop" onClick={()=>setHelp(false)}><section className="modal help-modal" role="dialog" aria-modal="true" aria-labelledby="help-title" onClick={e=>e.stopPropagation()}><button className="modal-close icon-button" aria-label="关闭玩法说明" onClick={()=>setHelp(false)}><X size={21}/></button><span className="eyebrow">SMALL RULES. BIG IMAGINATION.</span><h2 id="help-title">画笔就位，选个玩法。</h2><div className="help-step"><b>01</b><div><h3>段位对战，越画越有来头。</h3><p>三人轮流画猜，每人作画一次。画手挑选有辨识度的特征，猜词者争取从半幅画中抢先猜中。猜中越早分越高，画手每让一人猜中得 50 分。青铜先和两位人机热身，白银起优先找真人，超时补齐空位。</p></div></div><div className="help-step"><b>02</b><div><h3>异步挑战，朋友有空再猜。</h3><p>先画好并保存挑战链接。朋友稍后打开来猜，双方不用同时在线，链接 7 天有效。</p></div></div><div className="help-step"><b>03</b><div><h3>好友房间，三种玩法。</h3><p>经典画猜和三笔挑战支持 2–8 人；假答案支持 3–8 人，依次画图、编假答案、投票和揭晓。六种画笔都可使用。</p></div></div><div className="help-foot">禁止写答案、拼音、字母缩写或拆字提示。画字会绕过猜图，属于违规；段位局两位猜词者共同举报后，本幅计分取消。</div><button className="primary" onClick={()=>setHelp(false)}>懂了，开画 <ArrowRight size={19}/></button></section></div>}
  {practice&&<div className="modal-backdrop"><section className="modal practice-modal" role="dialog" aria-modal="true" aria-labelledby="practice-title"><div className="practice-top"><div><span className="eyebrow">YOUR LITTLE SCRATCHPAD</span><h2 id="practice-title">随便画两笔。</h2></div><button className="icon-button" aria-label="关闭练习画布" onClick={()=>setPractice(false)}><X size={22}/></button></div><DrawingBoard events={practiceEvents} editable onEvents={incoming=>setPracticeEvents(prev=>[...prev,...incoming])} roundId="practice"/><div className="practice-bottom"><span>这是你的练习画布，不会创建房间。</span><button className="secondary" onClick={()=>savePNG(practiceEvents,'随手画')}><Download size={16}/>保存下来</button></div></section></div>}
  {confirmLeave&&<div className="modal-backdrop"><section className="modal leave-modal" role="dialog" aria-modal="true" aria-labelledby="leave-title"><h2 id="leave-title">这就收笔了吗？</h2><p>离开后，本局的朋友们会继续游戏。</p><div><button className="secondary" onClick={()=>setConfirmLeave(false)}>再画一会儿</button><button className="primary" disabled={busy} onClick={()=>action('leave')}>离开房间</button></div></section></div>}
  {toast&&<div className="toast" role="status"><Check size={17}/>{toast}</div>}
 </main>;
}
