import {createRequire} from 'node:module';
import {readFileSync,readdirSync} from 'node:fs';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {botPersona} from '../lib/bot-players.js';
const require=createRequire(import.meta.url);
const {Miniflare}=createRequire(require.resolve('wrangler/package.json'))('miniflare');
const mf=new Miniflare({
  modules:[
    {type:'ESModule',path:resolve('dist/server/index.js')},
    ...readdirSync('dist/server',{recursive:true}).filter(path=>/\.(m?js)$/.test(path)&&path!=='index.js').map(path=>({type:'ESModule',path:resolve('dist/server',path)})),
  ],
  modulesRoot:resolve('dist/server'),
  compatibilityDate:'2026-05-15',
  compatibilityFlags:['nodejs_compat'],
  d1Databases:{DB:'00000000-0000-4000-8000-000000000000'},
  cf:false,
  assets:{directory:resolve('dist/client'),binding:'ASSETS',routerConfig:{has_user_worker:true,invoke_user_worker_ahead_of_assets:true}},
});
try{
  const db=await mf.getD1Database('DB');
  const statements=readdirSync('drizzle').filter(file=>file.endsWith('.sql')).sort().flatMap(file=>readFileSync('drizzle/'+file,'utf8').split('--> statement-breakpoint').filter(s=>s.trim()));
  for(const statement of statements)await db.prepare(statement).run();
  const home=await mf.dispatchFetch('https://game.test/');
  assert.equal(home.status,200);
  const html=await home.text();assert.ok(html.includes('下一段位'));assert.ok(html.includes('假答案俱乐部'));assert.ok(html.includes('三笔挑战'));assert.equal(/100\s*关/.test(html),false);
  const post=async(body)=>{
    const response=await mf.dispatchFetch('https://game.test/api/game',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://game.test'},body:JSON.stringify(body)});
    const data=await response.json();assert.equal(response.status,200,JSON.stringify(data));return data;
  };
  const host=await post({action:'create',name:'Runtime Host',pack:'everyday'});
  const guest=await post({action:'join',code:host.code,name:'Runtime Guest'});
  const started=await post({action:'start',code:host.code,token:host.token});
  assert.equal(started.state.phase,'choose');
  const selected=await post({action:'select',code:host.code,token:host.token,index:0});
  assert.equal(selected.state.phase,'drawing');
  await post({action:'draw',code:host.code,token:host.token,roundId:selected.state.roundId,events:[{id:'runtime-stroke',key:'runtime-key',type:'stroke',color:'#292c25',size:5,points:[[.1,.1],[.8,.8]]}]});
  const poll=await mf.dispatchFetch('https://game.test/api/game?code='+host.code,{headers:{Authorization:'Bearer '+guest.token}});
  const view=await poll.json();assert.equal(view.state.word,null);assert.equal(view.events.length,1);
  const correct=await post({action:'guess',code:host.code,token:guest.token,text:selected.state.word});
  assert.equal(correct.state.phase,'reveal');
  const model=await mf.dispatchFetch('https://game.test/models/doodlenet/model.json');assert.equal(model.status,200);
  const sample=await mf.dispatchFetch('https://game.test/drawings/cat.json');assert.equal(sample.status,200);
  const create=await mf.dispatchFetch('https://game.test/api/challenge',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://game.test'},body:JSON.stringify({action:'create',name:'Async creator',levelId:21,events:[{id:'async',key:'async',type:'stroke',color:'#292c25',size:8,points:[[.1,.1],[.2,.2],[.3,.3],[.4,.4],[.5,.5],[.6,.6],[.7,.7],[.8,.8]]}]})});
  assert.equal(create.status,200);const challenge=await create.json();
  const info=await mf.dispatchFetch('https://game.test/api/challenge?id='+challenge.id);const detail=await info.json();assert.equal(detail.events,undefined);assert.equal(detail.word,undefined);
  const startAsync=await mf.dispatchFetch('https://game.test/api/challenge',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://game.test'},body:JSON.stringify({action:'start',id:challenge.id,name:'Later friend'})});
  const asyncPlayer=await startAsync.json();assert.equal(startAsync.status,200);assert.equal(asyncPlayer.events.length,1);
  const solve=await mf.dispatchFetch('https://game.test/api/challenge',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://game.test'},body:JSON.stringify({action:'guess',id:challenge.id,attemptId:asyncPlayer.attempt.id,token:asyncPlayer.token,text:'cat'})});
  const solved=await solve.json();assert.equal(solved.attempt.solved,true);
  const rankPost=async(body)=>{const r=await mf.dispatchFetch('https://game.test/api/ranked',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://game.test'},body:JSON.stringify(body)});const d=await r.json();assert.equal(r.status,200,JSON.stringify(d));return d;};
  const account=await rankPost({action:'register',name:'Runtime ranked'}),identity={profileId:account.profile.id,token:account.token};
  const queued=await rankPost({...identity,action:'queue'});assert.ok(queued.matchId);
  const initial=await rankPost({...identity,action:'match'});assert.equal(initial.match.players.length,3);assert.equal(initial.match.players.filter(p=>p.bot).length,2);assert.equal(initial.match.phase,'choose');assert.equal(initial.match.word,null);assert.equal(initial.match.events.length,0);
  // Exercise real shared human strokes and the production bot vision (no recognition stub).
  const row=await db.prepare('SELECT state FROM ranked_matches WHERE id=?').bind(queued.matchId).first(),state=JSON.parse(row.state);
  const raw=JSON.parse(readFileSync('public/drawings/cat.json','utf8')),strokes=raw.samples[raw.preferred||0].drawing;
  const xs=strokes.flatMap(s=>s[0]),ys=strokes.flatMap(s=>s[1]),x0=Math.min(...xs),y0=Math.min(...ys),w=Math.max(...xs)-x0||1,h=Math.max(...ys)-y0||1,k=Math.min(780/w,470/h),ox=(1000-w*k)/2,oy=(650-h*k)/2;
  const catEvents=strokes.map(([x,y],i)=>({type:'stroke',id:String(i),key:String(i),color:'#292c25',size:8,brush:'double',points:x.map((v,j)=>[(ox+(v-x0)*k)/1000,(oy+(y[j]-y0)*k)/650])}));
  state.index=1;state.phase='drawing';state.startedAt=Date.now()-18000;state.deadline=Date.now()+37000;state.rounds[1].level={id:21,label:'cat',word:'猫',chapter:'动物朋友'};for(const [slot,bot] of state.players.filter(p=>p.bot).entries()){bot.persona=botPersona(0,slot,4+slot*313);bot.turn=null;bot.nextThink=0;}state.rounds[1].events=[];state.vision=[];state.visionAt=0;state.visionKey='';
  await db.prepare('UPDATE ranked_matches SET state=?,version=version+1 WHERE id=?').bind(JSON.stringify(state),state.id).run();
  for(let i=0;i<catEvents.length;i+=12)await rankPost({...identity,action:'draw',matchId:state.id,roundId:state.rounds[1].id,events:catEvents.slice(i,i+12)});
  let observed=JSON.parse((await db.prepare('SELECT state FROM ranked_matches WHERE id=?').bind(state.id).first()).state);observed.visionAt=0;await db.prepare('UPDATE ranked_matches SET state=?,version=version+1 WHERE id=?').bind(JSON.stringify(observed),state.id).run();await rankPost({...identity,action:'match'});
  observed=JSON.parse((await db.prepare('SELECT state FROM ranked_matches WHERE id=?').bind(state.id).first()).state);assert.ok(observed.vision.some(p=>p.label==='cat'));for(const bot of observed.players.filter(p=>p.bot)){assert.ok(bot.persona.observe>0&&bot.persona.knowledge<1);assert.equal(bot.pending.label,'cat');bot.pending.at=Date.now()-1;}await db.prepare('UPDATE ranked_matches SET state=?,version=version+1 WHERE id=?').bind(JSON.stringify(observed),state.id).run();
  const guessed=await rankPost({...identity,action:'match'});assert.equal(guessed.match.phase,'reveal');assert.equal(guessed.match.players.find(p=>p.id===identity.profileId).score,100);assert.equal(guessed.match.players.filter(p=>p.done).length,2);assert.equal(guessed.match.events[0].brush,'double');
  const humanIdentities=[];for(const name of ['Human A','Human B','Human C']){const a=await rankPost({action:'register',name});await db.prepare('UPDATE ranked_profiles SET rp=300 WHERE id=?').bind(a.profile.id).run();humanIdentities.push({profileId:a.profile.id,token:a.token});}
  const qa=await rankPost({...humanIdentities[0],action:'queue'}),qb=await rankPost({...humanIdentities[1],action:'queue'});assert.equal(qa.queue.found,1);assert.equal(qb.queue.found,2);const qc=await rankPost({...humanIdentities[2],action:'queue'});assert.ok(qc.matchId);const paired=await rankPost({...humanIdentities[0],action:'match'});assert.equal(paired.match.id,qc.matchId);assert.equal(paired.match.players.filter(p=>p.bot).length,0);
  const bluffHost=await post({action:'create',name:'Bluff Host',mode:'bluff'}),bluff1=await post({action:'join',code:bluffHost.code,name:'Bluff 1'}),bluff2=await post({action:'join',code:bluffHost.code,name:'Bluff 2'});
  const roomAction=(p,action,extra={})=>post({code:bluffHost.code,token:p.token,action,...extra});
  await roomAction(bluffHost,'start');const bword=await roomAction(bluffHost,'select',{index:0});await roomAction(bluffHost,'finishDrawing');await roomAction(bluff1,'bluff',{text:'开着火箭的西瓜'});const vote=await roomAction(bluff2,'bluff',{text:'一只迷路的鲸鱼'});assert.equal(vote.state.phase,'vote');assert.ok(vote.state.options.every(o=>o.correct===undefined&&o.authors===undefined));const trueOption=vote.state.options.find(o=>o.text===bword.state.word);await roomAction(bluff1,'vote',{optionId:trueOption.id});const end=await roomAction(bluff2,'vote',{optionId:trueOption.id});assert.equal(end.state.phase,'reveal');
  console.log('PASS: production Worker homepage, D1 ranked profile/bot match, three-human matching, visible-stroke bot recognition, artist awards, creative brush sync, bluff voting, classic rooms and async challenges.');
}finally{await mf.dispose();}
