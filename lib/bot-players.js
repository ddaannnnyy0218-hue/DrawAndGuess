import {rankOf} from './ranks.js';
import {BASE_BY_LABEL} from './vocabulary.js';
import {BOT_BANDS,hash} from './game-balance.js';
export function rng(seed){let state=seed>>>0;return ()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};}
export function botPersona(rp,slot,seed,usedNames=[]){const random=rng(seed),index=rankOf(rp).index,cautious=slot%2===0,band=BOT_BANDS[index],style=Math.floor(random()*5),names=['晚风路过','七点半','橘子汽水','纸飞机','南瓜饼','不加香菜','海盐苏打','借一束光','小岛来信','猫在窗边','Momo','画个圈圈','夏日留白','路过的鲸鱼','蘑菇同学','再来一笔'],specialties=['动物朋友','美食厨房','建筑旅行','运动校园','自然风景','日常物件'];
 const offset=(seed+slot*3)%names.length,name=Array.from({length:names.length},(_,i)=>names[(offset+i)%names.length]).find(n=>!usedNames.includes(n))||names[offset];
 return {...band,name,avatar:(seed+slot*3)%8,level:index+1,cautious,version:4,
 skill:cautious?'慢热观察':'灵感联想',specialty:specialties[(seed>>>4)%specialties.length],style,
 knowledge:Math.min(.96,band.knowledge+(cautious?-.055:.055)+(random()-.5)*.04),threshold:band.threshold+(cautious?.035:-.025),
 observe:band.observe*(cautious?1.14:.85),reaction:band.reaction*(cautious?1.12:.88),cooldown:band.cooldown*(.9+random()*.2),
 quality:Math.min(.88,band.quality+(cautious?.065:-.045)),tempo:(cautious?1.12:.98)*(1+(random()-.5)*.12),
 color:['#3c4935','#484851','#4e5c72','#4f4540','#344e4a'][style],seed};
}
export function botTurn(persona,roundId,startedAt){const random=rng(hash(roundId+persona.seed));return {readyAt:startedAt+Math.round(persona.observe*(.82+random()*.36)),attempts:persona.attempts,roundSeed:hash(roundId+':'+persona.seed)};}
function matchesMask(word,mask){if(!mask)return true;const a=[...word],b=[...mask.replaceAll(' ','')];return a.length===b.length&&b.every((c,i)=>c==='＿'||c===a[i]);}
// Only visible-stroke predictions and public hints are inputs. Familiarity
// changes uncertainty and processing time; it never permanently bans a word.
const visualNeighbors={cat:['dog','bear','rabbit'],dog:['cat','bear','rabbit'],bear:['dog','panda'],panda:['bear','cat'],rabbit:['cat','dog'],fish:['shark','dolphin','whale'],shark:['fish','dolphin'],dolphin:['whale','shark'],whale:['dolphin','fish'],bird:['duck','parrot','swan'],duck:['bird','swan'],swan:['duck','bird'],owl:['cat','penguin'],bicycle:['motorbike','wheel'],motorbike:['bicycle','car'],car:['bus','police car','truck'],bus:['school bus','truck'],apple:['pear','peach'],pear:['apple'],cake:['birthday cake','bread'],umbrella:['mushroom','parachute'],clock:['alarm clock','compass'],house:['barn','castle'],tree:['palm tree','bush'],flower:['sun','tree'],cup:['mug','coffee cup'],mug:['cup','teapot']};
export function observeSketch(predictions,persona,tried=[],context={}){
 const merged=new Map();for(const p of predictions){if(!BASE_BY_LABEL.has(p.label))continue;const old=merged.get(p.label);if(!old||p.confidence>old.confidence)merged.set(p.label,p);}
 const visible=[...merged.values()].sort((a,b)=>b.confidence-a.confidence),best=visible[0];if(!best||best.confidence<(persona.probe??.12))return null;
 const knowledge=persona.knowledge??.5,choices=[];
 for(const p of visible){const w=BASE_BY_LABEL.get(p.label);if(p.confidence<(persona.probe??.12))continue;const expert=w.chapter===persona.specialty,mask=matchesMask(w.word,context.hint),topic=!context.chapter||w.chapter===context.chapter;
  if(tried.includes(w.id)||tried.includes(w.label)||(knowledge>=.7&&(!mask||!topic)))continue;
  choices.push({word:w,confidence:p.confidence,score:p.confidence*(mask?1:.35)*(topic?1:.65)*(expert?1.08:1),certain:p.confidence>=persona.threshold&&mask,kind:'vision'});
 }
 // A novice can confuse similar visible silhouettes. These hypotheses use the
 // observed class, never the hidden target, and are not guaranteed to be wrong.
 if(best.confidence>=.16&&best.confidence<persona.threshold+.12&&tried.length<2){for(const label of visualNeighbors[best.label]||[]){const w=BASE_BY_LABEL.get(label);if(!w||tried.includes(w.id)||!matchesMask(w.word,context.hint))continue;choices.push({word:w,confidence:best.confidence*.45,score:best.confidence*(1-knowledge)*.8,certain:false,kind:'resemblance'});}}
 choices.sort((a,b)=>b.score-a.score);if(!choices.length)return null;
 const random=rng(hash(persona.seed+':hypothesis:'+context.roundSeed+':'+tried.join('|'))),alternatives=choices.slice(0,3);let pick=alternatives[0];
 if(alternatives.length>1&&random()<(1-knowledge)*(persona.cautious?.25:.7)){const nearby=alternatives.filter(c=>c.score>=pick.score*.3);pick=nearby[Math.min(nearby.length-1,1+Math.floor(random()*(nearby.length-1)))];}
 return {id:pick.word.id,label:pick.word.label,text:pick.word.word,confidence:pick.confidence,certain:pick.certain,kind:pick.kind};
}
export function reactionDelay(persona,guess,turn,tries=0){const random=rng(hash(turn.roundSeed+':'+guess.id+':'+tries)),hesitation=(random()+random()+random())/3,expert=BASE_BY_LABEL.get(guess.label)?.chapter===persona.specialty,unfamiliar=expert?0:(1-(persona.knowledge??.5))*1800;
 return Math.round(persona.reaction*(.68+hesitation*.9)+(1-guess.confidence)*1800+unfamiliar+[...guess.text].length*(180+random()*130));
}
export function thinkBot(player,predictions,now,context={}){const p=player;if(p.solved||p.forfeit||p.tries>=p.persona.attempts||now<p.nextThink||now<p.turn.readyAt)return null;
 const guess=observeSketch(predictions,p.persona,p.tried,{...context,roundSeed:p.turn.roundSeed});
 if(p.pending){
  // Finish a thought already being typed. Small prediction changes must not
  // continuously reset the timer and silence the bot while someone is drawing.
  if(now>=p.pending.at){const result=p.pending;p.tried.push(result.id);p.pending=null;p.nextThink=now+p.persona.cooldown;p.tries++;return result;}
  if(guess&&guess.id!==p.pending.id&&guess.confidence>p.pending.confidence+.3&&now<p.pending.at-1000){p.pending={...guess,at:Math.min(p.pending.at+1000,now+reactionDelay(p.persona,guess,p.turn,p.tries))};}
  return null;
 }
 if(!guess)return null;p.pending={...guess,at:now+reactionDelay(p.persona,guess,p.turn,p.tries)};return null;
}
export async function readVisibleSketch(events,judge,cycle=0){
 const result=(await judge(events)).map(p=>({...p,region:'whole'}));
 let visible=[];const hidden=new Set();for(const e of events){if(e.type==='clear'){visible=[];hidden.clear();}else if(e.type==='undo')hidden.add(e.id);else visible.push(e);}
 const strokes=visible.filter(e=>!hidden.has(e.id)&&e.type==='stroke'&&e.color!=='#fffefb'&&e.points?.length>1);if(strokes.length<3)return result;
 const regions=cycle%2?[['top',p=>p[1]<.46],['bottom',p=>p[1]>=.46]]:[['left',p=>p[0]<.52],['right',p=>p[0]>=.52]];
 for(const [region,inside] of regions){const crop=strokes.filter(e=>e.points.filter(inside).length/e.points.length>.75);if(!crop.length||crop.length===strokes.length)continue;result.push(...(await judge(crop)).map(p=>({...p,region})));}
 return result;
}
export function normaliseSample(sample,color='#292c25',seed=1){const random=rng(seed),strokes=sample.drawing,xs=strokes.flatMap(s=>s[0]),ys=strokes.flatMap(s=>s[1]),x0=Math.min(...xs),y0=Math.min(...ys),w=Math.max(...xs)-x0||1,h=Math.max(...ys)-y0||1,scale=Math.min(760/w,455/h)*(.96+random()*.05),angle=(random()-.5)*.045,dx=(random()-.5)*25,dy=(random()-.5)*18;
 return strokes.map(([x,y],i)=>({type:'stroke',id:'human-trace-'+i,key:'human-trace-'+i,color,size:4.5+random()*1.5,brush:'ink',points:x.map((v,j)=>{const px=(v-x0-w/2)*scale,py=(y[j]-y0-h/2)*scale;return [(500+dx+px*Math.cos(angle)-py*Math.sin(angle))/1000,(325+dy+px*Math.sin(angle)+py*Math.cos(angle))/650];})}));
}
export function planReplay(events,persona,seed){const random=rng(seed);let t=420,totalLength=0,previous=null;
 const times=events.map(e=>{const ps=e.points;if(previous)t+=Math.min(650,Math.hypot((ps[0][0]-previous[0])*1000,(ps[0][1]-previous[1])*650)*.4);t+=140+random()*440;const at=[];
  for(let i=0;i<ps.length;i++){const a=ps[Math.max(0,i-1)],b=ps[i],distance=Math.hypot((b[0]-a[0])*1000,(b[1]-a[1])*650);totalLength+=distance;let bend=1;if(i>1){const before=ps[i-2],u=[(a[0]-before[0])*1000,(a[1]-before[1])*650],v=[(b[0]-a[0])*1000,(b[1]-a[1])*650],den=Math.hypot(...u)*Math.hypot(...v);if(den)bend=1+(1-(u[0]*v[0]+u[1]*v[1])/den)*.35;}
   t+=Math.max(12,distance/(.2+random()*.08))*bend;at.push(t);
  }previous=ps.at(-1);return at;
 });const duration=Math.max(14000,Math.min(41000,(14500+Math.sqrt(totalLength)*120+events.length*250)*persona.tempo));return {events,times:times.map(row=>row.map(x=>Math.round(x/t*duration))),duration};
}
export function replayAt(plan,elapsed){if(!plan)return [];const ms=Math.max(0,elapsed),result=[];
 for(let i=0;i<plan.events.length;i++){const e=plan.events[i],times=plan.times[i],points=[];for(let j=0;j<e.points.length;j++){if(times[j]<=ms)points.push(e.points[j]);else{if(j>0&&times[j-1]<ms){const f=(ms-times[j-1])/(times[j]-times[j-1]||1),a=e.points[j-1],b=e.points[j];points.push([a[0]+(b[0]-a[0])*f,a[1]+(b[1]-a[1])*f]);}break;}}if(points.length)result.push({...e,points});}
 return result;
}
function timedPlan(events,duration,persona,seed){if(!events.length)return {events:[],times:[],duration:0};const plan=planReplay(events,persona,seed);return {...plan,times:plan.times.map(row=>row.map(t=>Math.round(t/plan.duration*duration))),duration};}
export async function botSketch(level,persona,seed,assets,recent=[]){const response=await assets('/drawings/'+level.label.replaceAll(' ','-')+'.json');if(!response.ok)throw new Error('绘画素材暂时未准备好。');const data=await response.json(),random=rng(seed),eligible=data.samples.map(s=>({s,q:s.quality?.confidence??.5})).filter(x=>x.q>=.12),sourceIds=[];
 const select=(quality,avoid=[])=>{const available=eligible.filter(x=>!avoid.includes(level.label+':'+x.s.sourceId)),fresh=available.filter(x=>!recent.includes(level.label+':'+x.s.sourceId)),pool=(fresh.length?fresh:available.length?available:eligible).sort((a,b)=>a.q-b.q),at=Math.round(Math.max(.3,Math.min(.98,quality+(random()+random()-1)*.10))*(pool.length-1));return pool[at]||{s:data.samples[data.preferred||0],q:.4};};
 const first=select(persona.quality),source=level.label+':'+first.s.sourceId;sourceIds.push(source);const second=select(Math.min(.95,persona.quality+.18),sourceIds);sourceIds.push(level.label+':'+second.s.sourceId);
 const fit=(sample,index,x,w,h)=>normaliseSample(sample,persona.color,seed^hash('view:'+index)).map(e=>({...e,id:'view'+index+'-'+e.id,key:'view'+index+'-'+e.key,size:Math.max(3,Math.min(9,e.size*[.85,1.3,.95,1.1,.8][persona.style??0])),points:e.points.map(([px,py])=>[Math.max(.02,Math.min(.98,x+(px-.5)*w/.76)),Math.max(.02,Math.min(.98,.5+(py-.5)*h/.72))])}));
 const primary=fit(first.s,0,.39,.61,.73),cut=primary.length>1?Math.max(1,Math.min(primary.length-1,Math.ceil(primary.length*.6))):primary.length,initial=primary.slice(0,cut),details=primary.slice(cut),extra=fit(second.s,1,.82,.28,.49);
 const initialMs=Math.round((14000+random()*3000)*persona.tempo),detailMs=details.length?Math.round(8000+random()*3000):0,detailAt=initialMs+Math.round(1800+random()*1500),retryAt=Math.min(35000,(details.length?detailAt+detailMs:initialMs)+2200+Math.round(random()*1800)),extraMs=Math.min(53000-retryAt,Math.round(14000+random()*4000));
 return {...timedPlan(initial,initialMs,persona,seed),details:timedPlan(details,detailMs,persona,seed^0x51),reinforce:timedPlan(extra,extraMs,persona,seed^0x67),detailAt,retryAt,sourceId:source,sourceIds,clarity:first.q};
}
export function advanceBotDrawing(round,elapsed,needsMore=true){if(!round.plan||!needsMore)return;round.drawStages||=[];
 if(round.plan.details?.events.length&&elapsed>=round.plan.detailAt&&!round.drawStages.some(s=>s.kind==='details'))round.drawStages.push({kind:'details',at:round.plan.detailAt});
 if(round.plan.reinforce?.events.length&&elapsed>=round.plan.retryAt&&!round.drawStages.some(s=>s.kind==='reinforce'))round.drawStages.push({kind:'reinforce',at:round.plan.retryAt});
}
export function botDrawingAt(round,elapsed){const plan=round.plan;if(!plan)return [];const result=replayAt(plan,elapsed);for(const stage of round.drawStages||[])if(elapsed>=stage.at)result.push(...replayAt(plan[stage.kind],elapsed-stage.at));return result;}
