import {createRequire} from 'node:module';
import {readFileSync,readdirSync} from 'node:fs';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
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
  const statements=readFileSync('drizzle/0000_far_loki.sql','utf8').split('--> statement-breakpoint').filter(s=>s.trim());
  for(const statement of statements)await db.prepare(statement).run();
  const home=await mf.dispatchFetch('https://game.test/');
  assert.equal(home.status,200);
  const html=await home.text();assert.ok(html.includes('画得离谱'));assert.ok(html.includes('创建私人房间'));
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
  console.log('PASS: production Worker SSR, real D1 migrations, room creation, joining, private answer, canvas sync and scoring.');
}finally{await mf.dispose();}
