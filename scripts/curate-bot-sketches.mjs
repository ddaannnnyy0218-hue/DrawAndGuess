import {readFileSync,writeFileSync} from 'node:fs';
import {makeJudge,strokePixels} from '../lib/doodle-judge.js';
import {normaliseSample} from '../lib/bot-players.js';
const model=JSON.parse(readFileSync('public/models/doodlenet/model.json','utf8')),bytes=readFileSync('public/models/doodlenet/group1-shard1of1.bin'),buffer=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),labels=readFileSync('public/models/doodlenet/class_names.txt','utf8').trim().split(/\r?\n/).map(s=>s.replaceAll('_',' '));
const judge=makeJudge(model,buffer,labels),levels=JSON.parse(readFileSync('lib/lexicon.json','utf8'));let samples=0,eligible=0;
for(const [label] of levels){const path='public/drawings/'+label.replaceAll(' ','-')+'.json',data=JSON.parse(readFileSync(path,'utf8'));for(const sample of data.samples){if(!sample.quality){const input=strokePixels(normaliseSample(sample,'#292c25',1)),result=input?judge(input):[],at=result.findIndex(p=>p.label===label),confidence=at<0?0:result[at].confidence;sample.quality={confidence:Math.round(confidence*10000)/10000,rank:at<0?null:at+1};}samples++;if(sample.quality.confidence>=.12)eligible++;}writeFileSync(path,JSON.stringify(data));}
console.log(JSON.stringify({categories:levels.length,realHumanSamples:samples,eligible,notes:'Classifier confidence is a curation heuristic, not a human art score.'}));
