import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import * as tf from '@tensorflow/tfjs';
import {makeJudge,strokePixels} from '../lib/doodle-judge.js';
await tf.setBackend('cpu');
const manifest=JSON.parse(readFileSync('public/models/doodlenet/model.json','utf8')),weights=readFileSync('public/models/doodlenet/group1-shard1of1.bin'),buffer=weights.buffer.slice(weights.byteOffset,weights.byteOffset+weights.byteLength),labels=readFileSync('public/models/doodlenet/class_names.txt','utf8').trim().split(/\r?\n/).map(s=>s.replaceAll('_',' '));
const judge=makeJudge(manifest,buffer,labels);
const model=await tf.loadLayersModel(tf.io.fromMemory({modelTopology:manifest.modelTopology,weightSpecs:manifest.weightsManifest[0].weights,weightData:buffer}));
let correct=0;
for(const label of ['circle','cat','bicycle','umbrella','teapot','flower','apple','fish','car','clock']){
 const data=JSON.parse(readFileSync('public/drawings/'+label+'.json','utf8')),strokes=data.samples[data.preferred||0].drawing;
 const xs=strokes.flatMap(s=>s[0]),ys=strokes.flatMap(s=>s[1]),x0=Math.min(...xs),y0=Math.min(...ys),w=Math.max(...xs)-x0||1,h=Math.max(...ys)-y0||1,k=Math.min(780/w,470/h),ox=(1000-w*k)/2,oy=(650-h*k)/2;
 const events=strokes.map(([x,y],i)=>({type:'stroke',id:String(i),key:String(i),color:'#292c25',size:8,points:x.map((v,j)=>[(ox+(v-x0)*k)/1000,(oy+(y[j]-y0)*k)/650])}));
 const input=strokePixels(events),t0=performance.now(),result=judge(input),ms=performance.now()-t0;
 const output=tf.tidy(()=>model.predict(tf.tensor4d(input,[1,28,28,1]))),values=await output.data();output.dispose();const reference=Array.from(values).map((confidence,i)=>({label:labels[i],confidence})).sort((a,b)=>b.confidence-a.confidence);
 assert.equal(result[0].label,reference[0].label,'CPU forward pass must match TensorFlow');assert.ok(Math.abs(result[0].confidence-reference[0].confidence)<.001);
 const pass=result.slice(0,3).some(p=>p.label===label&&p.confidence>=.15);if(pass)correct++;console.log(label,JSON.stringify(result.slice(0,3).map(p=>({label:p.label,p:Math.round(p.confidence*1000)/1000}))),Math.round(ms)+'ms',pass?'OK':'CHECK');
}
assert.ok(correct>=9,'At least 9/10 fixed fixtures must be accepted; this is not a player accuracy claim.');
console.log('PASS: authoritative CPU judge matches TensorFlow, accepts '+correct+'/10 fixed drawing fixtures.');model.dispose();
