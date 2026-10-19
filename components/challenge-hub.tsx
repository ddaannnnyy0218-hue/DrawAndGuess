'use client';
import {useState,useEffect,useRef} from 'react';
import {ArrowRight,Copy,Check,Link2,Clock3,Pencil,Send,Loader2,Lightbulb,RotateCcw,Trophy,ArrowLeft} from 'lucide-react';
import {LEVELS} from '../lib/levels.js';
import type {DrawEvent} from '../lib/canvas';
import {publishDrawing} from '../lib/challenge-client';
import {DrawingBoard} from './drawing-board';
import {Bot} from './ink-bot';
type Challenge={id:string;creator:string;createdAt:number;expiresAt:number;board:{name:string;score:number}[]};
type Attempt={id:string;name:string;deadline:number;now:number;tries:number;hints:number;finished:boolean;solved:boolean;score:number;hint:string|null;word:string|null;label:string|null};
type Reply={error?:string;token?:string;attempt?:Attempt;events?:DrawEvent[]};
export function ChallengeHub({id,notify,onHome}:{id:string;notify:(text:string)=>void;onHome:()=>void}){
 const [name,setName]=useState(''),[levelId,setLevelId]=useState(21),[events,setEvents]=useState<DrawEvent[]>([]),[busy,setBusy]=useState(false),[loading,setLoading]=useState(!!id);
 const [data,setData]=useState<Challenge|null>(null),[attempt,setAttempt]=useState<Attempt|null>(null),[token,setToken]=useState(''),[error,setError]=useState(''),[answer,setAnswer]=useState(''),[url,setUrl]=useState(''),[now,setNow]=useState(0),[offset,setOffset]=useState(0);
 const finishing=useRef(false);
 useEffect(()=>{setName(localStorage.getItem('dg-name')||'');setNow(Date.now());},[]);
 useEffect(()=>{
  if(!id)return;let cancelled=false;setLoading(true);setError('');setAttempt(null);setEvents([]);
  (async()=>{
   const response=await fetch('/api/challenge?id='+id,{cache:'no-store'});const info=await response.json() as Challenge&{error?:string};
   if(!response.ok)throw new Error(info.error);if(cancelled)return;setData(info);
   const saved=JSON.parse(sessionStorage.getItem('dg-challenge-'+id)||'null');
   if(saved?.token&&saved?.attemptId){
    const res=await fetch('/api/challenge?action=attempt&id='+id+'&attemptId='+saved.attemptId,{headers:{Authorization:'Bearer '+saved.token},cache:'no-store'});
    const result=await res.json() as Reply;if(cancelled)return;
    if(res.ok&&result.attempt){setAttempt(result.attempt);setToken(saved.token);setOffset(result.attempt.now-Date.now());setEvents(result.events||[]);}
   }
  })().catch(e=>{if(!cancelled)setError(e instanceof Error?e.message:'挑战暂时无法加载。');}).finally(()=>{if(!cancelled)setLoading(false)});
  return()=>{cancelled=true;};
 },[id]);
 useEffect(()=>{
  if(!attempt||attempt.finished)return;
  const timer=setInterval(()=>setNow(Date.now()),100);return()=>clearInterval(timer);
 },[attempt]);
 async function send(action:string,extra:Record<string,unknown>={}){
  const response=await fetch('/api/challenge',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,id,attemptId:attempt?.id,token,...extra}),signal:AbortSignal.timeout(12000)});
  const result=await response.json() as Reply;if(!response.ok)throw new Error(result.error||'挑战还没接上，请重试。');
  if(result.attempt){setAttempt(result.attempt);setOffset(result.attempt.now-Date.now());setNow(Date.now());}
  if(result.events)setEvents(result.events);
  if(result.token&&result.attempt){setToken(result.token);sessionStorage.setItem('dg-challenge-'+id,JSON.stringify({token:result.token,attemptId:result.attempt.id}));}
  return result;
 }
 useEffect(()=>{
  if(!attempt||attempt.finished||now+offset<attempt.deadline||finishing.current)return;
  finishing.current=true;
  send('attempt').catch(()=>notify('连接暂时中断，重试后会恢复本次挑战。')).finally(()=>{finishing.current=false});
 },[now,offset,attempt]);
 useEffect(()=>{
  if(!attempt?.finished||!id)return;
  fetch('/api/challenge?id='+id,{cache:'no-store'}).then(r=>r.json()).then(result=>setData(result as Challenge)).catch(()=>{});
 },[attempt?.finished,id]);
 async function start(){if(busy)return;if(!name.trim()){notify('先写一个昵称，朋友就知道是谁猜中了。');return;}setBusy(true);try{localStorage.setItem('dg-name',name.trim());await send('start',{name:name.trim()});setAnswer('');}catch(e){notify(e instanceof Error?e.message:'暂时无法开始。')}finally{setBusy(false);}}
 async function guess(e:React.FormEvent){e.preventDefault();if(!answer.trim()||busy)return;setBusy(true);const text=answer;setAnswer('');try{const reply=await send('guess',{text});if(!reply.attempt?.finished)notify('还没猜中，换个角度再看看。');}catch(e){notify(e instanceof Error?e.message:'这次没有提交成功。');setAnswer(text);}finally{setBusy(false);}}
 async function create(){
  if(busy)return;if(!name.trim()){notify('先给自己取个昵称吧。');return;}setBusy(true);
  try{const result=await publishDrawing(levelId,events,name.trim());setUrl(result.url);localStorage.setItem('dg-name',name.trim());notify(result.copied?'挑战链接已复制，朋友晚点也能猜。':'已保存挑战，复制下方链接即可分享。');}
  catch(e){notify(e instanceof Error?e.message:'保存挑战失败。')}finally{setBusy(false);}
 }
 const remaining=attempt?Math.max(0,Math.ceil((attempt.deadline-(now+offset))/1000)):60;
 if(loading)return <section className="loading-screen"><Loader2 size={30} className="spin"/><h2>正在打开朋友留下的画</h2><p>不需要对方同时在线。</p></section>;
 if(error&&id)return <section className="loading-screen"><h2>这幅挑战暂时没找到</h2><p role="alert">{error}</p><button className="primary" onClick={onHome}>回到排位大厅 <ArrowRight size={18}/></button></section>;
 return <section className="async-hub">
  <div className="async-heading"><div><span className="eyebrow">{id?'A LITTLE MESSAGE, DRAWN FOR YOU':'PLAY TOGETHER, AT YOUR OWN PACE'}</span><h1>{id?data?.creator+' 留了一幅画。':<>我先画好，<br/>你有空再猜。</>}</h1><p>{id?'接下挑战后有 60 秒。中文、英文答案都可以。':'把灵感存成一个链接。对方明天来猜，也没关系。'}</p></div><div className="async-badge"><Clock3 size={29}/><strong>不必同时在线</strong><span>链接 7 天有效</span></div></div>
  {!id?<div className="async-compose-grid"><div><div className="compose-instructions"><span><Pencil size={16}/>用画面表达，别把答案写出来。</span><span>{events.length?'画好了就保存链接':'先画个最明显的轮廓'}</span></div><DrawingBoard events={events} editable onEvents={incoming=>{setEvents(previous=>[...previous,...incoming]);setUrl('')}} roundId={'compose-'+levelId} defaultSize={8}/></div><aside className="async-create-panel"><h2>留下一道画谜。</h2><label htmlFor="async-name">你叫什么</label><input id="async-name" value={name} maxLength={16} placeholder="你的昵称" onChange={e=>setName(e.target.value)}/><label htmlFor="async-topic">你要画什么</label><select id="async-topic" value={levelId} onChange={e=>{setLevelId(Number(e.target.value));setEvents([]);setUrl('')}}>{LEVELS.map(level=><option key={level.id} value={level.id}>{level.word}</option>)}</select><div className="async-rules"><div><span>01</span>先画好，再生成链接</div><div><span>02</span>朋友稍后打开来猜</div><div><span>03</span>猜中后留下挑战成绩</div></div><button className="primary" disabled={busy||events.length===0} onClick={create}>{busy?<Loader2 className="spin" size={18}/>:<><Link2 size={18}/>保存并复制挑战链接</>}</button><p className="settings-note">分享链接的人都可以来猜。只分享给你想邀请的朋友。</p>{url&&<div className="created-challenge"><Check size={18}/><strong>这幅画已经保存。</strong><input aria-label="新建挑战链接" value={url} readOnly onFocus={e=>e.target.select()}/><a href={url} target="_blank" rel="noreferrer">打开挑战页 <ArrowRight size={14}/></a></div>}</aside></div>:
  <><div className="async-play-grid"><div className="async-challenge-board"><DrawingBoard events={events} editable={false} onEvents={()=>{}} roundId={id} watchingLabel="朋友留下的画谜"/>
    {!attempt&&<div className="challenge-seal"><Bot/><h2>这幅画，等你来揭晓。</h2><p>开始后才会展示画作并计时。</p><label htmlFor="challenge-nickname">你的昵称</label><input id="challenge-nickname" value={name} maxLength={16} placeholder="让朋友知道是谁猜中了" onChange={e=>setName(e.target.value)}/><button className="primary" disabled={busy} onClick={start}>{busy?<Loader2 className="spin" size={18}/>:<>接下挑战 <ArrowRight size={19}/></>}</button></div>}
    </div><aside className="async-answer-panel">{attempt?<><div className={'countdown '+(remaining<10&&!attempt.finished?'urgent':'')}><Clock3 size={19}/><strong>{attempt.finished?'✓':remaining}</strong><span>{attempt.finished?'挑战结束':'秒'}</span></div><h2>{attempt.finished?(attempt.solved?'被你看懂了！':'这幅画的答案是…'):'你看到了什么？'}</h2>{attempt.finished?<><strong className="async-revealed-word">{attempt.word}</strong><span className="async-english-word">{attempt.label}</span><div className="async-score"><Trophy size={24}/><strong>{attempt.score}</strong><span>分</span></div><p>{attempt.solved?'成绩已留下。朋友不用在线，也能看到你的挑战结果。':'下次换个角度想想。你也可以留一幅画给朋友。'}</p><button className="secondary" disabled={busy} onClick={start}><RotateCcw size={16}/>再猜一次</button></>:<><form className="solo-guess-form" onSubmit={guess}><label htmlFor="async-answer">中文或英文都可以</label><div><input id="async-answer" maxLength={60} autoComplete="off" value={answer} placeholder="我猜是…" onChange={e=>setAnswer(e.target.value)}/><button aria-label="提交异步挑战答案" disabled={busy||!answer.trim()}><Send size={18}/></button></div></form><span className="async-tries">还可以猜 {12-attempt.tries} 次</span><button className="text-button" disabled={busy||!!attempt.hints} onClick={()=>{setBusy(true);send('hint').catch(e=>notify(e.message)).finally(()=>setBusy(false))}}><Lightbulb size={16}/>{attempt.hints?'已使用提示':'看一条提示 · 扣 30 分'}</button>{attempt.hint&&<div className="async-hint">{attempt.hint}</div>}</>}</>:<p>别着急，画作会在你开始后展示。</p>}</aside></div>
   <div className="async-board-results"><div className="section-heading"><div><span className="eyebrow">THEY GOT YOUR PICTURE</span><h2>后来，谁看懂了？</h2></div><span className="subtle">每个昵称保留最高分</span></div>{data?.board.length?<div className="async-leaderboard">{data.board.map((entry,index)=><div key={entry.name}><span>{String(index+1).padStart(2,'0')}</span><strong>{entry.name}</strong><b>{entry.score} 分</b></div>)}</div>:<p className="empty-gallery">还没有人猜中。也许你会是第一个。</p>}</div>
  </>}
 </section>;
}
