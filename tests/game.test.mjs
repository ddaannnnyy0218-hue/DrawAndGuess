import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {gameRequest} from '../lib/game.js';
import {WORDS} from '../lib/words.js';

// Execute the real schema and game handlers against SQLite, using D1's interface.
function database(){
  const sqlite=new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('../drizzle/0000_far_loki.sql',import.meta.url),'utf8').replaceAll('--> statement-breakpoint',''));
  return {sqlite,prepare(sql){
    const stmt=sqlite.prepare(sql);
    function bound(args=[]){return {
      bind(...values){return bound(values)},
      async first(){return stmt.get(...args)||null},
      async all(){return {results:stmt.all(...args)}},
      async run(){const r=stmt.run(...args);return {meta:{changes:Number(r.changes),last_row_id:Number(r.lastInsertRowid)}}},
    }}return bound();
  },async batch(statements){sqlite.exec('BEGIN');try{const results=[];for(const stmt of statements)results.push(await stmt.run());sqlite.exec('COMMIT');return results}catch(e){sqlite.exec('ROLLBACK');throw e}}};
}
async function post(db,body,now,origin){
  const request=new Request('https://game.test/api/game',{method:'POST',headers:{'Content-Type':'application/json',...(origin?{Origin:origin}:{})},body:JSON.stringify(body)});
  const response=await gameRequest(request,db,now);return {status:response.status,...await response.json()};
}
async function get(db,s,now,extra=''){
  const response=await gameRequest(new Request('https://game.test/api/game?code='+s.code+extra,{headers:{Authorization:'Bearer '+s.token}}),db,now);
  return {status:response.status,...await response.json()};
}
async function room(count=3,pack='everyday'){
  const db=database();const now=Date.now();const players=[];
  const host=await post(db,{action:'create',name:'Host',avatar:0,pack},now);players.push(host);
  for(let n=1;n<count;n++)players.push(await post(db,{action:'join',code:host.code,name:'Player '+n,avatar:n},now));
  const call=(index,action,extra={},time=now+100)=>post(db,{code:host.code,token:players[index].token,action,...extra},time);
  const start=await call(0,'start');
  return {db,now,players,call,start};
}
test('room access, hidden answers and private word choices',async()=>{
  const r=await room();
  assert.equal(r.start.status,200);assert.equal(r.start.state.phase,'choose');
  const own=await get(r.db,r.players[0],r.now+200);const other=await get(r.db,r.players[1],r.now+200);
  assert.equal(own.state.choices.length,3);assert.deepEqual(other.state.choices,[]);assert.equal(other.state.word,null);
  await r.call(0,'select',{index:0});
  const drawing=await get(r.db,r.players[0],r.now+300);
  const guesser=await get(r.db,r.players[1],r.now+300);
  assert.ok(drawing.state.word);assert.equal(guesser.state.word,null);
  assert.equal(JSON.stringify(guesser).includes(r.players[0].token),false);
  assert.equal((await get(r.db,{...r.players[1],token:'wrong'},r.now+300)).status,401);
  assert.equal((await r.call(1,'select',{index:0})).status,403);
});
test('hosts can use a custom word deck; invalid decks and guest edits are rejected',async()=>{const db=database(),now=Date.now(),host=await post(db,{action:'create',name:'Host'},now),guest=await post(db,{action:'join',name:'Guest',code:host.code},now+1),settings={action:'settings',code:host.code,pack:'everyday',seconds:40,cycles:1,mode:'classic'};
 assert.equal((await post(db,{...settings,token:guest.token,customWords:'宇航员、月球基地、太空早餐'},now+100)).status,403);
 assert.equal((await post(db,{...settings,token:host.token,customWords:'一个、两个'},now+200)).status,400);
 const saved=await post(db,{...settings,token:host.token,customWords:'宇航员、月球基地、太空早餐、宇航员'},now+300);assert.deepEqual(saved.state.settings.customWords,['宇航员','月球基地','太空早餐']);
 const start=await post(db,{action:'start',code:host.code,token:host.token},now+400);assert.equal(start.state.choices.length,3);assert.ok(start.state.choices.every(w=>saved.state.settings.customWords.includes(w)));const selected=await post(db,{action:'select',code:host.code,token:host.token,index:0},now+500);const guessed=await post(db,{action:'guess',code:host.code,token:guest.token,text:selected.state.word},now+5000);assert.equal(guessed.state.phase,'reveal');
});
test('correct guesses award both players once and never reveal a live answer in chat',async()=>{
  const r=await room();await r.call(0,'select',{index:0});
  const word=(await get(r.db,r.players[0],r.now+200)).state.word;
  const first=await r.call(1,'guess',{text:word},r.now+1000);
  assert.equal(first.status,200);assert.equal(first.state.word,null);
  assert.ok(first.state.players.find(p=>p.id===r.players[1].playerId).score>100);
  assert.equal(first.state.players.find(p=>p.id===r.players[0].playerId).score,50);
  assert.equal(first.state.chat.some(c=>c.text===word),false);
  const duplicate=await r.call(1,'guess',{text:word},r.now+1500);assert.equal(duplicate.status,400);
  const last=await r.call(2,'guess',{text:word},r.now+1500);
  assert.equal(last.state.phase,'reveal');assert.equal(last.state.word,word);
  assert.equal(last.state.players.find(p=>p.id===r.players[0].playerId).score,100);
});
test('stroke sync is incremental, idempotent, normalized, and limited to the current drawer',async()=>{
  const r=await room();const select=await r.call(0,'select',{index:0});const roundId=select.state.roundId;
  const event={type:'stroke',id:crypto.randomUUID(),key:crypto.randomUUID(),color:'#292c25',size:5,points:[[0.1,0.2],[0.4,0.5]]};
  assert.equal((await r.call(1,'draw',{events:[event],roundId})).status,403);
  assert.equal((await r.call(0,'draw',{events:[{...event,points:[[2,0]]}],roundId})).status,400);
  assert.equal((await r.call(0,'draw',{events:[event],roundId})).status,200);
  assert.equal((await r.call(0,'draw',{events:[event],roundId})).status,200);
  const snapshot=await get(r.db,r.players[1],r.now+200);assert.equal(snapshot.events.length,1);
  const delta=await get(r.db,r.players[1],r.now+250,'&round='+roundId+'&cursor='+snapshot.events[0].seq);assert.equal(delta.events.length,0);
  const refresh=await get(r.db,r.players[1],r.now+300);assert.equal(refresh.events.length,1);
  assert.equal((await r.call(0,'draw',{events:[event],roundId:'past-round'})).status,403);
});
test('all players take a turn and the completed gallery is available',async()=>{
  const r=await room(2);let time=r.now+1000;
  for(let drawer=0;drawer<2;drawer++){
    const selected=await r.call(drawer,'select',{index:0},time);
    assert.equal(selected.state.phase,'drawing');
    const event={type:'stroke',id:crypto.randomUUID(),key:crypto.randomUUID(),color:'#292c25',size:5,points:[[.2,.2],[.7,.7]]};
    await r.call(drawer,'draw',{events:[event],roundId:selected.state.roundId},time+50);
    const guessed=await r.call(1-drawer,'guess',{text:selected.state.word},time+100);
    assert.equal(guessed.state.phase,'reveal');
    time+=7000;const next=await get(r.db,r.players[0],time);
    assert.equal(next.state.phase,drawer===0?'choose':'finished');
  }
  const gallery=await get(r.db,r.players[1],time+100,'&action=gallery');
  assert.equal(gallery.history.length,2);assert.equal(gallery.events.length,2);
  const again=await r.call(0,'start',{},time+200);assert.equal(again.state.phase,'choose');assert.equal(again.state.history.length,0);assert.ok(again.state.players.every(p=>p.score===0));
});
test('timeouts auto-select, reveal, and progress without a browser timer being authoritative',async()=>{
  const r=await room(2);
  await get(r.db,r.players[1],r.now+14000);
  const auto=await get(r.db,r.players[0],r.now+16000);
  assert.equal(auto.state.phase,'drawing');assert.ok(auto.state.word);
  await get(r.db,r.players[1],r.now+40000);await get(r.db,r.players[0],r.now+40000);
  const reveal=await get(r.db,r.players[1],r.now+57000);assert.equal(reveal.state.phase,'reveal');
  const next=await get(r.db,r.players[0],r.now+64000);assert.equal(next.state.phase,'choose');assert.equal(next.state.turn,2);
});
test('host departure migrates ownership and skips an abandoned drawing',async()=>{
  const r=await room(3);await r.call(0,'select',{index:0});
  const departed=await r.call(0,'leave');assert.equal(departed.state.phase,'reveal');
  assert.equal(departed.state.hostId,r.players[1].playerId);assert.equal(departed.state.history[0].reason,'left');
  const current=await get(r.db,r.players[1],r.now+7000);assert.equal(current.state.phase,'choose');assert.equal(current.state.drawerId,r.players[1].playerId);
  assert.equal((await get(r.db,r.players[0],r.now+7100)).status,401);
});
test('a silent host is replaced after the reconnect grace period',async()=>{
  const r=await room(3);
  await get(r.db,r.players[1],r.now+20000);await get(r.db,r.players[2],r.now+20000);
  await get(r.db,r.players[1],r.now+40000);await get(r.db,r.players[2],r.now+40000);
  const migrated=await get(r.db,r.players[1],r.now+47000);
  assert.equal(migrated.state.hostId,r.players[1].playerId);
  assert.equal(migrated.state.players.find(p=>p.id===r.players[0].playerId).online,false);
});
test('concurrent correct answers preserve scores through optimistic locking',async()=>{
  const r=await room(4);const selected=await r.call(0,'select',{index:0});
  const answers=await Promise.all([1,2,3].map(n=>r.call(n,'guess',{text:selected.state.word},r.now+1000)));
  assert.ok(answers.every(a=>a.status===200));
  const final=await get(r.db,r.players[0],r.now+1100);assert.equal(final.state.phase,'reveal');assert.equal(final.state.guessed.length,3);
  assert.equal(final.state.players.find(p=>p.id===r.players[0].playerId).score,150);
});
test('different rooms, permissions, full rooms and mid-game joins remain isolated',async()=>{
  const r=await room(8);const stranger=await post(r.db,{action:'create',name:'Outside'},r.now);
  assert.equal((await get(r.db,{...stranger,code:r.players[0].code},r.now+200)).status,401);
  assert.equal((await post(r.db,{action:'join',code:r.players[0].code,name:'Late'},r.now+200)).status,400);
  assert.equal((await r.call(1,'kick',{playerId:r.players[2].playerId})).status,403);
  assert.equal((await r.call(1,'settings',{pack:'everyday',seconds:30,cycles:1})).status,403);
});
test('cross-origin writes and invalid room or brush data are rejected',async()=>{
  const db=database(),now=Date.now();
  assert.equal((await post(db,{action:'create',name:'X'},now,'https://wrong.test')).status,403);
  const invalid=await gameRequest(new Request('https://game.test/api/game?code=BAD'),db,now);assert.equal(invalid.status,400);
  const missing=await gameRequest(new Request('https://game.test/api/game?code=ABCDEF'),db,now);assert.equal(missing.status,404);
});
test('English answers normalize case, spacing and configured aliases',async()=>{
  const r=await room(2,'english');
  const row=r.db.sqlite.prepare('SELECT state FROM game_rooms WHERE code=?').get(r.players[0].code);
  const state=JSON.parse(row.state);state.choices=[WORDS.english.find(e=>e.word==='bicycle')];
  r.db.sqlite.prepare('UPDATE game_rooms SET state=? WHERE code=?').run(JSON.stringify(state),state.code);
  await r.call(0,'select',{index:0});
  const result=await r.call(1,'guess',{text:' BIKE! '},r.now+1000);assert.equal(result.state.phase,'reveal');
});
test('old inactive rooms and their strokes are cleaned when a new room is created',async()=>{
  const r=await room(2);await r.call(0,'select',{index:0});
  await r.call(0,'draw',{roundId:r.start.state.roundId,events:[{type:'clear',id:'clear',key:'clear'}]});
  await post(r.db,{action:'create',name:'Tomorrow'},r.now+25*60*60*1000);
  assert.equal(r.db.sqlite.prepare('SELECT COUNT(*) as n FROM game_rooms WHERE code=?').get(r.players[0].code).n,0);
  assert.equal(r.db.sqlite.prepare('SELECT COUNT(*) as n FROM draw_events WHERE code=?').get(r.players[0].code).n,0);
});
