'use client';
import {useRef,useEffect,useState} from 'react';
import {Eraser,Undo2,Trash2,Download,Check,Pencil} from 'lucide-react';
import {DrawEvent,Point,renderDrawing,visibleStrokes} from '../lib/canvas';
import {BRUSHES} from '../lib/brushes.js';
const palette=['#292c25','#7d8870','#c5c9bd','#fffefb','#ec7969','#edb14e','#dbe88a','#80ae67','#4c9c86','#77bad1','#6f85c7','#aa88c8','#d58eaf','#b98059','#404b70','#b9ded8'];
export function BrushMark({brush,color='#63764d'}:{brush:string;color?:string}){return <svg viewBox="0 0 90 30" aria-hidden="true">{brush==='stars'?<g fill={color}>{[15,43,72].map(x=><path key={x} d={`M${x} 4l3 7 8 1-6 5 2 8-7-4-7 4 2-8-6-5 8-1Z`}/>)}</g>:brush==='pixel'?<g fill={color}>{[8,20,32,44,56,68].map((x,i)=><rect key={x} x={x} y={[15,9,5,9,15,10][i]} width="11" height="11"/>)}</g>:<><defs><linearGradient id="brush-spectrum"><stop stopColor="#ec7969"/><stop offset=".5" stopColor="#b8c962"/><stop offset="1" stopColor="#9a85c6"/></linearGradient></defs><path d="M6 22C24 27 24 1 44 8S67 28 83 8" fill="none" stroke={brush==='rainbow'?'url(#brush-spectrum)':color} strokeWidth={brush==='marker'?12:brush==='double'?2:5} strokeLinecap="round" opacity={brush==='marker'?.5:1}/>{brush==='double'&&<path d="M6 16C24 21 24-5 44 2S67 22 83 2" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round"/>}</>}</svg>}
export function DrawingBoard({events,editable,onEvents,roundId,watchingLabel='大家看到的是同一张画布',defaultSize=5,maxStrokes,animateWatching=false}:{events:DrawEvent[];editable:boolean;onEvents:(events:DrawEvent[])=>void;roundId:string;watchingLabel?:string;defaultSize?:number;maxStrokes?:number;animateWatching?:boolean}){
 const painted=useRef<DrawEvent[]>([]),paintRound=useRef(roundId),animation=useRef(0),[pen,setPen]=useState<Point|null>(null);
 const canvas=useRef<HTMLCanvasElement>(null),all=useRef(events);all.current=events;
 const draft=useRef<{id:string;points:Point[];color:string;size:number;brush:string}|null>(null);
 const [color,setColor]=useState('#292c25'),[size,setSize]=useState(defaultSize),[brush,setBrush]=useState('ink'),[eraser,setEraser]=useState(false);
 const repaint=()=>{if(canvas.current){const d=draft.current;renderDrawing(canvas.current,d?[...all.current,{type:'stroke',key:'draft',...d}]:all.current)}};
 const emit=useRef(onEvents);emit.current=onEvents;
 const flush=()=>{const d=draft.current;if(!d||!d.points.length)return;emit.current([{type:'stroke',key:crypto.randomUUID(),...d,points:[...d.points]}]);d.points=[d.points.at(-1)!];};
 useEffect(()=>{
  cancelAnimationFrame(animation.current);
  if(paintRound.current!==roundId){painted.current=[];paintRound.current=roundId;setPen(null)}
  if(!animateWatching||editable){painted.current=events;repaint();return;}
  const previous=new Map(painted.current.map(e=>[e.id,e])),began=performance.now();
  const frame=(now:number)=>{const f=Math.min(1,(now-began)/350),ease=f*f*(3-2*f);
   const picture=events.map(e=>{if(e.type!=='stroke'||!e.points?.length)return e;const target=e.points,before=previous.get(e.id)?.points||[target[0]],count=Math.min(target.length,before.length+(target.length-before.length)*ease),n=Math.max(1,Math.floor(count)),ps=target.slice(0,n).map(p=>[...p] as Point),at=Math.min(before.length-1,ps.length-1);
    if(before[at]&&target[at])ps[at]=[before[at][0]+(target[at][0]-before[at][0])*ease,before[at][1]+(target[at][1]-before[at][1])*ease];
    if(n<target.length){const a=ps.at(-1)!,b=target[n],t=count-n;ps.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]);}
    return {...e,points:ps};});painted.current=picture;if(canvas.current)renderDrawing(canvas.current,picture);setPen(picture.at(-1)?.points?.at(-1)||null);if(f<1)animation.current=requestAnimationFrame(frame);
  };animation.current=requestAnimationFrame(frame);return()=>cancelAnimationFrame(animation.current);
 },[events,animateWatching,editable,roundId]);
 useEffect(()=>{draft.current=null;if(!animateWatching||editable)repaint()},[roundId,editable,animateWatching]);
 useEffect(()=>{const t=setInterval(flush,140);return()=>clearInterval(t)},[]);
 const position=(e:React.PointerEvent<HTMLCanvasElement>):Point=>{const r=e.currentTarget.getBoundingClientRect();return [Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),Math.max(0,Math.min(1,(e.clientY-r.top)/r.height))]};
 const stop=()=>{if(!draft.current)return;flush();draft.current=null;repaint()};
 useEffect(()=>{if(!editable)return;const shortcut=(e:KeyboardEvent)=>{const target=e.target as HTMLElement;if(target.matches('input,textarea,select')||target.isContentEditable)return;
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){if(maxStrokes)return;e.preventDefault();stop();const last=visibleStrokes(all.current).at(-1);if(last)emit.current([{type:'undo',id:last.id,key:crypto.randomUUID()}]);}
  else if(!e.ctrlKey&&!e.metaKey){if(e.key.toLowerCase()==='e'&&!maxStrokes){e.preventDefault();setEraser(true);}else if(e.key.toLowerCase()==='b'){e.preventDefault();setEraser(false);}else if(e.key==='['||e.key===']'){e.preventDefault();setSize(v=>Math.max(3,Math.min(20,v+(e.key===']'?2:-2))));}}
 };window.addEventListener('keydown',shortcut);return()=>window.removeEventListener('keydown',shortcut);},[editable,maxStrokes]);
 const strokes=new Set(visibleStrokes(events).map(e=>e.id)).size,canDraw=editable&&(!maxStrokes||strokes<maxStrokes);
 function download(){if(!canvas.current)return;const a=document.createElement('a');a.download='画里有话-'+Date.now()+'.png';a.href=canvas.current.toDataURL('image/png');a.click()}
 return <div className={'drawing-board creative-board '+(editable?'editable-board':'')}>
  <div className="canvas-shell"><canvas ref={canvas} width={1000} height={650} aria-label={editable?'绘画画布，按住并拖动来绘画':'共享画布'} className={canDraw?'can-draw':''}
   onPointerDown={e=>{if(!canDraw||e.button>0)return;e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);draft.current={id:crypto.randomUUID(),points:[position(e)],color:eraser?'#fffefb':color,size:eraser?30:size,brush:eraser?'ink':brush};repaint()}}
   onPointerMove={e=>{if(!editable||!draft.current)return;e.preventDefault();draft.current.points.push(position(e));if(draft.current.points.length>=120)flush();repaint()}}
   onPointerUp={stop} onPointerCancel={stop} onLostPointerCapture={stop}/>{animateWatching&&pen&&<span className="bot-drawing-pen" style={{left:pen[0]*100+'%',top:pen[1]*100+'%'}}><Pencil size={22}/></span>}<span className="canvas-corner">{maxStrokes?`三笔挑战 · 已用 ${strokes} / ${maxStrokes} 笔`:'a little imagination goes a long way.'}</span></div>
  {editable&&<div className="brush-shelf" role="group" aria-label="选择创意画笔">{BRUSHES.map(b=><button key={b.id} className={brush===b.id&&!eraser?'brush-card active':'brush-card'} style={{'--brush-accent':b.accent} as React.CSSProperties} title={b.description} aria-pressed={brush===b.id&&!eraser} onClick={()=>{setBrush(b.id);setEraser(false)}}><BrushMark brush={b.id}/><span>{b.name}</span>{brush===b.id&&!eraser&&<Check size={12}/>}</button>)}</div>}
  <div className={'toolbar creative-toolbar '+(!editable?'watching':'')}>
   {editable?<><div className="palette">{palette.filter(c=>!maxStrokes||c!=='#fffefb').map(c=><button key={c} className={color===c&&!eraser?'swatch chosen':'swatch'} style={{background:c}} title={'颜色 '+c} aria-label={'颜色 '+c} aria-pressed={color===c&&!eraser} onClick={()=>{setColor(c);setEraser(false)}}/>)}<label className="custom-color" title="自选颜色"><span>＋</span><input type="color" aria-label="自选画笔颜色" value={color} onChange={e=>{setColor(e.target.value);setEraser(false)}}/></label></div>
   <select className="brush-size" aria-label="笔刷粗细" value={size} onChange={e=>setSize(Number(e.target.value))}><option value={3}>细 · 3</option><option value={5}>中 · 5</option><option value={8}>顺手 · 8</option><option value={12}>粗 · 12</option><option value={20}>特粗 · 20</option></select>
   <div className="tool-section last"><button className={'tool '+(eraser?'selected':'')} title="橡皮 · E" aria-label="橡皮" aria-pressed={eraser} disabled={!!maxStrokes} onClick={()=>setEraser(!eraser)}><Eraser size={19}/></button><button className="tool" disabled={!strokes||!!maxStrokes} title="撤销上一笔 · Ctrl / ⌘ Z" aria-label="撤销上一笔" onClick={()=>{const last=visibleStrokes(events).at(-1);if(last)onEvents([{type:'undo',id:last.id,key:crypto.randomUUID()}])}}><Undo2 size={19}/></button><button className="tool" disabled={!strokes||!!maxStrokes} title="清空画布" aria-label="清空画布" onClick={()=>{if(confirm('要清空这幅画吗？'))onEvents([{type:'clear',id:crypto.randomUUID(),key:crypto.randomUUID()}])}}><Trash2 size={18}/></button></div></>:<><span><span className="live-dot"/>{watchingLabel}</span><button className="text-button" onClick={download}><Download size={16}/>保存画作</button></>}
  </div>
 </div>
}
