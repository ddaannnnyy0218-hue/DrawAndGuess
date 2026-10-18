import {PACKS, WORDS} from './words.js';

export class GameError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
const assert = (ok, message, status) => { if (!ok) throw new GameError(message, status); };
const clean = (value, max) => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);
const normalize = value => String(value).normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');
const active = (p, now) => !p.left && now - p.seen < 45000;
const choose = (words, n) => [...words].sort(() => Math.random() - 0.5).slice(0, n);
const token = () => crypto.randomUUID() + crypto.randomUUID();
const colors = ['#c6e77c', '#c6d8fc', '#ffc4b6', '#ffd489', '#d5c5f1', '#b8e6dd', '#f5b9d6', '#d9dfad'];
function player(name, avatar, now) {
  return {id:crypto.randomUUID(), token:token(), name:clean(name, 16) || '无名画家', avatar:Math.trunc(Math.max(0, Math.min(7, Number(avatar) || 0))), score:0, seen:now, left:false};
}
function notice(s, text, now, type = 'system') {
  s.chat.push({id:crypto.randomUUID(), name:'', text, type, at:now});
  s.chat = s.chat.slice(-45);
}
function authenticate(s, auth) {
  const p = s.players.find(p => p.token === auth && !p.left);
  assert(p, '你已离开这个房间，请重新加入。', 401);
  return p;
}
function endRound(s, now, reason = 'time') {
  if (s.phase !== 'drawing' && s.phase !== 'choose') return;
  if (!s.answer) s.answer = s.choices[0];
  s.phase = 'reveal'; s.deadline = now + 6000;
  s.history.push({roundId:s.roundId, word:s.answer.word, drawerId:s.drawerId, drawerName:s.players.find(p => p.id === s.drawerId)?.name || '画家', guessed:[...s.guessed], reason});
  notice(s, '这一幅的答案是「' + s.answer.word + '」', now);
}
function nextRound(s, now) {
  s.turn++;
  while (s.turn < s.order.length && !s.players.some(p => p.id === s.order[s.turn] && active(p, now))) s.turn++;
  if (s.turn >= s.order.length) { s.phase = 'finished'; s.deadline = 0; s.drawerId = ''; return; }
  s.roundId = crypto.randomUUID(); s.drawerId = s.order[s.turn];
  s.guessed = []; s.answer = null; s.choices = choose(WORDS[s.settings.pack], 3);
  s.phase = 'choose'; s.deadline = now + 15000; s.eventCount = 0;
  notice(s, '轮到 ' + s.players.find(p => p.id === s.drawerId)?.name + ' 画画了', now);
}
export function advance(s, now) {
  let changed = false;
  const online = s.players.filter(p => active(p, now));
  if (!online.some(p => p.id === s.hostId) && online.length) { s.hostId = online[0].id; changed = true; }
  if (['choose','drawing','reveal'].includes(s.phase) && online.length < 2) {
    s.phase = 'finished'; s.deadline = 0; notice(s, '在线人数不足，本局已结束。邀请朋友再开一局吧。', now); return true;
  }
  if (['choose','drawing'].includes(s.phase) && !online.some(p => p.id === s.drawerId)) {
    endRound(s, now, 'left'); changed = true;
  }
  if (s.phase === 'drawing' && online.filter(p=>p.id!==s.drawerId).every(p=>s.guessed.includes(p.id))) {
    endRound(s, now, 'all-guessed'); changed = true;
  }
  if (s.phase === 'choose' && now >= s.deadline) {
    s.answer = s.choices[0]; s.phase = 'drawing'; s.deadline = now + s.settings.seconds * 1000; changed = true;
  } else if (s.phase === 'drawing' && now >= s.deadline) {
    endRound(s, now); changed = true;
  } else if (s.phase === 'reveal' && now >= s.deadline) {
    nextRound(s, now); changed = true;
  }
  return changed;
}
export function publicState(s, viewerId, now) {
  const drawer = s.drawerId === viewerId;
  const showAnswer = drawer || ['reveal','finished'].includes(s.phase);
  return {
    code:s.code, revision:s.revision||0, phase:s.phase, hostId:s.hostId, settings:s.settings,
    players:s.players.filter(p => !p.left).map(({id,name,avatar,score,seen}) => ({id,name,avatar,score,online:now-seen<45000,color:colors[avatar]})),
    me:viewerId, drawerId:s.drawerId, turn:s.turn+1, total:s.order.length,
    roundId:s.roundId, deadline:s.deadline, now, guessed:s.guessed,
    word:showAnswer ? s.answer?.word || null : null,
    hint:s.answer ? [...s.answer.word].map(c => c === ' ' ? ' ' : '＿').join(' ') : '',
    choices:drawer && s.phase === 'choose' ? s.choices.map(c=>c.word) : [],
    chat:s.chat,
    history:s.history.map(h=>({...h})),
  };
}
export async function readRoom(db, code) {
  const row = await db.prepare('SELECT state, version, updated_at FROM game_rooms WHERE code = ?').bind(code).first();
  assert(row, '没有找到这个房间，检查房间码或创建一个新房间。', 404);
  return {state:JSON.parse(row.state), version:row.version};
}
export async function mutateRoom(db, code, fn, now) {
  for (let tries=0; tries<8; tries++) {
    const {state,version} = await readRoom(db, code);
    state.revision = version + 1;
    const result = fn(state);
    const update = await db.prepare('UPDATE game_rooms SET state = ?, version = version + 1, updated_at = ? WHERE code = ? AND version = ?')
      .bind(JSON.stringify(state), now, code, version).run();
    if (update.meta.changes === 1) return {state, result};
  }
  throw new GameError('房间有点忙，请再试一次。', 409);
}
function codeValue(value) {
  const code = clean(value, 6).toUpperCase();
  assert(/^[A-Z2-9]{6}$/.test(code), '请输入 6 位房间码。');
  return code;
}
export async function gameRequest(request, db, now = Date.now()) {
  try {
    assert(db, '游戏服务器正在准备，请稍后再试。', 503);
    const url = new URL(request.url);
    let body = {};
    if (request.method === 'POST') {
      const origin = request.headers.get('origin');
      assert(!origin || origin === url.origin, '无法从这个页面提交操作。', 403);
      const raw = await request.text(); assert(raw.length < 100000, '这次绘画数据太大，请分段重试。', 413);
      try {body = JSON.parse(raw);} catch {throw new GameError('请求内容无效。');}
      assert(body && typeof body === 'object' && !Array.isArray(body), '请求内容无效。');
    }
    const action = request.method === 'GET' ? url.searchParams.get('action') || 'state' : body.action;
    if (action === 'create') {
      assert(request.method === 'POST', '请使用正确的请求方式。', 405);
      const expired=now-24*60*60*1000;
      await db.batch([
        db.prepare('DELETE FROM draw_events WHERE code IN (SELECT code FROM game_rooms WHERE updated_at < ?)').bind(expired),
        db.prepare('DELETE FROM game_rooms WHERE updated_at < ?').bind(expired),
      ]);
      const p=player(body.name,body.avatar,now);
      const pack=WORDS[body.pack] ? body.pack : 'everyday';
      const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      for (let i=0;i<5;i++) {
        const bytes=crypto.getRandomValues(new Uint8Array(6));
        const code=[...bytes].map(v=>alphabet[v%alphabet.length]).join('');
        const s={code,phase:'lobby',hostId:p.id,settings:{pack,seconds:40,cycles:1},players:[p],order:[],turn:-1,roundId:'',drawerId:'',deadline:0,guessed:[],choices:[],answer:null,history:[],chat:[],eventCount:0};
        const created=await db.prepare('INSERT OR IGNORE INTO game_rooms (code,state,version,updated_at) VALUES (?,?,0,?)').bind(code,JSON.stringify(s),now).run();
        if (created.meta.changes) return json({code,token:p.token,playerId:p.id,state:publicState(s,p.id,now)});
      }
      throw new GameError('创建房间失败，请再试一次。', 503);
    }
    const code=codeValue(body.code || url.searchParams.get('code'));
    const auth=body.token || request.headers.get('authorization')?.replace(/^Bearer /,'');
    if (action === 'join') {
      assert(request.method==='POST', '请使用正确的请求方式。', 405);
      const p=player(body.name,body.avatar,now);
      const {state}=await mutateRoom(db,code,s=>{
        assert(['lobby','finished'].includes(s.phase), '这一局已经开始，请等本局结束后再加入。');
        s.players=s.players.filter(q=>active(q,now));
        assert(s.players.length<8, '房间已满，最多 8 位玩家。');
        if(!s.players.some(q=>q.id===s.hostId))s.hostId=p.id;
        const occupied=new Set(s.players.map(q=>q.avatar));
        if(occupied.has(p.avatar))p.avatar=[0,1,2,3,4,5,6,7].find(a=>!occupied.has(a))??p.avatar;
        s.players.push(p);notice(s,p.name+' 加入了房间',now);
      },now);
      return json({code,token:p.token,playerId:p.id,state:publicState(state,p.id,now)});
    }
    if(action==='state' || action==='gallery'){
      assert(request.method==='GET', '请使用正确的请求方式。',405);
      let {state}=await readRoom(db,code);let p=authenticate(state,auth);
      if(now-p.seen>10000 || state.deadline && now>=state.deadline || !active(state.players.find(q=>q.id===state.hostId) || {left:true},now)){
        ({state}=await mutateRoom(db,code,s=>{const me=authenticate(s,auth);me.seen=now;advance(s,now);},now));
        p=authenticate(state,auth);
      }
      if(action==='gallery'){
        const allowed=state.history.map(h=>h.roundId);
        const events=await db.prepare('SELECT id, round_id, payload FROM draw_events WHERE code = ? ORDER BY id').bind(code).all();
        return json({history:state.history, events:events.results.filter(e=>allowed.includes(e.round_id)).map(e=>({id:e.id,roundId:e.round_id,...JSON.parse(e.payload)}))});
      }
      const cursor=Math.max(0,Number(url.searchParams.get('cursor'))||0);
      const round=url.searchParams.get('round')||'';
      const effectiveCursor=round===state.roundId?cursor:0;
      const events=await db.prepare('SELECT id, payload FROM draw_events WHERE code = ? AND round_id = ? AND id > ? ORDER BY id LIMIT 500')
        .bind(code,state.roundId,effectiveCursor).all();
      return json({state:publicState(state,p.id,now),events:events.results.map(e=>({seq:e.id,...JSON.parse(e.payload)}))});
    }
    assert(request.method==='POST','请使用正确的请求方式。',405);
    if(action==='draw'){
      const {state}=await readRoom(db,code);const p=authenticate(state,auth);
      assert(state.phase==='drawing' && now<state.deadline && state.drawerId===p.id && state.roundId===body.roundId,'当前不是你的绘画回合。',403);
      assert(Array.isArray(body.events) && body.events.length>0 && body.events.length<=12,'绘画数据无效。');
      const count=await db.prepare('SELECT COUNT(*) as n FROM draw_events WHERE code = ? AND round_id = ?').bind(code,state.roundId).first();
      assert(count.n<3000,'这幅画已经很丰富了，试着用现有线索完成猜词吧。');
      const items=body.events.map(e=>{
        assert(['stroke','undo','clear'].includes(e.type),'未知绘画工具。');
        const id=clean(e.id,50);const key=clean(e.key,50);assert(id&&key,'缺少笔画编号。');
        if(e.type==='stroke'){
          assert(/^#[0-9a-fA-F]{6}$/.test(e.color) && Number.isFinite(e.size) && e.size>=1 && e.size<=36,'笔刷设置无效。');
          assert(Array.isArray(e.points) && e.points.length>0 && e.points.length<=150,'笔画点数无效。');
          assert(e.points.every(pt=>Array.isArray(pt)&&pt.length===2&&pt.every(n=>Number.isFinite(n)&&n>=0&&n<=1)),'笔画坐标无效。');
          return {type:'stroke',id,key,color:e.color,size:e.size,points:e.points};
        }
        return {type:e.type,id,key};
      });
      await db.batch(items.map(e=>db.prepare('INSERT OR IGNORE INTO draw_events (code,round_id,client_key,payload) VALUES (?,?,?,?)').bind(code,state.roundId,e.key,JSON.stringify(e))));
      return json({ok:true});
    }
    const {state}=await mutateRoom(db,code,s=>{
      const p=authenticate(s,auth);p.seen=now;advance(s,now);
      if(action==='settings'){
        assert(p.id===s.hostId && ['lobby','finished'].includes(s.phase),'只有房主可以在开局前修改设置。',403);
        assert(WORDS[body.pack],'请选择一个词包。');
        assert([30,40,60,90].includes(body.seconds) && [1,2].includes(body.cycles),'对局设置无效。');
        s.settings={pack:body.pack,seconds:body.seconds,cycles:body.cycles};
      }else if(action==='start'){
        assert(p.id===s.hostId && ['lobby','finished'].includes(s.phase),'现在不能开始游戏。',403);
        const online=s.players.filter(q=>active(q,now));assert(online.length>=2,'再邀请一位朋友就能开始了。');
        s.players=online;s.players.forEach(q=>q.score=0);
        s.order=Array.from({length:s.settings.cycles},()=>s.players.map(q=>q.id)).flat();
        s.turn=-1;s.history=[];s.chat=[];nextRound(s,now);
      }else if(action==='select'){
        assert(s.phase==='choose'&&s.drawerId===p.id,'现在不是你选词的时候。',403);
        assert(Number.isInteger(body.index)&&body.index>=0&&body.index<s.choices.length,'请选择一个词。');
        s.answer=s.choices[body.index];s.phase='drawing';s.deadline=now+s.settings.seconds*1000;
      }else if(action==='guess'){
        assert(s.phase==='drawing'&&p.id!==s.drawerId&&!s.guessed.includes(p.id),'这一回合暂时不能提交答案。');
        const text=clean(body.text,80);assert(text,'先写一个答案吧。');
        assert(now-(p.lastGuess||0)>=250,'猜得太快啦，稍等一下再发。');p.lastGuess=now;
        if([s.answer.word,...s.answer.aliases].some(w=>normalize(w)===normalize(text))){
          const points=100+Math.round(100*Math.max(0,s.deadline-now)/(s.settings.seconds*1000));
          p.score+=points;s.guessed.push(p.id);
          const drawer=s.players.find(q=>q.id===s.drawerId);if(drawer)drawer.score+=50;
          notice(s,p.name+' 猜中了！ +'+points,now,'success');
          if(s.players.filter(q=>active(q,now)&&q.id!==s.drawerId).every(q=>s.guessed.includes(q.id)))endRound(s,now,'all-guessed');
        }else{s.chat.push({id:crypto.randomUUID(),name:p.name,text,type:'guess',at:now});s.chat=s.chat.slice(-45);}
      }else if(action==='react'){
        assert(['👏','😂','💡','❤️'].includes(body.emoji),'表情无效。');
        assert(now-(p.lastReact||0)>1500,'稍等一下再发送吧。');p.lastReact=now;notice(s,p.name+' '+body.emoji,now,'reaction');
      }else if(action==='kick'){
        assert(p.id===s.hostId && body.playerId!==p.id,'只有房主可以移出其他玩家。',403);
        const target=s.players.find(q=>q.id===body.playerId);assert(target,'玩家已经离开。');
        target.left=true;notice(s,target.name+' 离开了房间',now);advance(s,now);
      }else if(action==='leave'){
        p.left=true;notice(s,p.name+' 离开了房间',now);advance(s,now);
      }else if(action==='lobby'){
        assert(p.id===s.hostId && s.phase==='finished','本局结束后由房主返回大厅。',403);s.phase='lobby';s.deadline=0;
      }else{throw new GameError('未知操作。');}
    },now);
    const me=state.players.find(p=>p.token===auth);
    return json({state:publicState(state,me.id,now)});
  }catch(error){
    if(error instanceof GameError)return json({error:error.message},error.status);
    console.error('Game request failed:',error);
    return json({error:'服务器暂时没接上，请稍后重试。'},500);
  }
}
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});}
export {PACKS};
