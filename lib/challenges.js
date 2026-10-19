import {LEVELS,matchesLevel} from './levels.js';
import {brushIds} from './brushes.js';
class ChallengeError extends Error{constructor(message,status=400){super(message);this.status=status;}}
const ok=(condition,message,status)=>{if(!condition)throw new ChallengeError(message,status);};
const nameOf=value=>String(value||'无名画家').replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,16)||'无名画家';
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
async function challenge(db,id,now){
 ok(/^[a-f0-9]{20}$/.test(id||''),'挑战链接无效。',404);
 const row=await db.prepare('SELECT * FROM drawing_challenges WHERE id=?').bind(id).first();
 ok(row,'这幅挑战没有找到，请检查链接。',404);ok(row.expires_at>now,'这幅挑战已过期，邀请朋友再画一幅吧。',410);
 return row;
}
function drawingEvents(events){
 ok(Array.isArray(events)&&events.length>0&&events.length<=1000,'请先画一幅画，最多保存 1000 段笔画。');
 let points=0;
 const validated=events.map(e=>{
  ok(['stroke','clear','undo'].includes(e.type),'绘画数据无效。');
  const id=String(e.id||'').slice(0,50),key=String(e.key||'').slice(0,50);ok(id&&key,'笔画编号无效。');
  if(e.type!=='stroke')return {type:e.type,id,key};
  ok(/^#[0-9a-fA-F]{6}$/.test(e.color)&&Number.isFinite(e.size)&&e.size>=1&&e.size<=36&&brushIds.includes(e.brush||'ink'),'画笔数据无效。');
  ok(Array.isArray(e.points)&&e.points.length>0&&e.points.length<=150,'笔画点数无效。');
  ok(e.points.every(p=>Array.isArray(p)&&p.length===2&&p.every(n=>Number.isFinite(n)&&n>=0&&n<=1)),'笔画坐标无效。');
  points+=e.points.length;return {type:'stroke',id,key,color:e.color,size:e.size,brush:e.brush||'ink',points:e.points};
 });
 ok(points>=8&&points<=16000,'再画几笔吧，或者简化一下这幅画。');
 ok(JSON.stringify(validated).length<180000,'这幅画太大了，简化一下再分享吧。');
 return validated;
}
function presentAttempt(state,row,level,now){
 return {id:row.id,name:row.name,deadline:state.deadline,now,tries:state.tries,hints:state.hints,finished:state.finished,solved:state.solved,score:state.score||0,
 hint:state.hints?'中文 '+[...level.word].length+' 个字，英文以 '+level.label[0].toUpperCase()+' 开头。':null,
 word:state.finished?level.word:null,label:state.finished?level.label:null};
}
async function attemptRow(db,id,attemptId,token){
 const row=await db.prepare('SELECT * FROM challenge_attempts WHERE id=? AND challenge_id=? AND token=?').bind(attemptId,id,token).first();
 ok(row,'这次挑战会话已失效，请重新开始。',401);return row;
}
export async function challengeRequest(request,db,now=Date.now()){
 try{
  ok(db,'服务器暂时未就绪。',503);
  const url=new URL(request.url);let body={};
  if(request.method==='POST'){
   const origin=request.headers.get('origin');ok(!origin||origin===url.origin,'无法从这个页面提交。',403);
   const raw=await request.text();ok(raw.length<200000,'这幅画的数据太大。',413);
   try{body=JSON.parse(raw);}catch{throw new ChallengeError('请求内容无效。');}
   ok(body&&typeof body==='object'&&!Array.isArray(body),'请求内容无效。');
  }
  const action=request.method==='GET'?url.searchParams.get('action')||'info':body.action;
  if(action==='create'){
   ok(request.method==='POST','请求方式无效。',405);
   const level=LEVELS.find(l=>l.id===body.levelId);ok(level,'请选择一个绘画题目。');
   const drawing=drawingEvents(body.events),id=crypto.randomUUID().replaceAll('-','').slice(0,20);
   const expires=now+7*86400000;
   await db.batch([
    db.prepare('DELETE FROM challenge_attempts WHERE challenge_id IN (SELECT id FROM drawing_challenges WHERE expires_at < ?)').bind(now),
    db.prepare('DELETE FROM drawing_challenges WHERE expires_at < ?').bind(now),
    db.prepare('INSERT INTO drawing_challenges (id,level_id,creator,drawing,created_at,expires_at) VALUES (?,?,?,?,?,?)').bind(id,level.id,nameOf(body.name),JSON.stringify(drawing),now,expires),
   ]);
   return json({id,expiresAt:expires});
  }
  const id=body.id||url.searchParams.get('id');const c=await challenge(db,id,now),level=LEVELS.find(l=>l.id===c.level_id);
  if(action==='info'){
   const board=await db.prepare('SELECT name,MAX(score) AS score FROM challenge_attempts WHERE challenge_id=? AND solved=1 GROUP BY name ORDER BY score DESC LIMIT 10').bind(id).all();
   return json({id,creator:c.creator,createdAt:c.created_at,expiresAt:c.expires_at,board:board.results});
  }
  if(action==='start'){
   ok(request.method==='POST','请求方式无效。',405);
   const attemptId=crypto.randomUUID(),token=crypto.randomUUID()+crypto.randomUUID(),name=nameOf(body.name);
   const state={deadline:now+60000,tries:0,hints:0,finished:false,solved:false,score:0};
   await db.prepare('INSERT INTO challenge_attempts (id,challenge_id,token,name,state,version,score,solved,started_at) VALUES (?,?,?,?,?,0,0,0,?)').bind(attemptId,id,token,name,JSON.stringify(state),now).run();
   return json({token,attempt:presentAttempt(state,{id:attemptId,name},level,now),events:JSON.parse(c.drawing)});
  }
  ok(['guess','hint','attempt'].includes(action),'未知操作。');
  const attemptId=body.attemptId||url.searchParams.get('attemptId'),token=body.token||request.headers.get('authorization')?.replace(/^Bearer /,'');
  for(let retry=0;retry<8;retry++){
   const row=await attemptRow(db,id,attemptId,token),s=JSON.parse(row.state);
   if(s.finished)return json({attempt:presentAttempt(s,row,level,now),events:JSON.parse(c.drawing)});
   if(now>=s.deadline){s.finished=true;}
   else if(action==='guess'){
    ok(request.method==='POST','请求方式无效。',405);
    const text=String(body.text||'').trim().slice(0,80);ok(text,'先写一个答案吧。');
    ok(now-(s.lastGuess||0)>=300,'稍等一下再猜。');s.lastGuess=now;s.tries++;
    if(matchesLevel(level,text)){
     s.solved=true;s.finished=true;s.score=Math.max(20,200-Math.floor((now-row.started_at)/1000)*2-s.hints*30-(s.tries-1)*5);
    }else if(s.tries>=12)s.finished=true;
   }else if(action==='hint'){ok(request.method==='POST','请求方式无效。',405);s.hints=1;}
   const saved=await db.prepare('UPDATE challenge_attempts SET state=?,version=version+1,score=?,solved=? WHERE id=? AND version=?')
    .bind(JSON.stringify(s),s.score,s.solved?1:0,row.id,row.version).run();
   if(saved.meta.changes===1)return json({attempt:presentAttempt(s,row,level,now),events:JSON.parse(c.drawing)});
  }
  throw new ChallengeError('挑战有点忙，请再试一次。',409);
 }catch(error){if(error instanceof ChallengeError)return json({error:error.message},error.status);console.error('Async challenge',error);return json({error:'挑战暂时没接上，请稍后重试。'},500);}
}
