export type Point=[number,number];
export type DrawEvent={type:'stroke'|'clear'|'undo';id:string;key:string;color?:string;size?:number;brush?:string;points?:Point[];seq?:number;roundId?:string};
export function visibleStrokes(events:DrawEvent[]){let strokes:DrawEvent[]=[];const hidden=new Set<string>();for(const e of events){if(e.type==='clear'){strokes=[];hidden.clear()}else if(e.type==='undo')hidden.add(e.id);else strokes.push(e)}return strokes.filter(s=>!hidden.has(s.id));}
function star(ctx:CanvasRenderingContext2D,x:number,y:number,r:number){ctx.beginPath();for(let i=0;i<10;i++){const a=-Math.PI/2+i*Math.PI/5,d=i%2?r*.42:r;const xx=x+Math.cos(a)*d,yy=y+Math.sin(a)*d;if(i)ctx.lineTo(xx,yy);else ctx.moveTo(xx,yy)}ctx.closePath();ctx.fill();}
export function renderDrawing(canvas:HTMLCanvasElement,events:DrawEvent[],background=true){
 const ctx=canvas.getContext('2d');if(!ctx)return;ctx.clearRect(0,0,canvas.width,canvas.height);if(background){ctx.fillStyle='#fffefb';ctx.fillRect(0,0,canvas.width,canvas.height)}
 const grouped=new Map<string,DrawEvent>();for(const e of visibleStrokes(events)){const previous=grouped.get(e.id);if(previous)previous.points=[...(previous.points||[]),...(e.points||[]).slice(1)];else grouped.set(e.id,{...e,points:[...(e.points||[])]});}
 for(const e of grouped.values()){
  if(!e.points?.length)continue;ctx.save();ctx.lineCap='round';ctx.lineJoin='round';const brush=e.brush||'ink',size=(e.size||4)*canvas.width/1000,ps=e.points.map(p=>[p[0]*canvas.width,p[1]*canvas.height]);
  ctx.strokeStyle=e.color||'#242820';ctx.fillStyle=ctx.strokeStyle;ctx.lineWidth=size;
  if(brush==='rainbow'&&e.color!=='#fffefb'){const g=ctx.createLinearGradient(ps[0][0],ps[0][1],ps.at(-1)![0]+1,ps.at(-1)![1]+1);['#eb7969','#edb14e','#9ab954','#5bab96','#6d9ed2','#a786cb'].forEach((c,i)=>g.addColorStop(i/5,c));ctx.strokeStyle=g;ctx.fillStyle=g;}
  if(brush==='marker'){ctx.globalAlpha=.38;ctx.lineWidth=size*3;ctx.lineCap='square';}
  const path=(dx=0,dy=0)=>{ctx.beginPath();ctx.moveTo(ps[0][0]+dx,ps[0][1]+dy);for(const p of ps.slice(1))ctx.lineTo(p[0]+dx,p[1]+dy);if(ps.length===1)ctx.lineTo(ps[0][0]+dx+.01,ps[0][1]+dy+.01);ctx.stroke();};
  if(brush==='stars'||brush==='pixel'){
   const step=Math.max(8,size*(brush==='stars'?2.5:1)),radius=Math.max(4,size);let walked=0,next=0;
   const stamp=(x:number,y:number)=>{if(brush==='stars')star(ctx,x,y,radius);else{const unit=Math.max(5,size*1.4);ctx.fillRect(Math.round(x/unit)*unit-unit/2,Math.round(y/unit)*unit-unit/2,unit,unit)}};
   if(ps.length===1)stamp(ps[0][0],ps[0][1]);for(let i=1;i<ps.length;i++){const a=ps[i-1],b=ps[i],length=Math.hypot(b[0]-a[0],b[1]-a[1]);while(next<=walked+length){const t=length?(next-walked)/length:0;stamp(a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t);next+=step;}walked+=length;}
  }else if(brush==='double'){ctx.lineWidth=Math.max(1,size*.42);path(-size*.6,-size*.6);path(size*.6,size*.6);}else path();ctx.restore();
 }
}
