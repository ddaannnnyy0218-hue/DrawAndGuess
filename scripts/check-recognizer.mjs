import * as tf from '@tensorflow/tfjs';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {sketchPixels} from '../lib/sketch-input.js';
import {LEVELS} from '../lib/levels.js';
const require=createRequire(import.meta.url);
const mfRequire=createRequire(createRequire(require.resolve('wrangler/package.json')).resolve('miniflare'));
const sharp=mfRequire('sharp');
const json=JSON.parse(fs.readFileSync('public/models/doodlenet/model.json','utf8'));
const bytes=fs.readFileSync('public/models/doodlenet/group1-shard1of1.bin');
const model=await tf.loadLayersModel(tf.io.fromMemory({modelTopology:json.modelTopology,weightSpecs:json.weightsManifest.flatMap(group=>group.weights),weightData:bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)}));
const labels=fs.readFileSync('public/models/doodlenet/class_names.txt','utf8').trim().split(/\r?\n/).map(s=>s.replaceAll('_',' '));
const write=process.argv.includes('--select-samples');
let topOne=0,topThree=0;const failures=[];
for(const level of LEVELS){
 const path='public/drawings/'+level.label.replaceAll(' ','-')+'.json',data=JSON.parse(fs.readFileSync(path,'utf8'));
 let best=null;
 const indices=write?data.samples.map((_,i)=>i):[data.preferred||0];
 for(const index of indices){
  const paths=data.samples[index].drawing.map(([x,y])=>'<polyline points="'+x.map((n,i)=>n+','+y[i]).join(' ')+'" fill="none" stroke="black" stroke-width="'+(process.env.STROKE_WIDTH||18)+'" stroke-linecap="round" stroke-linejoin="round"/>').join('');
  const svg='<svg xmlns="http://www.w3.org/2000/svg" width="560" height="560" viewBox="-12 -12 280 280"><rect x="-12" y="-12" width="280" height="280" fill="white"/>'+paths+'</svg>';
  const {data:rgba,info}=await sharp(Buffer.from(svg)).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const input=sketchPixels(rgba,info.width,info.height);
  if(!input)continue;
  const output=tf.tidy(()=>model.predict(tf.tensor4d(Float32Array.from(input,v=>Math.min(1,v*Number(process.env.INK_GAIN||1))),[1,28,28,1])));
  const probabilities=Array.from(await output.data());output.dispose();
  const ranked=probabilities.map((p,i)=>({label:labels[i],p})).sort((a,b)=>b.p-a.p);
  const score=ranked.find(c=>c.label===level.label)?.p||0;
  if(!best||score>best.score)best={index,score,rank:ranked.findIndex(c=>c.label===level.label),top:ranked.slice(0,3)};
  if(best.rank===0&&best.score>.7)break;
 }
 if(!best)throw new Error('No valid pixels for '+level.label);
 if(write){data.preferred=best.index;fs.writeFileSync(path,JSON.stringify(data));}
 if(best.rank===0)topOne++;if(best.rank<3)topThree++;else failures.push({level:level.id,label:level.label,predicted:best.top.map(r=>r.label)});
 if(level.id%10===0)console.log('checked',level.id,'top1',topOne,'top3',topThree);
}
const blank=sketchPixels(new Uint8ClampedArray(32*32*4).fill(255),32,32);if(blank!==null)throw new Error('Blank input must not classify');
console.log(JSON.stringify({levels:LEVELS.length,topOne,topThree,failures}));
model.dispose();
if(topThree<90)process.exitCode=1;
