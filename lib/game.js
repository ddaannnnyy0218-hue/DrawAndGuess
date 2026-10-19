import {PACKS, WORDS} from './words.js';
import {brushIds} from './brushes.js';
import {selectWords,wordHint} from './vocabulary.js';
import {matchesLevel} from './levels.js';
import {guessPoints,nearGuess} from './game-balance.js';

export class GameError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
const assert = (ok, message, status) => { if (!ok) throw new GameError(message, status); };
const clean = (value, max) => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);
const normalize = value => String(value).normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');
const active = (p, now) => !p.left && now - p.seen < 45000;
const choose = (words, n) => {const remaining=[...words],result=[];while(result.length<n&&remaining.length){const at=Math.floor(Math.random()*remaining.length);result.push(remaining.splice(at,1)[0]);}return result;};
function customWords(value){const input=Array.isArray(value)?value:String(value||'').split(/[,，、|\n]/),words=[...new Set(input.map(w=>clean(w,24)).filter(Boolean))];assert(words.length===0||words.length>=3,'自定义词库至少写 3 个不同的题目。');assert(words.length<=100,'自定义词库最多 100 个题目。');return words;}
const token = () => crypto.randomUUID() + crypto.randomUUID();
const modes=['classic','bluff','three'];
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
function startVoting(s,now){
 const grouped=new Map();
 const add=(text,author,correct=false)=>{const key=normalize(text);if(!grouped.has(key))grouped.set(key,{id:crypto.randomUUID(),text,authors:[],correct});const o=grouped.get(key);if(author)o.authors.push(author);};
 add(s.answer.word,'',true);
 for(const [id,text] of Object.entries(s.bluffs||{}))add(text,id);
 const decoys=choose(WORDS[s.settings.pack].filter(w=>![s.answer.word,...s.answer.aliases].some(v=>normalize(v)===normalize(w.word))),8);
 for(const d of decoys){if(grouped.size>=Math.max(3,s.players.filter(p=>!p.left).length))break;add(d.word,'');}
 s.options=choose([...grouped.values()],grouped.size);s.votes={};s.phase='vote';s.deadline=now+20000;notice(s,'假答案已经混进来了。选出你认为真正的题目！',now);
}
function resolveVoting(s,now){
 if(s.phase!=='vote')return;s.guessed=[];
 for(const [id,optionId] of Object.entries(s.votes)){
  const voter=s.players.find(p=>p.id===id),option=s.options.find(o=>o.id===optionId);if(!voter||!option)continue;
  if(option.correct){voter.score+=100;s.guessed.push(id);const drawer=s.players.find(p=>p.id===s.drawerId);if(drawer)drawer.score+=40;}
  else for(const author of option.authors){const p=s.players.find(p=>p.id===author);if(p)p.score+=70;}
 }
 s.phase='reveal';s.deadline=now+7000;s.history.push({roundId:s.roundId,word:s.answer.word,drawerId:s.drawerId,drawerName:s.players.find(p=>p.id===s.drawerId)?.name||'画家',guessed:[...s.guessed],reason:'bluff'});notice(s,'真正的题目是「'+s.answer.word+'」：猜中 +100，假答案每骗到一票 +70。',now);
}
function endRound(s, now, reason = 'time') {
  if (s.phase !== 'drawing' && s.phase !== 'choose') return;
  if (!s.answer) s.answer = s.choices[0];
  if(s.settings.mode==='bluff'){s.bluffs={};s.votes={};s.options=[];s.phase='submit';s.deadline=now+25000;notice(s,'画好了！每位猜词者编一个可信的假答案。',now);return;}
  s.phase = 'reveal'; s.deadline = now + 6000;
  s.history.push({roundId:s.roundId, word:s.answer.word, drawerId:s.drawerId, drawerName:s.players.find(p => p.id === s.drawerId)?.name || '画家', guessed:[...s.guessed], reason});
  notice(s, '这一幅的答案是「' + s.answer.word + '」', now);
}
function nextRound(s, now) {
  s.turn++;
  while (s.turn < s.order.length && !s.players.some(p => p.id === s.order[s.turn] && active(p, now))) s.turn++;
  if (s.turn >= s.order.length) { s.phase = 'finished'; s.deadline = 0; s.drawerId = ''; return; }
  s.strokeIds=[];s.roundId = crypto.randomUUID(); s.drawerId = s.order[s.turn];
  const pool=s.settings.customWords?.length?s.settings.customWords.map(word=>({id:'custom:'+word,word,aliases:[],chapter:'朋友的词库',label:''})):WORDS[s.settings.pack];
  s.recentWords||=[];s.choices=selectWords(pool,Math.random,s.recentWords,3);s.recentWords=[...s.recentWords,...s.choices.map(w=>w.id)].slice(-300);
  s.bluffs={};s.votes={};s.options=[];s.guessed = []; s.answer = null;s.startedAt=0;s.feedback={};
  s.phase = 'choose'; s.deadline = now + 15000; s.eventCount = 0;
  notice(s, '轮到 ' + s.players.find(p => p.id === s.drawerId)?.name + ' 画画了', now);
}
export function advance(s, now) {
  let changed = false;
  const online = s.players.filter(p => active(p, now));
  if (!online.some(p => p.id === s.hostId) && online.length) { s.hostId = online[0].id; changed = true; }
  if (['choose','drawing','submit','vote','reveal'].includes(s.phase) && online.length < 2) {
    s.phase = 'finished'; s.deadline = 0; notice(s, '在线人数不足，本局已结束。邀请朋友再开一局吧。', now); return true;
  }
  if (['choose','drawing'].includes(s.phase) && !online.some(p => p.id === s.drawerId)) {
    endRound(s, now, 'left'); changed = true;
  }
  if (s.settings.mode!=='bluff' && s.phase === 'drawing' && online.filter(p=>p.id!==s.drawerId).every(p=>s.guessed.includes(p.id))) {
    endRound(s, now, 'all-guessed'); changed = true;
  }
  if (s.phase === 'choose' && now >= s.deadline) {
    s.answer = s.choices[0]; s.phase = 'drawing';s.startedAt=now; s.deadline = now + s.settings.seconds * 1000; changed = true;
  } else if (s.phase === 'drawing' && now >= s.deadline) {
    endRound(s, now); changed = true;
  } else if (s.phase === 'reveal' && now >= s.deadline) {
    nextRound(s, now); changed = true;
  }
  if(s.phase==='submit'&&(now>=s.deadline||online.filter(p=>p.id!==s.drawerId).every(p=>s.bluffs[p.id]))){startVoting(s,now);changed=true;}
  if(s.phase==='vote'&&(now>=s.deadline||online.filter(p=>p.id!==s.drawerId).every(p=>s.votes[p.id]))){resolveVoting(s,now);changed=true;}
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
    hint:s.answer ? wordHint(s.answer,s.phase==='drawing'?now-(s.startedAt||now):0,s.settings.seconds) : '',
    choices:drawer && s.phase === 'choose' ? s.choices.map(c=>c.word) : [],
    chat:s.chat,
    bluffSubmitted:!!s.bluffs?.[viewerId],voted:!!s.votes?.[viewerId],
    privateHint:s.players.find(p=>p.id===viewerId)?.hintRound===s.roundId&&s.answer?(s.answer.chapter||'日常脑洞')+' · '+[...s.answer.word].length+' 字符':null,
    feedback:s.feedback?.[viewerId]||null,
    options:['vote','reveal'].includes(s.phase)?(s.options||[]).map(o=>({id:o.id,text:o.text,mine:o.authors.includes(viewerId),...(s.phase==='reveal'?{correct:o.correct,votes:Object.values(s.votes||{}).filter(id=>id===o.id).length,authors:o.authors.map(id=>s.players.find(p=>p.id===id)?.name||'画家')}: {})})):[],
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
        const s={code,phase:'lobby',hostId:p.id,settings:{pack,seconds:40,cycles:1,mode:modes.includes(body.mode)?body.mode:'classic'},players:[p],order:[],turn:-1,roundId:'',drawerId:'',deadline:0,guessed:[],choices:[],answer:null,history:[],chat:[],eventCount:0};
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
          assert(/^#[0-9a-fA-F]{6}$/.test(e.color) && Number.isFinite(e.size) && e.size>=1 && e.size<=36 && brushIds.includes(e.brush||'ink'),'笔刷设置无效。');
          assert(Array.isArray(e.points) && e.points.length>0 && e.points.length<=150,'笔画点数无效。');
          assert(e.points.every(pt=>Array.isArray(pt)&&pt.length===2&&pt.every(n=>Number.isFinite(n)&&n>=0&&n<=1)),'笔画坐标无效。');
          return {type:'stroke',id,key,color:e.color,size:e.size,brush:e.brush||'ink',points:e.points};
        }
        return {type:e.type,id,key};
      });
      if(state.settings.mode==='three'){
        assert(items.every(e=>e.type==='stroke'&&e.color!=='#fffefb'),'三笔挑战不能擦除、撤销或清空。');
        await mutateRoom(db,code,s=>{assert(s.roundId===body.roundId&&s.phase==='drawing'&&now<s.deadline&&s.drawerId===p.id,'当前不是你的绘画回合。',403);const ids=[...new Set([...(s.strokeIds||[]),...items.map(e=>e.id)])];assert(ids.length<=3,'三笔已经用完了，让朋友来猜吧。');s.strokeIds=ids;},now);
      }
      await db.batch(items.map(e=>db.prepare('INSERT OR IGNORE INTO draw_events (code,round_id,client_key,payload) VALUES (?,?,?,?)').bind(code,state.roundId,e.key,JSON.stringify(e))));
      return json({ok:true});
    }
    const {state}=await mutateRoom(db,code,s=>{
      const p=authenticate(s,auth);p.seen=now;advance(s,now);
      if(action==='settings'){
        assert(p.id===s.hostId && ['lobby','finished'].includes(s.phase),'只有房主可以在开局前修改设置。',403);
        assert(WORDS[body.pack],'请选择一个词包。');
        assert([30,40,60,90].includes(body.seconds) && [1,2].includes(body.cycles),'对局设置无效。');
        assert(!body.mode||modes.includes(body.mode),'玩法无效。');s.settings={pack:body.pack,seconds:body.seconds,cycles:body.cycles,mode:body.mode||s.settings.mode||'classic',customWords:body.customWords===undefined?(s.settings.customWords||[]):customWords(body.customWords)};
      }else if(action==='start'){
        assert(p.id===s.hostId && ['lobby','finished'].includes(s.phase),'现在不能开始游戏。',403);
        const online=s.players.filter(q=>active(q,now));assert(online.length>=(s.settings.mode==='bluff'?3:2),s.settings.mode==='bluff'?'假答案需要至少 3 位玩家。':'再邀请一位朋友就能开始了。');
        s.players=online;s.players.forEach(q=>q.score=0);
        s.order=Array.from({length:s.settings.cycles},()=>s.players.map(q=>q.id)).flat();
        s.turn=-1;s.history=[];s.chat=[];nextRound(s,now);
      }else if(action==='select'){
        assert(s.phase==='choose'&&s.drawerId===p.id,'现在不是你选词的时候。',403);
        assert(Number.isInteger(body.index)&&body.index>=0&&body.index<s.choices.length,'请选择一个词。');
        s.answer=s.choices[body.index];s.phase='drawing';s.startedAt=now;s.deadline=now+s.settings.seconds*1000;
      }else if(action==='finishDrawing'){
        assert(s.phase==='drawing'&&s.drawerId===p.id&&s.settings.mode==='bluff','现在不能结束绘画。',403);endRound(s,now);
      }else if(action==='bluff'){
        assert(s.phase==='submit'&&p.id!==s.drawerId&&!s.bluffs[p.id],'现在不能提交假答案。',403);
        const text=clean(body.text,48);assert(text&&![s.answer.word,...s.answer.aliases].some(w=>normalize(w)===normalize(text)),'这个答案不适合混入选项，换个脑洞吧。');s.bluffs[p.id]=text;notice(s,p.name+' 已交出一个脑洞',now);advance(s,now);
      }else if(action==='vote'){
        assert(s.phase==='vote'&&p.id!==s.drawerId&&!s.votes[p.id],'现在不能投票。',403);const option=s.options.find(o=>o.id===body.optionId);assert(option&&!option.authors.includes(p.id),'不能投给自己的假答案。');s.votes[p.id]=option.id;advance(s,now);
      }else if(action==='hint'){
        assert(s.phase==='drawing'&&p.id!==s.drawerId&&s.settings.mode!=='bluff'&&p.hintRound!==s.roundId,'这一轮无法使用提示。');p.hintRound=s.roundId;p.score-=30;
      }else if(action==='guess'){
        assert(s.settings.mode!=='bluff','假答案模式请在编答案和投票阶段参与。');
        assert(s.phase==='drawing'&&p.id!==s.drawerId&&!s.guessed.includes(p.id),'这一回合暂时不能提交答案。');
        const text=clean(body.text,80);assert(text,'先写一个答案吧。');
        assert(now-(p.lastGuess||0)>=250,'猜得太快啦，稍等一下再发。');p.lastGuess=now;
        s.feedback||={};s.feedback[p.id]=null;
        if(matchesLevel(s.answer,text)){
          const points=guessPoints(now-(s.startedAt||s.deadline-s.settings.seconds*1000),s.settings.seconds);
          p.score+=points;s.guessed.push(p.id);
          const drawer=s.players.find(q=>q.id===s.drawerId);if(drawer)drawer.score+=50;
          notice(s,p.name+' 猜中了！ +'+points,now,'success');
          if(s.players.filter(q=>active(q,now)&&q.id!==s.drawerId).every(q=>s.guessed.includes(q.id)))endRound(s,now,'all-guessed');
        }else if(nearGuess(normalize(s.answer.word),normalize(text))){s.feedback[p.id]='很接近了，再想一个字！';}else{s.chat.push({id:crypto.randomUUID(),name:p.name,text,type:'guess',at:now});s.chat=s.chat.slice(-45);}
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
