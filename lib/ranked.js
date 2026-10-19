import {matchesLevel,normalizeGuess} from './levels.js';
import {BASE_WORDS,wordHint,selectWords} from './vocabulary.js';
import {RULES,guessPoints,nearGuess} from './game-balance.js';
import {rankOf,SKILLS,drawingTip} from './ranks.js';
import {brushIds} from './brushes.js';
import {judgeDrawing} from './doodle-judge.js';
import {botPersona,botSketch,botDrawingAt,advanceBotDrawing,rng,botTurn,thinkBot} from './bot-players.js';
class RankError extends Error{constructor(message,status=400){super(message);this.status=status;}}
const ok=(v,m,status)=>{if(!v)throw new RankError(m,status)};
const clean=v=>String(v||'').replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,16);
const token=()=>crypto.randomUUID()+crypto.randomUUID();
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json;charset=utf-8','Cache-Control':'no-store'}});
export function validateDrawing(events){
 ok(Array.isArray(events)&&events.length>0&&events.length<=1000,'画作最多包含 1000 段笔画。');let points=0;
 const result=events.map(e=>{ok(e&&['stroke','clear','undo'].includes(e.type)&&typeof e.id==='string'&&e.id.length<=60&&typeof e.key==='string'&&e.key.length<=60,'笔画数据无效。');
 if(e.type!=='stroke')return {type:e.type,id:e.id,key:e.key};
 ok(/^#[\da-f]{6}$/i.test(e.color)&&Number.isFinite(e.size)&&e.size>=1&&e.size<=36&&brushIds.includes(e.brush||'ink'),'画笔数据无效。');
 ok(Array.isArray(e.points)&&e.points.length>0&&e.points.length<=150&&e.points.every(p=>Array.isArray(p)&&p.length===2&&p.every(n=>Number.isFinite(n)&&n>=0&&n<=1)),'笔画坐标无效。');points+=e.points.length;
 return {type:'stroke',id:e.id,key:e.key,color:e.color,size:e.size,brush:e.brush||'ink',points:e.points};});
 ok(points<=16000,'画作太大了，请简化一些。');return result;
}
const profileView=p=>({id:p.id,name:p.name,avatar:p.avatar,rp:p.rp,wins:p.wins,losses:p.losses,rank:rankOf(p.rp)});
async function profile(db,id,auth){const p=await db.prepare('SELECT * FROM ranked_profiles WHERE id=? AND token=?').bind(id||'',auth||'').first();ok(p,'排位身份已失效，请重新进入。',401);return p;}
function notice(s,text,now,name='',type='system'){s.chat.push({id:crypto.randomUUID(),text,at:now,name,type});s.chat=s.chat.slice(-35);}
function startDrawing(s,now,index=0){const r=s.rounds[s.index];r.level=r.options[index];r.seconds=RULES.seconds;r.events=[];s.phase='drawing';s.startedAt=now+800;s.deadline=s.startedAt+r.seconds*1000;s.vision=[];s.visionKey='';s.visionAt=0;s.visionCycle=0;
 for(const p of s.players.filter(p=>p.bot)){p.turn=botTurn(p.persona,r.id,s.startedAt);p.nextThink=p.turn.readyAt;}
 notice(s,'轮到 '+s.players.find(p=>p.id===r.drawerId).name+' 作画',now);}
function endRound(s,now,reason='time'){if(!['drawing','choose'].includes(s.phase))return;const r=s.rounds[s.index];if(!r.level)r.level=r.options[0];r.endedAt=now;s.phase='reveal';s.deadline=now+RULES.revealMs;
 s.history.push({roundId:r.id,word:r.level.word,drawerId:r.drawerId,drawerName:s.players.find(p=>p.id===r.drawerId).name,reason,guessed:s.players.filter(p=>p.solved).map(p=>p.id),points:s.players.map(p=>({id:p.id,points:p.roundPoints,solved:p.solved}))});notice(s,'这一幅是「'+r.level.word+'」',now);
}
function roundReset(s,now){const r=s.rounds[s.index],drawer=s.players.find(p=>p.id===r.drawerId);s.phase='choose';s.startedAt=now;s.deadline=now+RULES.chooseMs;s.chooseAt=now+(drawer.bot?1200+(drawer.persona.seed%1500):RULES.chooseMs);s.feedback={};
 for(const p of s.players){p.done=false;p.solved=false;p.roundPoints=0;p.roundSkills={};p.tried=[];p.pending=null;p.nextThink=0;p.tries=0;p.lastGuess=0;p.turn=null;}s.vision=[];s.visionKey='';s.visionAt=0;
}
function awardGuess(s,p,text,now){const r=s.rounds[s.index];if(p.solved||p.forfeit||p.id===r.drawerId||s.phase!=='drawing')return false;
 if(!matchesLevel(r.level,text))return false;const points=guessPoints(now-s.startedAt,r.seconds);p.score+=points;p.roundPoints+=points;p.solved=true;p.done=true;
 const drawer=s.players.find(x=>x.id===r.drawerId);const artistPoints=RULES.artistPoints;drawer.score+=artistPoints;drawer.roundPoints+=artistPoints;
 if(s.players.filter(p=>p.solved).length===1)s.deadline=Math.min(s.deadline,now+RULES.chaseMs);
 notice(s,p.name+' 猜中了！ +'+points+' · 画手 +'+artistPoints,now,'','success');return true;
}
function sharedEvents(s,now){const r=s.rounds[Math.min(s.index,s.rounds.length-1)],drawer=s.players.find(p=>p.id===r.drawerId);return drawer.bot?botDrawingAt(r,(r.endedAt??now)-s.startedAt):r.events;}
async function botsObserve(s,now,deps){const r=s.rounds[s.index];for(const [i,p] of s.players.filter(p=>p.bot).entries()){if(p.persona.version!==4){p.persona=botPersona(p.rp,i,p.persona.seed);p.name=p.persona.name;}if(!p.turn)p.turn=botTurn(p.persona,r.id,s.startedAt);}
 const bots=s.players.filter(p=>p.bot&&!p.solved&&!p.forfeit&&p.tries<p.persona.attempts&&p.id!==r.drawerId);if(!bots.length)return;
 const events=sharedEvents(s,now),last=events.at(-1),key=events.length+':'+last?.key+':'+last?.points?.length+':'+last?.points?.at(-1)?.map(v=>Math.round(v*100)).join(','),controls=events.filter(e=>e.type==='clear'||e.type==='undo').map(e=>e.key).join('|');
 if(controls!==(s.visionControls||'')){for(const p of bots)p.pending=null;s.vision=[];s.visionAt=0;s.visionControls=controls;}
 if(events.some(e=>e.type==='stroke'&&e.points?.length>=2)&&key!==s.visionKey&&now-s.visionAt>=2200){s.visionAt=now;s.visionKey=key;try{const cycle=s.visionCycle||0,fresh=(await (deps.judge||judgeDrawing)(events,deps.assets)).map(p=>({...p,region:'whole'}));
  s.vision=fresh.filter(p=>p.region==='whole');s.visionControls=controls;s.visionCycle=cycle+1;s.visionUnavailable=false;
 }catch(e){s.vision=[];s.visionUnavailable=true;console.error('Bot vision unavailable',e);}}
 for(const p of bots){const guess=thinkBot(p,s.vision,now,{hint:wordHint(r.level,now-s.startedAt,r.seconds),chapter:r.level.chapter});
  if(guess&&!awardGuess(s,p,guess.text,now))notice(s,guess.text,now,p.name,'guess');
 }
}
async function advance(s,now,deps){if(s.phase==='finished')return;for(const p of s.players){if(!p.bot&&!p.forfeit&&now-p.seen>45000){p.forfeit=true;notice(s,p.name+' 暂时离开了比赛',now);}}
 if(s.players.filter(p=>!p.bot).every(p=>p.forfeit)){s.phase='finished';s.finishedAt=now;return;}
 const r=s.rounds[s.index],drawer=s.players.find(p=>p.id===r.drawerId);
 if(['choose','drawing'].includes(s.phase)&&drawer.forfeit){endRound(s,now,'left');return;}
 if(s.phase==='choose'&&now>=(drawer.bot?s.chooseAt:s.deadline))startDrawing(s,drawer.bot?s.chooseAt:s.deadline,0);
 if(s.phase==='drawing'&&now>=s.startedAt){const guessers=s.players.filter(p=>p.id!==r.drawerId&&!p.forfeit);if(drawer.bot)advanceBotDrawing(r,Math.min(now,s.deadline)-s.startedAt,guessers.some(p=>!p.solved));if(now>=s.deadline){endRound(s,s.deadline);return;}await botsObserve(s,now,deps);if(!guessers.length||guessers.every(p=>p.solved))endRound(s,now,'all-guessed');}
 else if(s.phase==='reveal'&&now>=s.deadline){const nextAt=s.deadline;s.index++;if(s.index>=s.rounds.length){s.phase='finished';s.finishedAt=nextAt;}else{roundReset(s,nextAt);if(s.players.find(p=>p.id===s.rounds[s.index].drawerId).bot&&now>=s.chooseAt)await advance(s,now,deps);}}
}
export function standings(s){const sorted=[...s.players].sort((a,b)=>Number(a.forfeit)-Number(b.forfeit)||b.score-a.score);return sorted.map(p=>({id:p.id,place:p.forfeit?s.players.length:sorted.filter(q=>!q.forfeit&&q.score>p.score).length+1,score:p.score,forfeit:!!p.forfeit}));}
function resultFor(s,p){const table=standings(s),place=table.find(x=>x.id===p.id).place,leaders=table.filter(x=>x.place===1&&!x.forfeit),hasBots=s.players.some(x=>x.bot),allBlank=s.players.filter(x=>!x.forfeit).every(x=>x.score<=0),won=!p.forfeit&&place===1&&p.score>0,lost=p.forfeit||place===s.players.length&&!allBlank;let delta=allBlank&&!p.forfeit?0:won?(leaders.length>1?20:hasBots?40:50):place===2&&!p.forfeit?(p.score>0?10:0):hasBots?-15:-25;
 if(p.rp<200&&delta<0)delta=0;return {delta,won:won?1:0,lost:lost?1:0,place};}
async function settle(db,s){for(const p of s.players.filter(p=>!p.bot&&(s.phase==='finished'||p.forfeit))){const result=p.forfeit?{...resultFor(s,p),won:0,lost:1}:resultFor(s,p);
 await db.batch([db.prepare('INSERT OR IGNORE INTO ranked_results (match_id,profile_id,delta,won,lost,applied) VALUES (?,?,?,?,?,0)').bind(s.id,p.id,result.delta,result.won,result.lost),db.prepare('UPDATE ranked_profiles SET rp=MAX(0,rp+?),wins=wins+?,losses=losses+? WHERE id=? AND EXISTS (SELECT 1 FROM ranked_results WHERE match_id=? AND profile_id=? AND applied=0)').bind(result.delta,result.won,result.lost,p.id,s.id,p.id),db.prepare('UPDATE ranked_results SET applied=1 WHERE match_id=? AND profile_id=?').bind(s.id,p.id)]);
}}
async function mutate(db,id,fn){for(let tries=0;tries<8;tries++){const row=await db.prepare('SELECT * FROM ranked_matches WHERE id=?').bind(id).first();ok(row,'对局未找到。',404);const s=JSON.parse(row.state);await fn(s);const result=await db.prepare('UPDATE ranked_matches SET state=?,version=version+1,updated_at=? WHERE id=? AND version=?').bind(JSON.stringify(s),s.updatedAt,id,row.version).run();if(result.meta.changes===1)return s;}throw new RankError('对局有点忙，请再试一次。',409);}
function publicMatch(s,id,now){const r=s.rounds[Math.min(s.index,s.rounds.length-1)],me=s.players.find(p=>p.id===id),isDrawer=id===r.drawerId,drawer=s.players.find(p=>p.id===r.drawerId),reveal=['reveal','finished'].includes(s.phase),table=standings(s),privateOptions=me.roundSkills.peek?r.options.map(l=>l.word):null;
 return {format:2,id:s.id,revision:s.revision,phase:s.phase,index:Math.min(s.index+1,s.rounds.length),total:s.rounds.length,roundId:r.id,kind:isDrawer?'draw':'guess',drawerId:r.drawerId,startedAt:s.startedAt,deadline:s.deadline,now,seconds:r.seconds,
 word:(isDrawer||reveal)&&r.level?r.level.word:null,hint:r.level?wordHint(r.level,s.phase==='drawing'?now-s.startedAt:0,r.seconds):'',topic:r.level?.chapter||null,pointsNow:s.phase==='drawing'?guessPoints(now-s.startedAt,r.seconds):null,choices:isDrawer&&s.phase==='choose'?r.options.map(l=>l.word):[],choiceInfo:isDrawer&&s.phase==='choose'?r.options.map(l=>({topic:l.chapter,kind:l.difficulty>1?'进阶词':'常见词'})):[],writingReports:r.writingReports?.length||0,reportedWriting:(r.writingReports||[]).includes(id),
 privateHint:me.roundSkills.hint&&r.level?r.level.chapter+' · '+([...r.level.word].length>1?'第一个字是「'+[...r.level.word][0]+'」':'英文以 '+r.level.label[0].toUpperCase()+' 开头'):null,privateOptions,inspiration:me.roundSkills.inspire&&r.level?drawingTip(r.level):null,
 events:s.phase==='choose'?[]:sharedEvents(s,now),botDrawing:drawer.bot,
 players:s.players.map(p=>({id:p.id,name:p.name,avatar:p.avatar,rp:p.rp,score:p.score,bot:p.bot,botLevel:p.persona?.level||null,botSkill:p.persona?.skill||null,done:p.solved,roundPoints:p.roundPoints,forfeit:!!p.forfeit,place:table.find(x=>x.id===p.id).place})),
 me:id,usedSkills:me.usedSkills,roundSkills:me.roundSkills,tries:me.tries||0,feedback:s.feedback?.[id]||null,history:s.history,chat:s.chat,visionUnavailable:s.visionUnavailable||false,
 winners:s.phase==='finished'&&!s.players.filter(p=>!p.forfeit).every(p=>p.score<=0)?table.filter(p=>p.place===1&&!p.forfeit&&p.score>0).map(p=>p.id):[]};
}
async function createMatch(humans,rp,now,deps,db){const seed=crypto.getRandomValues(new Uint32Array(16)),players=humans.map(p=>({...profileView(p),bot:false,score:0,seen:now,forfeit:false,usedSkills:{}}));
 while(players.length<3){const slot=players.filter(p=>p.bot).length,persona=botPersona(rp,slot,seed[players.length+2],players.map(p=>p.name));players.push({id:'bot-'+crypto.randomUUID(),name:persona.name,avatar:persona.avatar,rp,bot:true,persona,score:0,seen:now,forfeit:false,usedSkills:{}});}
 const firstBot=players.findIndex(p=>p.bot),order=firstBot>=0?[players[firstBot],...players.filter((_,i)=>i!==firstBot)]:players;
 const memory=(await db.prepare('SELECT words,sources FROM ranked_memory WHERE profile_id IN ('+humans.map(()=>'?').join(',')+')').bind(...humans.map(p=>p.id)).all()).results;
 const recent=memory.flatMap(m=>JSON.parse(m.words)),sources=memory.flatMap(m=>JSON.parse(m.sources)),used=new Set(recent),rounds=[],usedLabels=new Set();
 const pool=BASE_WORDS.filter(w=>rp>=500||w.difficulty===1),offered=new Set();
 for(let i=0;i<3;i++){const random=rng(seed[i]),drawer=order[i],options=[];
  const available=pool.filter(w=>!offered.has(w.id)),fresh=available.filter(w=>!used.has(w.id)),varied=(fresh.length?fresh:available).filter(w=>!usedLabels.has(w.label)),source=varied.length>=3?varied:fresh.length>=3?fresh:available;
  options.push(...selectWords(source,random,[...used],3));for(const word of options){offered.add(word.id);used.delete(word.id);used.add(word.id);usedLabels.add(word.label);}
  const r={id:crypto.randomUUID(),drawerId:drawer.id,options,level:null,events:[],seconds:RULES.seconds,plan:null};if(drawer.bot){r.plan=await botSketch(options[0],drawer.persona,seed[i+8],deps.assets,sources);sources.push(...r.plan.sourceIds);}rounds.push(r);
 }
 const s={format:2,rulesVersion:7,id:crypto.randomUUID(),players,rounds,index:0,phase:'choose',startedAt:now,deadline:now+12000,history:[],chat:[],updatedAt:now,revision:0};roundReset(s,now);return s;
}
async function insertMatch(db,s){await db.prepare('INSERT INTO ranked_matches (id,state,version,updated_at) VALUES (?,?,0,?)').bind(s.id,JSON.stringify(s),s.updatedAt).run();}
async function rememberMatch(db,s){const words=s.rounds.flatMap(r=>r.options.map(w=>w.id)),sources=s.rounds.flatMap(r=>r.plan?.sourceIds||[]),merge=(a,b,n)=>[...new Set([...a,...b].reverse())].reverse().slice(-n);
 for(const p of s.players.filter(p=>!p.bot)){const row=await db.prepare('SELECT words,sources FROM ranked_memory WHERE profile_id=?').bind(p.id).first();await db.prepare('INSERT INTO ranked_memory (profile_id,words,sources) VALUES (?,?,?) ON CONFLICT(profile_id) DO UPDATE SET words=excluded.words,sources=excluded.sources').bind(p.id,JSON.stringify(merge(row?JSON.parse(row.words):[],words,900)),JSON.stringify(merge(row?JSON.parse(row.sources):[],sources,300))).run();}
}
async function getQueue(db,p,now,deps){let q=await db.prepare('SELECT * FROM ranked_queue WHERE profile_id=?').bind(p.id).first();if(!q)return {queue:null};if(q.match_id)return {matchId:q.match_id};
 await db.prepare('UPDATE ranked_queue SET seen_at=? WHERE profile_id=? AND match_id IS NULL').bind(now,p.id).run();const rank=rankOf(p.rp),range=Math.min(800,150+Math.floor((now-q.queued_at)/1000)*20),timeout=now-q.queued_at>=rank.wait;let candidates=[];
 if(rank.wait){const result=await db.prepare('SELECT q.*,p.name,p.avatar,p.rp,p.wins,p.losses FROM ranked_queue q JOIN ranked_profiles p ON p.id=q.profile_id WHERE q.profile_id<>? AND q.match_id IS NULL AND q.seen_at>? AND p.rp>=200 AND ABS(q.rating-?)<=? ORDER BY ABS(q.rating-?),q.queued_at LIMIT 4').bind(p.id,now-15000,p.rp,range,p.rp).all();candidates=result.results;}
 if(candidates.length>=2||timeout){const chosen=candidates.slice(0,2),humans=[p,...chosen.map(c=>({...c,id:c.profile_id}))],s=await createMatch(humans,p.rp,now,deps,db);await insertMatch(db,s);const ids=humans.map(p=>p.id),marks=ids.map(()=>'?').join(',');
 const claim=await db.prepare(`WITH party AS MATERIALIZED (SELECT profile_id FROM ranked_queue WHERE profile_id IN (${marks}) AND match_id IS NULL AND seen_at>?), ready AS MATERIALIZED (SELECT COUNT(*) AS n FROM party) UPDATE ranked_queue SET match_id=? WHERE profile_id IN (SELECT profile_id FROM party) AND (SELECT n FROM ready)=?`).bind(...ids,now-15000,s.id,ids.length).run();if(claim.meta.changes===ids.length){await rememberMatch(db,s);return {matchId:s.id};}await db.prepare('DELETE FROM ranked_matches WHERE id=? AND NOT EXISTS (SELECT 1 FROM ranked_queue WHERE match_id=?)').bind(s.id,s.id).run();q=await db.prepare('SELECT * FROM ranked_queue WHERE profile_id=?').bind(p.id).first();if(q?.match_id)return {matchId:q.match_id};}
 return {queue:q?{since:q.queued_at,wait:rank.wait,range,now,found:Math.min(3,candidates.length+1),needed:3}:null};
}
export async function rankedRequest(request,db,now=Date.now(),deps={}){
 try{ok(db,'排位服务器暂时未就绪。',503);const url=new URL(request.url);let body={};if(request.method==='POST'){const origin=request.headers.get('origin');ok(!origin||origin===url.origin,'无法从这个页面提交。',403);const raw=await request.text();ok(raw.length<220000,'画作数据过大。',413);try{body=JSON.parse(raw)}catch{throw new RankError('请求内容无效。')}ok(body&&typeof body==='object'&&!Array.isArray(body),'请求内容无效。');}
 const action=request.method==='GET'?url.searchParams.get('action')||'profile':body.action;
 if(action==='register'){ok(request.method==='POST','请求方式无效。',405);const name=clean(body.name);ok(name,'先取一个昵称吧。');const p={id:crypto.randomUUID(),token:token(),name,avatar:Math.max(0,Math.min(7,Math.trunc(Number(body.avatar)||0))),rp:0,wins:0,losses:0};await db.prepare('INSERT INTO ranked_profiles (id,token,name,avatar,rp,wins,losses,created_at) VALUES (?,?,?,?,0,0,0,?)').bind(p.id,p.token,p.name,p.avatar,now).run();return json({profile:profileView(p),token:p.token});}
 const id=body.profileId||url.searchParams.get('profileId'),auth=body.token||request.headers.get('authorization')?.replace(/^Bearer /,'');let p=await profile(db,id,auth);deps={...deps,assets:deps.assets||(()=>{throw new RankError('画作资源不可用。',503)})};
 if(action==='profile')return json({profile:profileView(p)});
 let q=await db.prepare('SELECT * FROM ranked_queue WHERE profile_id=?').bind(p.id).first(),existing=null;
 if(q?.match_id){const row=await db.prepare('SELECT state FROM ranked_matches WHERE id=?').bind(q.match_id).first();existing=row?JSON.parse(row.state):null;
  if(existing&&(existing.format!==2||existing.rulesVersion!==7)){await db.prepare('DELETE FROM ranked_queue WHERE profile_id=? AND match_id=?').bind(p.id,q.match_id).run();if(existing.phase!=='finished'){existing.phase='finished';existing.upgradeCancelled=true;await db.prepare('UPDATE ranked_matches SET state=? WHERE id=?').bind(JSON.stringify(existing),q.match_id).run();}return json({profile:profileView(p),queue:null,reset:true,message:'题库已切换为单词画猜，旧局取消，不扣段位分。'});}
 }
 if(action==='queue'){ok(request.method==='POST','请求方式无效。',405);if(existing&&existing.phase!=='finished'&&!existing.players.find(x=>x.id===p.id)?.forfeit)return json({profile:profileView(p),matchId:existing.id});if(existing){await settle(db,existing);await db.prepare('DELETE FROM ranked_queue WHERE profile_id=? AND match_id=?').bind(p.id,existing.id).run();p=await profile(db,id,auth);}
 await db.prepare('INSERT INTO ranked_queue (profile_id,rating,queued_at,seen_at,match_id) VALUES (?,?,?,?,NULL) ON CONFLICT(profile_id) DO UPDATE SET seen_at=excluded.seen_at WHERE ranked_queue.match_id IS NULL').bind(p.id,p.rp,now,now).run();return json({profile:profileView(p),...await getQueue(db,p,now,deps)});}
 if(action==='status')return json({profile:profileView(p),...await getQueue(db,p,now,deps)});
 if(action==='cancel'){ok(request.method==='POST','请求方式无效。',405);if(q?.match_id)return json({matchId:q.match_id});await db.prepare('DELETE FROM ranked_queue WHERE profile_id=? AND match_id IS NULL').bind(p.id).run();return json({profile:profileView(p),queue:null});}
 ok(q?.match_id,'你还没有进入排位对局。',404);ok(!body.matchId||body.matchId===q.match_id,'对局已经切换。',409);
 const state=await mutate(db,q.match_id,async s=>{const me=s.players.find(x=>x.id===p.id);ok(me,'没有对局权限。',403);me.seen=now;s.updatedAt=now;s.revision++;await advance(s,now,deps);if(action==='match'||s.phase==='finished')return;ok(request.method==='POST','请求方式无效。',405);
 if(action==='leave'){me.forfeit=true;notice(s,me.name+' 已离开比赛',now);await advance(s,now,deps);return;}ok(!me.forfeit,'你已离开这场比赛，请开始新一局。',403);const r=s.rounds[s.index],isDrawer=me.id===r.drawerId;
 if(action==='reportWriting'){ok(body.roundId===r.id&&['drawing','reveal'].includes(s.phase)&&!isDrawer,'只能对当前画手发起写字举报。');r.writingReports=[...new Set([...(r.writingReports||[]),me.id])];
  if(r.writingReports.length>=2&&!r.invalid){r.invalid=true;for(const p of s.players){p.score-=p.roundPoints;p.roundPoints=0;p.solved=false;p.done=false;p.pending=null;}s.history=s.history.filter(h=>h.roundId!==r.id);s.phase='drawing';endRound(s,now,'writing-reported');notice(s,'两位猜词者举报写字，本幅计分取消。',now);}
  return;
 }
 if(action==='select'){ok(s.phase==='choose'&&isDrawer,'现在不是你选词的时候。',403);ok(Number.isInteger(body.index)&&body.index>=0&&body.index<3,'请选择一个词。');startDrawing(s,now,body.index);return;}
 ok(s.phase==='drawing'&&now>=s.startedAt&&now<s.deadline,'等待下一回合开始。');
 if(action==='guess'){ok(!isDrawer&&!me.solved,'画手或已经猜中的玩家不能再猜。',403);ok(now-(me.lastGuess||0)>=500&&me.tries<RULES.maxGuesses,'稍等一下再猜。');const text=String(body.text||'').trim().slice(0,60);ok(text,'先写一个答案。');me.lastGuess=now;me.tries++;s.feedback||={};s.feedback[me.id]=null;if(!awardGuess(s,me,text,now)){if(nearGuess(normalizeGuess(r.level.word),normalizeGuess(text)))s.feedback[me.id]='很接近了，再想一个字！';else notice(s,text,now,me.name,'guess');}
 }else if(action==='react'){ok(['👏','😂','💡','❤️'].includes(body.emoji),'请选择一个表情。');ok(now-(me.lastReaction||0)>=1800,'稍等一下再回应。');me.lastReaction=now;notice(s,body.emoji,now,me.name,'reaction');
 }else if(action==='skip'){ok(isDrawer&&now-s.startedAt>=10000,'先画几笔，开画 10 秒后可以跳过。');endRound(s,now,'skipped');return;
 }else if(action==='draw'){ok(isDrawer&&body.roundId===r.id,'当前不是你的绘画回合。',403);const incoming=validateDrawing(body.events);ok(incoming.length<=12,'请分段同步笔画。');const events=new Map(r.events.map(e=>[e.key,e]));for(const e of incoming)events.set(e.key,e);const merged=[...events.values()];ok(merged.length<=1000&&merged.reduce((n,e)=>n+(e.points?.length||0),0)<=16000,'这幅画已经很丰富了，请等待大家猜词。');r.events=merged;
 }else if(action==='skill'){const skill=SKILLS.find(k=>k.id===body.skill);ok(skill&&!me.usedSkills[skill.id],'这张技能卡本局已经用过。');ok(!me.solved&&isDrawer===(skill.id==='inspire'),'这张技能卡不适合当前回合。');me.usedSkills[skill.id]=true;me.roundSkills[skill.id]=true;me.score-=skill.cost;me.roundPoints-=skill.cost;
 }else throw new RankError('未知操作。');await advance(s,now,deps);
 });await settle(db,state);const fresh=await profile(db,p.id,auth),result=state.phase==='finished'||state.players.find(x=>x.id===p.id).forfeit?await db.prepare('SELECT delta FROM ranked_results WHERE match_id=? AND profile_id=?').bind(state.id,p.id).first():null;return json({profile:profileView(fresh),match:publicMatch(state,p.id,now),result:result?{delta:result.delta}:null});
 }catch(e){if(e instanceof RankError)return json({error:e.message},e.status);console.error('Ranked request failed',e);return json({error:'排位暂时没有接上，请稍后重试。'},500);}
}
