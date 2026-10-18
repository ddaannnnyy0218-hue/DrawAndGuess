'use client';
import {useRef,useEffect,useState} from 'react';
import {Pencil,Eraser,Undo2,Trash2,Download} from 'lucide-react';
import {DrawEvent,Point,renderDrawing,visibleStrokes} from '../lib/canvas';
const palette=['#292c25','#747b6b','#c2c6bb','#fffefb','#f27765','#f4b857','#c6e77c','#4c9c78','#77bada','#6f85c7','#aa88c8','#e5a2ba'];
export function DrawingBoard({events,editable,onEvents,roundId}:{events:DrawEvent[];editable:boolean;onEvents:(events:DrawEvent[])=>void;roundId:string}){
  const canvas=useRef<HTMLCanvasElement>(null);
  const all=useRef(events);all.current=events;
  const draft=useRef<{id:string;points:Point[];color:string;size:number}|null>(null);
  const [color,setColor]=useState('#292c25'),[size,setSize]=useState(5),[eraser,setEraser]=useState(false);
  const repaint=()=>{if(canvas.current){const d=draft.current;renderDrawing(canvas.current,d?[...all.current,{type:'stroke',key:'draft',...d}]:all.current)}};
  const emit=useRef(onEvents);emit.current=onEvents;
  const flush=()=>{
    const d=draft.current;if(!d||!d.points.length)return;
    const event:DrawEvent={type:'stroke',id:d.id,key:crypto.randomUUID(),color:d.color,size:d.size,points:[...d.points]};
    emit.current([event]);d.points=[d.points[d.points.length-1]];
  };
  useEffect(()=>{repaint();},[events]);
  useEffect(()=>{draft.current=null;repaint();},[roundId,editable]);
  useEffect(()=>{const timer=setInterval(flush,140);return()=>clearInterval(timer);},[]);
  const position=(e:React.PointerEvent<HTMLCanvasElement>):Point=>{const r=e.currentTarget.getBoundingClientRect();return [Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),Math.max(0,Math.min(1,(e.clientY-r.top)/r.height))]};
  const stop=()=>{if(!draft.current)return;flush();draft.current=null;repaint();};
  function download(){if(!canvas.current)return;const link=document.createElement('a');link.download='DrawAndGuess-'+Date.now()+'.png';link.href=canvas.current.toDataURL('image/png');link.click();}
  const canUndo=visibleStrokes(events).length>0;
  return <div className="drawing-board">
    <div className="canvas-shell"><canvas ref={canvas} width={1000} height={650} aria-label={editable?'绘画画布，按住并拖动来绘画':'实时共享画布'} className={editable?'can-draw':''}
      onPointerDown={e=>{if(!editable||e.button>0)return;e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);draft.current={id:crypto.randomUUID(),points:[position(e)],color:eraser?'#fffefb':color,size:eraser?30:size};repaint();}}
      onPointerMove={e=>{if(!editable||!draft.current)return;e.preventDefault();draft.current.points.push(position(e));if(draft.current.points.length>=120)flush();repaint();}}
      onPointerUp={stop} onPointerCancel={stop} onLostPointerCapture={stop}/>
      <span className="canvas-corner">a little imagination goes a long way.</span>
    </div>
    <div className={'toolbar '+(!editable?'watching':'')}>
      {editable?<><div className="tool-section"><button className={'tool '+(!eraser?'selected':'')} title="铅笔" aria-label="铅笔" aria-pressed={!eraser} onClick={()=>setEraser(false)}><Pencil size={19}/></button><button className={'tool '+(eraser?'selected':'')} title="橡皮" aria-label="橡皮" aria-pressed={eraser} onClick={()=>setEraser(true)}><Eraser size={19}/></button></div>
      <div className="palette">{palette.map(c=><button key={c} className={color===c&&!eraser?'swatch chosen':'swatch'} style={{background:c}} title={'颜色 '+c} aria-label={'颜色 '+c} aria-pressed={color===c&&!eraser} onClick={()=>{setColor(c);setEraser(false);}}/>)}</div>
      <select className="brush-size" aria-label="笔刷粗细" value={size} onChange={e=>setSize(Number(e.target.value))}><option value={3}>细</option><option value={5}>中</option><option value={10}>粗</option><option value={18}>特粗</option></select>
      <div className="tool-section last"><button className="tool" disabled={!canUndo} title="撤销上一笔" aria-label="撤销上一笔" onClick={()=>{const last=visibleStrokes(events).at(-1);if(last)onEvents([{type:'undo',id:last.id,key:crypto.randomUUID()}]);}}><Undo2 size={19}/></button><button className="tool" disabled={!canUndo} title="清空画布" aria-label="清空画布" onClick={()=>{if(confirm('要清空这幅画吗？'))onEvents([{type:'clear',id:crypto.randomUUID(),key:crypto.randomUUID()}]);}}><Trash2 size={18}/></button></div></>:<span><span className="live-dot"/>大家看到的是同一张画布</span>}
      {!editable&&<button className="text-button" onClick={download}><Download size={16}/>保存画作</button>}
    </div>
  </div>
}
