import lexicon from './lexicon.json' with {type:'json'};
const excluded=new Set(['line','squiggle','zigzag','stitches','animal migration','camouflage','spreadsheet']);
const advanced=new Set(['octagon','hexagon','goatee','moustache','clarinet','trombone','aircraft carrier','anvil','stethoscope','snorkel']);
export const DRAWING_CATEGORIES=lexicon.map(([label,word,chapter,aliases=''])=>({id:'word:'+label,label,word,chapter,aliases:aliases.split('/').filter(Boolean),difficulty:advanced.has(label)?2:1,parts:[{label,x:.5,y:.5,w:.76,h:.72}]}));
export const BASE_WORDS=DRAWING_CATEGORIES.filter(w=>!excluded.has(w.label));
export const BASE_BY_LABEL=new Map(BASE_WORDS.map(w=>[w.label,w]));
export const VOCABULARY=BASE_WORDS;
export const VOCABULARY_STATS={base:BASE_WORDS.length,scenes:0,total:BASE_WORDS.length};
export function wordTopic(word){return word.chapter||'日常物件';}
export function wordHint(word,elapsed=0,seconds=55){
 const chars=[...word.word],fraction=elapsed/(seconds*1000),indices=[];
 if(fraction>=.55&&chars.length>=3)indices.push(Math.floor(chars.length/2));
 if(fraction>=.78&&chars.length>=2)indices.push(chars.length===2?0:chars.length-1);
 return chars.map((c,i)=>indices.includes(i)?c:'＿').join(' ');
}
export function selectWords(pool,random,recent=[],count=3){
 const banned=new Set(recent),age=new Map(recent.map((id,i)=>[id,i])),source=pool.filter(w=>!banned.has(w.id)),chosen=[];
 while(chosen.length<count){if(!source.length){const recycled=pool.filter(w=>!chosen.some(c=>c.id===w.id)).sort((a,b)=>(age.get(a.id)??-1)-(age.get(b.id)??-1));source.push(...recycled.slice(0,Math.max(count*4,8)));if(!source.length)break;}const at=Math.floor(random()*source.length),candidate=source.splice(at,1)[0];
  if(candidate.label&&chosen.some(w=>w.label===candidate.label)&&source.length>count)continue;chosen.push(candidate);
 }return chosen;
}
