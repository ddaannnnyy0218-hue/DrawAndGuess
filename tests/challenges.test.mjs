import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {challengeRequest} from '../lib/challenges.js';
import {LEVELS,matchesLevel,starsFor} from '../lib/levels.js';
import {sketchPixels} from '../lib/sketch-input.js';
function database(){
 const sqlite=new DatabaseSync(':memory:');
 for(const file of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())sqlite.exec(readFileSync('drizzle/'+file,'utf8').replaceAll('--> statement-breakpoint',''));
 return {sqlite,prepare(sql){const stmt=sqlite.prepare(sql);function bound(args=[]){return {bind(...values){return bound(values)},async first(){return stmt.get(...args)||null},async all(){return {results:stmt.all(...args)}},async run(){const r=stmt.run(...args);return {meta:{changes:Number(r.changes)}}}}}return bound()},
 async batch(list){sqlite.exec('BEGIN');try{const out=[];for(const stmt of list)out.push(await stmt.run());sqlite.exec('COMMIT');return out}catch(e){sqlite.exec('ROLLBACK');throw e}}};
}
const drawing=[{type:'stroke',id:'s1',key:'s1',color:'#292c25',size:8,points:[[.1,.1],[.2,.2],[.3,.3],[.4,.3],[.5,.4],[.6,.5],[.7,.4],[.8,.6]]}];
async function post(db,body,now=Date.now(),origin){const response=await challengeRequest(new Request('https://game.test/api/challenge',{method:'POST',headers:{'Content-Type':'application/json',...(origin?{Origin:origin}:{})},body:JSON.stringify(body)}),db,now);return {status:response.status,...await response.json()};}
async function get(db,query,token,now=Date.now()){const response=await challengeRequest(new Request('https://game.test/api/challenge?'+new URLSearchParams(query),{headers:token?{Authorization:'Bearer '+token}:{}}),db,now);return {status:response.status,...await response.json()};}
async function fixture(){const db=database(),now=Date.now();const challenge=await post(db,{action:'create',levelId:21,name:'Creator',events:drawing},now);return {db,now,id:challenge.id};}
test('100 distinct levels have matching assets, model labels, chapters and normalized aliases',()=>{
 assert.equal(LEVELS.length,100);assert.equal(new Set(LEVELS.map(l=>l.label)).size,100);
 const labels=new Set(readFileSync('public/models/doodlenet/class_names.txt','utf8').trim().split(/\r?\n/).map(s=>s.replaceAll('_',' ')));
 for(const level of LEVELS){assert.ok(labels.has(level.label),level.label);const data=JSON.parse(readFileSync('public/drawings/'+level.label.replaceAll(' ','-')+'.json'));assert.ok(data.samples.length);assert.equal(data.label,level.label);}
 assert.equal(matchesLevel(LEVELS[70],' BIKE! '),true);assert.equal(matchesLevel(LEVELS[20],'猫咪'),true);
 assert.equal(starsFor(10,40,0),3);assert.equal(starsFor(39,40,1),1);
});
test('a saved challenge can be opened hours later without the creator online',async()=>{
 const f=await fixture();const info=await get(f.db,{id:f.id},null,f.now+6*3600000);
 assert.equal(info.status,200);assert.equal(info.creator,'Creator');assert.equal(info.word,undefined);assert.equal(info.levelId,undefined);assert.equal(info.events,undefined);
 const started=await post(f.db,{id:f.id,action:'start',name:'Late friend'},f.now+6*3600000);
 assert.equal(started.status,200);assert.equal(started.events.length,1);assert.equal(started.attempt.word,null);assert.equal(started.attempt.deadline,started.attempt.now+60000);
});
test('separate asynchronous attempts hide answers and require their own secret token',async()=>{
 const f=await fixture(),a=await post(f.db,{id:f.id,action:'start',name:'A'},f.now);
 const b=await post(f.db,{id:f.id,action:'start',name:'B'},f.now);
 const privateRead=await get(f.db,{id:f.id,action:'attempt',attemptId:a.attempt.id},b.token,f.now+1000);assert.equal(privateRead.status,401);
 const resumed=await get(f.db,{id:f.id,action:'attempt',attemptId:a.attempt.id},a.token,f.now+1000);assert.equal(resumed.attempt.name,'A');assert.equal(resumed.attempt.word,null);
});
test('a correct guess stores a score once, reveals the answer and updates the challenge board',async()=>{
 const f=await fixture(),a=await post(f.db,{id:f.id,action:'start',name:'Friend'},f.now);
 const params={id:f.id,attemptId:a.attempt.id,token:a.token,action:'guess',text:'猫咪'};
 const result=await post(f.db,params,f.now+5000);assert.equal(result.attempt.solved,true);assert.equal(result.attempt.score,190);assert.equal(result.attempt.word,'猫');
 const again=await post(f.db,params,f.now+10000);assert.equal(again.attempt.score,190);
 const board=await get(f.db,{id:f.id},null,f.now+10001);assert.deepEqual(board.board,[{name:'Friend',score:190}]);
});
test('timeouts reveal the answer without awarding solved points',async()=>{
 const f=await fixture(),a=await post(f.db,{id:f.id,action:'start',name:'Friend'},f.now);
 const expired=await get(f.db,{id:f.id,action:'attempt',attemptId:a.attempt.id},a.token,f.now+61000);
 assert.equal(expired.attempt.finished,true);assert.equal(expired.attempt.solved,false);assert.equal(expired.attempt.score,0);assert.equal(expired.attempt.word,'猫');
});
test('a hint has a score cost and never discloses a single-character answer',async()=>{
 const f=await fixture(),a=await post(f.db,{id:f.id,action:'start',name:'Friend'},f.now);
 const params={id:f.id,attemptId:a.attempt.id,token:a.token};
 const hint=await post(f.db,{...params,action:'hint'},f.now+1000);
 assert.equal(hint.attempt.word,null);assert.equal(hint.attempt.hints,1);assert.equal(hint.attempt.hint.includes('猫'),false);
 const correct=await post(f.db,{...params,action:'guess',text:'cat'},f.now+5000);assert.equal(correct.attempt.score,160);
});
test('concurrent submissions cannot double-count one attempt',async()=>{
 const f=await fixture(),a=await post(f.db,{id:f.id,action:'start',name:'Friend'},f.now);
 const params={id:f.id,attemptId:a.attempt.id,token:a.token,action:'guess',text:'cat'};
 const both=await Promise.all([post(f.db,params,f.now+5000),post(f.db,params,f.now+5000)]);
 assert.ok(both.every(result=>result.attempt.score===190));
 const board=await get(f.db,{id:f.id},null,f.now+6000);assert.equal(board.board.length,1);
});
test('invalid drawings, cross-origin writes, and expired links are rejected',async()=>{
 const db=database(),now=Date.now();
 assert.equal((await post(db,{action:'create',levelId:1,name:'X',events:[]},now)).status,400);
 assert.equal((await post(db,{action:'create',levelId:1,name:'X',events:drawing},now,'https://wrong.test')).status,403);
 assert.equal((await post(db,{action:'create',levelId:1,name:'X',events:[{...drawing[0],points:[[5,0]]}]},now)).status,400);
 const f=await fixture();assert.equal((await get(f.db,{id:f.id},null,f.now+8*86400000)).status,410);
});
test('blank canvases produce no classification input and geometry normalization ignores empty margins',()=>{
 const white=new Uint8ClampedArray(60*40*4).fill(255);assert.equal(sketchPixels(white,60,40),null);
 for(let y=10;y<30;y++)for(let x=20;x<40;x++){const i=(y*60+x)*4;white[i]=0;white[i+1]=0;white[i+2]=0;}
 const input=sketchPixels(white,60,40);assert.equal(input.length,784);assert.ok(input.every(v=>v>=0&&v<=1));assert.ok(input.reduce((n,v)=>n+v,0)>100);
});
