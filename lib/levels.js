import entries from './levels.json' with {type:'json'};
export const LEVELS=entries.map(([label,word,chapter],index)=>({id:index+1,label,word,chapter,seconds:index<20?45:index<60?40:35}));
export function normalizeGuess(text){return String(text).normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]/gu,'');}
const aliases={'圆圈':['圆','circle'],'正方形':['方形','方块'],'三角形':['三角'],'星星':['星'],'云朵':['云'],'冰淇淋':['雪糕','冰激凌'],'披萨':['比萨'],'自行车':['单车','bike'],'公交车':['巴士','公共汽车'],'潜水艇':['潜艇'],'海龟':['乌龟','turtle'],'双肩包':['书包','背包'],'高脚杯':['红酒杯'],'冰棍':['冰棒'],'笔记本电脑':['笔记本'],'电脑':['计算机'],'轮滑鞋':['溜冰鞋'],'杯子':['水杯'],'咖啡杯':['咖啡'],'时钟':['钟','钟表'],'生日蛋糕':['蛋糕'],'猫':['小猫','猫咪'],'狗':['小狗','狗狗'],'兔子':['兔'],'鱼':['小鱼']};
export function matchesLevel(level,text){const answers=[level.word,...(level.parts?.length>1?[]:[level.label]),...(aliases[level.word]||[]),...(level.aliases||[])];
 const simple=s=>normalizeGuess(s).replace(/正在|一只|一头|一条|一辆|一个|一座|的|在/g,'');
 return answers.filter(Boolean).some(answer=>normalizeGuess(answer)===normalizeGuess(text)||(level.parts?.length>1&&simple(answer)===simple(text)));
}
export function starsFor(elapsed,limit,hints=0){return Math.max(1,3-(elapsed>limit*.5?1:0)-(elapsed>limit*.82?1:0)-hints);}
