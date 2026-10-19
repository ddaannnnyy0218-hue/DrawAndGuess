// Small, deterministic CPU forward pass for the retained MIT DoodleNet weights.
// Ranked scores are decided from server-received strokes, never a client score.
import {sketchPixels} from './sketch-input.js';
let prepared;
function visible(events){let out=[];const hidden=new Set();for(const e of events){if(e.type==='clear'){out=[];hidden.clear()}else if(e.type==='undo')hidden.add(e.id);else out.push(e)}return out.filter(e=>!hidden.has(e.id));}
export function strokePixels(events){
 const strokes=visible(events),points=strokes.filter(e=>e.color!=='#fffefb').flatMap(e=>e.points||[]);if(points.length<2)return null;
 const xs=points.map(p=>p[0]*1000),ys=points.map(p=>p[1]*650),x0=Math.min(...xs),y0=Math.min(...ys),extent=Math.max(50,Math.max(...xs)-x0,Math.max(...ys)-y0),side=extent*1.15;
 const size=112,data=new Uint8ClampedArray(size*size*4);data.fill(255);
 const ox=x0+(Math.max(...xs)-x0-side)/2,oy=y0+(Math.max(...ys)-y0-side)/2;
 for(const s of strokes){const ps=s.points||[],eraser=s.color==='#fffefb',radius=(eraser?Math.max(s.size||30,extent*.14):extent*.07)/side*size/2;
  for(let i=0;i<ps.length;i++){const a=ps[Math.max(0,i-1)],b=ps[i],ax=(a[0]*1000-ox)/side*size,ay=(a[1]*650-oy)/side*size,bx=(b[0]*1000-ox)/side*size,by=(b[1]*650-oy)/side*size;
   const dx=bx-ax,dy=by-ay,len=dx*dx+dy*dy;
   for(let y=Math.max(0,Math.floor(Math.min(ay,by)-radius-1));y<Math.min(size,Math.ceil(Math.max(ay,by)+radius+1));y++)for(let x=Math.max(0,Math.floor(Math.min(ax,bx)-radius-1));x<Math.min(size,Math.ceil(Math.max(ax,bx)+radius+1));x++){
    const t=len?Math.max(0,Math.min(1,((x+.5-ax)*dx+(y+.5-ay)*dy)/len)):0,d=Math.hypot(x+.5-ax-t*dx,y+.5-ay-t*dy),alpha=Math.max(0,Math.min(1,radius+.5-d));if(!alpha)continue;
    const at=(y*size+x)*4,v=Math.round(data[at]*(1-alpha)+(eraser?255:0)*alpha);data[at]=data[at+1]=data[at+2]=v;
   }
  }
 }
 return sketchPixels(data,size,size);
}
function conv(input,n,cin,cout,kernel,bias){const out=new Float32Array(n*n*cout);for(let y=0;y<n;y++)for(let x=0;x<n;x++){
 const at=(y*n+x)*cout;out.set(bias,at);
 for(let ky=0;ky<3;ky++){const yy=y+ky-1;if(yy<0||yy>=n)continue;for(let kx=0;kx<3;kx++){const xx=x+kx-1;if(xx<0||xx>=n)continue;const start=(yy*n+xx)*cin,k=(ky*3+kx)*cin*cout;
  for(let c=0;c<cin;c++){const v=input[start+c];if(v===0)continue;const w=k+c*cout;for(let o=0;o<cout;o++)out[at+o]+=v*kernel[w+o];}
 }}for(let o=0;o<cout;o++)if(out[at+o]<0)out[at+o]=0;
 }return out;}
function pool(input,n,c){const m=Math.floor(n/2),out=new Float32Array(m*m*c);for(let y=0;y<m;y++)for(let x=0;x<m;x++)for(let z=0;z<c;z++)out[(y*m+x)*c+z]=Math.max(input[((y*2)*n+x*2)*c+z],input[((y*2)*n+x*2+1)*c+z],input[((y*2+1)*n+x*2)*c+z],input[((y*2+1)*n+x*2+1)*c+z]);return out;}
function dense(input,weights,bias,activation){const out=new Float32Array(bias);for(let i=0;i<input.length;i++){const v=input[i],base=i*out.length;for(let j=0;j<out.length;j++)out[j]+=v*weights[base+j];}if(activation==='tanh')for(let j=0;j<out.length;j++)out[j]=Math.tanh(out[j]);return out;}
export function makeJudge(manifest,buffer,labels){
 const weights={};let offset=0;for(const w of manifest.weightsManifest[0].weights){const len=w.shape.reduce((a,b)=>a*b,1);weights[w.name]=new Float32Array(buffer,offset,len);offset+=len*4;}
 return input=>{let a=input,n=28,cin=1;for(let i=0;i<6;i++){const name=i?'conv2d_'+i:'conv2d',cout=[16,16,32,32,64,64][i];a=conv(a,n,cin,cout,weights[name+'/kernel'],weights[name+'/bias']);cin=cout;if(i%2){a=pool(a,n,cin);n=Math.floor(n/2);}}
  a=dense(a,weights['dense/kernel'],weights['dense/bias'],'tanh');a=dense(a,weights['dense_1/kernel'],weights['dense_1/bias']);const max=Math.max(...a),exp=Array.from(a,v=>Math.exp(v-max)),total=exp.reduce((s,v)=>s+v,0);return exp.map((v,i)=>({label:labels[i],confidence:v/total})).sort((a,b)=>b.confidence-a.confidence).slice(0,5);
 };
}
export async function judgeDrawing(events,assets){
 const input=strokePixels(events);if(!input)return [];
 if(!prepared)prepared=(async()=>{const [m,b,l]=await Promise.all([assets('/models/doodlenet/model.json').then(r=>r.json()),assets('/models/doodlenet/group1-shard1of1.bin').then(r=>r.arrayBuffer()),assets('/models/doodlenet/class_names.txt').then(r=>r.text())]);return makeJudge(m,b,l.trim().split(/\r?\n/).map(s=>s.replaceAll('_',' ')));})().catch(e=>{prepared=null;throw e});
 return (await prepared)(input);
}
