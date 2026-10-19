import {BASE_WORDS,VOCABULARY} from './vocabulary.js';
export const WORDS={
 everyday:VOCABULARY,
 campus:VOCABULARY.filter(w=>w.chapter==='运动校园'),
 english:BASE_WORDS.map(w=>({id:'en:'+w.label,word:w.label.toLowerCase(),aliases:w.label==='bicycle'?['bike']:w.label==='hamburger'?['burger']:[],chapter:'英语画猜'})),
 animals:BASE_WORDS.filter(w=>w.chapter==='动物朋友'||w.chapter==='脑洞角色'),
 food:VOCABULARY.filter(w=>['美食厨房'].includes(w.chapter)),
 travel:VOCABULARY.filter(w=>['建筑旅行','自然风景'].includes(w.chapter)),
};
export const PACKS=[
 {id:'everyday',name:'日常物件',en:'Everyday words',description:'苹果、雨伞、自行车，一个词就开画。',color:'#c6e77c'},
 {id:'campus',name:'校园生活',en:'School & talents',description:'球场、乐器和课本，都是熟悉的词。',color:'#ffd489'},
 {id:'english',name:'英语画猜',en:'Picture your words',description:'画出线索，用英文猜出答案。',color:'#c6d8fc'},
 {id:'animals',name:'动物朋友',en:'Animal friends',description:'从猫咪到火烈鸟，先抓住它的特征。',color:'#f2c7ae'},
 {id:'food',name:'美食厨房',en:'Food & kitchen',description:'汉堡、蛋糕、茶壶，先抓住轮廓。',color:'#e9d788'},
 {id:'travel',name:'自然旅行',en:'Nature & travel',description:'风景、建筑和交通工具，一个词一种画法。',color:'#b9ded8'},
].map(p=>({...p,count:WORDS[p.id].length}));
