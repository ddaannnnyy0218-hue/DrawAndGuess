export const BRUSHES=[
 {id:'ink',name:'签字笔',description:'圆润、清晰、顺手',accent:'#c6e77c'},
 {id:'marker',name:'荧光笔',description:'半透明叠色',accent:'#ffd489'},
 {id:'double',name:'双线笔',description:'一笔，两条平行线',accent:'#b7d7f3'},
 {id:'rainbow',name:'彩虹笔',description:'沿着笔迹变换色彩',accent:'#f1bad4'},
 {id:'stars',name:'星点笔',description:'把笔迹变成小星星',accent:'#d3c4f2'},
 {id:'pixel',name:'像素笔',description:'方块组成的涂鸦',accent:'#b9e2d2'},
];
export const brushIds=BRUSHES.map(b=>b.id);
export function sanitizeStroke(e){
 if(!brushIds.includes(e.brush||'ink'))throw new Error('未知笔刷。');
 return {...e,brush:e.brush||'ink'};
}
