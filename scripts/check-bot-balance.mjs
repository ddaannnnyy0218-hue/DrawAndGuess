import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import assert from 'node:assert/strict';
import {BASE_WORDS,wordHint} from '../lib/vocabulary.js';
import {botPersona,botSketch,botTurn,thinkBot,advanceBotDrawing,botDrawingAt} from '../lib/bot-players.js';
import {makeJudge,strokePixels} from '../lib/doodle-judge.js';
import {matchesLevel} from '../lib/levels.js';
const model=JSON.parse(readFileSync('public/models/doodlenet/model.json','utf8')),bytes=readFileSync('public/models/doodlenet/group1-shard1of1.bin'),labels=readFileSync('public/models/doodlenet/class_names.txt','utf8').trim().split(/\r?\n/).map(s=>s.replaceAll('_',' '));
const judge=makeJudge(model,bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),labels),assets=async path=>new Response(readFileSync('public'+path));
const ranks=[0,250,550,950,1500,2100],stats=ranks.map(rp=>({rp,attempts:0,solved:0,wrong:0,guessed:0,times:[],firstTimes:[],styles:[{games:0,solved:0,firstTimes:[]},{games:0,solved:0,firstTimes:[]}]}));
// Fixed real human traces, with varied shapes and clarity. This is a regression
// benchmark, not an estimate of real player win rates or live model accuracy.
const fixtures=BASE_WORDS.filter((_,i)=>i%3===1),snapshots=[3000,6000,9000,12000,16000,20000,26000,32000,40000,48000,54000];
let seen=0;
for(const word of fixtures){const seed=12311+seen*137,plan=await botSketch(word,botPersona(550,0,seed),seed,assets),round={plan},vision=snapshots.map(t=>{advanceBotDrawing(round,t,true);const input=strokePixels(botDrawingAt(round,t));return input?judge(input).map(p=>({...p,region:'whole'})):[];});
 for(let rank=0;rank<ranks.length;rank++)for(let slot=0;slot<2;slot++)for(let repeat=0;repeat<8;repeat++){
  const persona=botPersona(ranks[rank],slot,2003+repeat*977+slot*113),turn=botTurn(persona,'fixture:'+word.id,0),p={persona,turn,tried:[],tries:0,nextThink:turn.readyAt,pending:null},row=stats[rank];row.attempts++;row.styles[slot].games++;
  for(let now=1000;now<55000;now+=500){let index=snapshots.findLastIndex(t=>t<=now);const reply=thinkBot(p,index<0?[]:vision[index],now,{hint:wordHint(word,now,55),chapter:word.chapter});if(!reply)continue;if(p.tries===1){row.guessed++;row.firstTimes.push(now);row.styles[slot].firstTimes.push(now);}
   if(matchesLevel(word,reply.text)){row.solved++;row.styles[slot].solved++;row.times.push(now);break;}row.wrong++;
  }
 }
 seen++;if(seen%25===0)console.log('Calibrated '+seen+'/'+fixtures.length+' real drawing fixtures');
}
const median=times=>times.length?times.sort((a,b)=>a-b)[Math.floor(times.length/2)]/1000:null;
const result=stats.map(row=>({rp:row.rp,simulatedRounds:row.attempts,attemptedPercent:+(row.guessed/row.attempts*100).toFixed(1),solvedPercent:+(row.solved/row.attempts*100).toFixed(1),medianFirstSeconds:median(row.firstTimes),medianCorrectSeconds:median(row.times),wrongGuessesPerRound:+(row.wrong/row.attempts).toFixed(2),slowStyleFirstSeconds:median(row.styles[0].firstTimes),quickStyleFirstSeconds:median(row.styles[1].firstTimes)}));
assert.ok(result.every(r=>r.attemptedPercent>=85),'Visible drawings should normally provoke an answer, even an uncertain one');
assert.ok(result[0].medianFirstSeconds>=8,'Bronze bots need real observation time');
// Early guesses can be speculative. Experts should solve sooner with fewer mistakes, not spam the first answer.
assert.ok(result.at(-1).medianCorrectSeconds<=result[0].medianCorrectSeconds-4,'Higher ranks must reach a correct interpretation sooner');
assert.ok(result.at(-1).wrongGuessesPerRound<result[0].wrongGuessesPerRound,'Higher ranks must make fewer false interpretations');
assert.ok(result[0].slowStyleFirstSeconds>result[0].quickStyleFirstSeconds,'Same-table bots need independent rhythms');
const report={fixtures:fixtures.length,totalSimulatedRounds:stats.reduce((s,r)=>s+r.attempts,0),scope:'Fixed real-human trace replay regression; not live human win rates.',bands:result};
mkdirSync('node_modules/.cache',{recursive:true});writeFileSync('node_modules/.cache/bot-balance.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
