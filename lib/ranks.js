export const RANKS=[
 {name:'青铜',min:0,color:'#b18058',tag:'人机热身',wait:0},
 {name:'白银',min:200,color:'#8d9ca4',tag:'优先匹配真人',wait:8000},
 {name:'黄金',min:500,color:'#c7a23b',tag:'优先匹配真人',wait:12000},
 {name:'铂金',min:900,color:'#55a894',tag:'优先匹配真人',wait:15000},
 {name:'钻石',min:1400,color:'#6a91cf',tag:'优先匹配真人',wait:18000},
 {name:'大师',min:2000,color:'#a17dc4',tag:'优先匹配真人',wait:20000},
];
export function rankOf(rp){let i=0;while(i<RANKS.length-1&&rp>=RANKS[i+1].min)i++;const r=RANKS[i],next=RANKS[i+1];return {...r,index:i,next:next?.min??null,progress:next?Math.min(1,(rp-r.min)/(next.min-r.min)):1};}
export const SKILLS=[{id:'hint',name:'线索卡',description:'提前揭示一个字或英文首字母',cost:20},{id:'peek',name:'排除卡',description:'把答案缩小到三个选项',cost:30},{id:'inspire',name:'灵感卡',description:'作画时获得构图建议',cost:20}];

const tips={cat:'先画两个尖耳，再加圆脸和胡须。',dog:'先画头和垂耳，再补鼻子与尾巴。',rabbit:'长耳朵比脸更重要，先画两只长耳。',elephant:'用长鼻子和大耳朵突出特征。',giraffe:'长脖子加小脑袋，最后补斑点。',fish:'先画椭圆身体，加三角尾巴和一只眼睛。',bird:'先画身体和尖嘴，再补翅膀。',butterfly:'先画中间的身体，再画两侧对称翅膀。',spider:'先画小圆身体，再加左右各四条腿。',snail:'先画螺旋壳，再加身体和触角。',apple:'先画圆润外形，再补凹下的顶端与果柄。',banana:'先画两条弯弧，再把两端连起来。',pineapple:'先画椭圆果身，再画顶部尖叶。',mushroom:'先画伞形菌盖，再加短粗菌柄。',flower:'先画花心和花瓣，再加茎和叶子。',tree:'先画树干，再画蓬松树冠。',umbrella:'先画半圆伞面，再加长柄和弯钩。',bicycle:'两个轮子先定位，再用三角形车架连起来。',car:'先画两个轮子和车身，最后补车窗。',airplane:'先画细长机身，再加两边大机翼。',house:'先画方形屋身和三角屋顶，再加门窗。',cup:'先画杯口与杯身，再加侧面的把手。','coffee cup':'杯身加侧把手，最后加几条上升的热气。',teapot:'圆壶身加壶嘴和把手，别忘了壶盖。',pizza:'用三角外形配弧形饼边，再点几个配料。',hamburger:'两层弧形面包，中间加几条夹层。',clock:'先画圆盘和两根指针，再补刻度。',camera:'先画方形机身，再加中间的大圆镜头。',key:'圆环连长柄，柄尾加两三个齿。',eyeglasses:'两只镜框先画好，中间加鼻梁，外侧加镜腿。'};
export function drawingTip(level){return level.tip||tips[level.label]||({'形状热身':'先用最简单的大轮廓定形，保持线条清楚。','水果摊位':'突出果实的轮廓，再加果柄、叶片或纹理。','动物朋友':'先画头和身体，再加最有辨识度的耳朵、尾巴或鼻子。','小小自然':'先画身体，再加翅膀、腿、壳或触角这些关键特征。','风景速写':'先画主体的大轮廓，再补门窗、枝叶或连接结构。','厨房角落':'先画外形，再补把手、开口和使用部分。','吃点好吃的':'先画食物外形，再补夹层、配料或切口。','出发吧':'先画车身或机身，再补轮子、翼或帆。','随身小物':'先画外轮廓，再补提手、镜框或绑带这些特征。','生活发明家':'先画外壳，再加屏幕、按键、镜头或指针。'}[level.chapter])||'先画主体轮廓，再补最有辨识度的部分。';}
