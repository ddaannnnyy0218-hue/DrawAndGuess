import type {DrawEvent} from './canvas';
type RawDrawing={label:string;word:string;samples:{drawing:[number[],number[]][];sourceId:string}[];preferred?:number};
const cache=new Map<string,Promise<RawDrawing>>();
export async function botDrawing(label:string,variant=0):Promise<DrawEvent[]>{
 if(!cache.has(label))cache.set(label,fetch('/drawings/'+label.replaceAll(' ','-')+'.json').then(r=>{if(!r.ok)throw new Error('这幅画暂时没加载出来，请重试。');return r.json() as Promise<RawDrawing>}).catch(e=>{cache.delete(label);throw e}));
 const data=await cache.get(label)!;const index=(data.preferred??0)+variant;
 const strokes=data.samples[index%data.samples.length].drawing;
 const xs=strokes.flatMap(s=>s[0]),ys=strokes.flatMap(s=>s[1]);const minX=Math.min(...xs),minY=Math.min(...ys),w=Math.max(...xs)-minX||1,h=Math.max(...ys)-minY||1;
 const scale=Math.min(780/w,470/h),offsetX=(1000-w*scale)/2,offsetY=(650-h*scale)/2;
 return strokes.map(([x,y],i)=>({type:'stroke',id:'bot-'+i,key:'bot-'+variant+'-'+i,color:'#292c25',size:5,points:x.map((value,j)=>[(offsetX+(value-minX)*scale)/1000,(offsetY+(y[j]-minY)*scale)/650])}));
}
export function partialDrawing(events:DrawEvent[],fraction:number){
 const total=events.reduce((n,e)=>n+(e.points?.length||0),0),limit=Math.max(0,Math.floor(total*fraction));let remaining=limit;
 return events.flatMap(e=>{if(remaining<=0)return [];const take=Math.min(remaining,e.points?.length||0);remaining-=take;return [{...e,points:e.points?.slice(0,take)}];});
}
