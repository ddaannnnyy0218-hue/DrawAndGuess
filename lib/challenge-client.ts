import type {DrawEvent} from './canvas';
export async function publishDrawing(levelId:number,events:DrawEvent[],name:string){
 const response=await fetch('/api/challenge',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'create',levelId,events,name}),signal:AbortSignal.timeout(15000)});
 const data=await response.json() as {id?:string;error?:string};
 if(!response.ok||!data.id)throw new Error(data.error||'挑战还没保存成功，请重试。');
 const url=location.origin+location.pathname+'?challenge='+data.id;
 let copied=false;try{await navigator.clipboard.writeText(url);copied=true}catch{}
 return {url,copied};
}
