export type Point = [number, number];
export type DrawEvent = {type:'stroke'|'clear'|'undo'; id:string; key:string; color?:string; size?:number; points?:Point[]; seq?:number; roundId?:string};
export function visibleStrokes(events:DrawEvent[]) {
  let strokes:DrawEvent[]=[];const hidden=new Set<string>();
  for(const e of events){if(e.type==='clear'){strokes=[];hidden.clear();}else if(e.type==='undo'){hidden.add(e.id);}else{strokes.push(e);}}
  return strokes.filter(s=>!hidden.has(s.id));
}
export function renderDrawing(canvas:HTMLCanvasElement,events:DrawEvent[],background=true){
  const ctx=canvas.getContext('2d');if(!ctx)return;
  ctx.clearRect(0,0,canvas.width,canvas.height);
  if(background){ctx.fillStyle='#fffefb';ctx.fillRect(0,0,canvas.width,canvas.height);}
  ctx.lineCap='round';ctx.lineJoin='round';
  for(const e of visibleStrokes(events)){
    if(!e.points?.length)continue;
    ctx.strokeStyle=e.color||'#242820';ctx.fillStyle=ctx.strokeStyle;
    ctx.lineWidth=(e.size||4)*canvas.width/1000;
    const [first,...rest]=e.points;
    if(!rest.length){ctx.beginPath();ctx.arc(first[0]*canvas.width,first[1]*canvas.height,ctx.lineWidth/2,0,Math.PI*2);ctx.fill();continue;}
    ctx.beginPath();ctx.moveTo(first[0]*canvas.width,first[1]*canvas.height);
    for(const point of rest)ctx.lineTo(point[0]*canvas.width,point[1]*canvas.height);
    ctx.stroke();
  }
}
