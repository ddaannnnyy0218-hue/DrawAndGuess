import {DrawEvent,renderDrawing,visibleStrokes} from './canvas';
import {sketchPixels} from './sketch-input.js';
import type * as TF from '@tensorflow/tfjs';
let ready:Promise<{tf:typeof TF;model:TF.LayersModel;labels:string[]}>|null=null;
export function prepareRecognizer(){
 if(!ready)ready=(async()=>{
  const tf=await import('@tensorflow/tfjs');
  try{await tf.setBackend('webgl');await tf.ready();}catch{await tf.setBackend('cpu');await tf.ready();}
  const [model,text]=await Promise.all([tf.loadLayersModel('/models/doodlenet/model.json'),fetch('/models/doodlenet/class_names.txt').then(r=>{if(!r.ok)throw new Error('识图词库未加载');return r.text()})]);
  const labels=text.trim().split(/\r?\n/).map(label=>label.replaceAll('_',' '));
  const warm=tf.tidy(()=>model.predict(tf.zeros([1,28,28,1])) as TF.Tensor);await warm.data();warm.dispose();
  return {tf,model,labels};
 })().catch(e=>{ready=null;throw e});
 return ready;
}
export async function classifySketch(events:DrawEvent[]){
 const canvas=document.createElement('canvas');canvas.width=560;canvas.height=364;
 const points=visibleStrokes(events).filter(e=>e.color!=='#fffefb').flatMap(e=>e.points||[]);
 if(!points.length)return [];
 const xs=points.map(p=>p[0]*1000),ys=points.map(p=>p[1]*650);
 const width=Math.max(50,Math.max(...xs)-Math.min(...xs),Math.max(...ys)-Math.min(...ys))*.07;
 const normalized=events.map(e=>e.type==='stroke'?{...e,color:e.color==='#fffefb'?'#fffefb':'#000000',size:e.color==='#fffefb'?Math.max(e.size||30,width*2):width}:e);
 renderDrawing(canvas,normalized);
 const ctx=canvas.getContext('2d');if(!ctx)return [];
 const input=sketchPixels(ctx.getImageData(0,0,560,364).data,560,364);if(!input)return [];
 const {tf,model,labels}=await prepareRecognizer();
 const output=tf.tidy(()=>model.predict(tf.tensor4d(input,[1,28,28,1])) as TF.Tensor);
 try{return Array.from(await output.data()).map((confidence,index)=>({label:labels[index],confidence})).sort((a,b)=>b.confidence-a.confidence).slice(0,5);}
 finally{output.dispose();}
}
