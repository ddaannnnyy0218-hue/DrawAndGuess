export const PACKS = [
  { id: 'everyday', name: '日常脑洞', en: 'Everyday things', description: '从奶茶到外星人，谁都能画两笔。', count: 60, color: '#c6e77c' },
  { id: 'campus', name: '校园现场', en: 'School life', description: '上课、下课，以及那些熟悉的瞬间。', count: 40, color: '#ffd489' },
  { id: 'english', name: '英语画猜', en: 'Picture your words', description: '画出线索，用英文猜出答案。', count: 50, color: '#c6d8fc' },
];
function list(words) {
  return words.split('|').map(item => { const [word, ...aliases] = item.split('/'); return {word, aliases}; });
}
export const WORDS = {
  everyday: list('雨伞/伞|冰淇淋/雪糕|火山|宇航员|奶茶|滑板|热气球|仙人掌|机器人|披萨/比萨|望远镜|企鹅|外星人|过山车|独角兽|汉堡|恐龙|西瓜|彩虹|火箭|潜水艇/潜艇|雪人|自行车/单车|吉他|帐篷|瀑布|蜗牛|蜜蜂|海盗|章鱼|磁铁|灯塔|向日葵|爆米花|龙卷风|摩天轮|乌龟|刺猬|寿司|猫头鹰|降落伞|跷跷板|闹钟|金字塔|草莓|滑雪|风筝|礼物|薯条|篮球|骆驼|牙刷|键盘|耳机|沙发|洗衣机|海豚|蘑菇|秋千|蛋糕'),
  campus: list('迟到|打瞌睡/睡觉|拔河|黑板|书包|足球|实验室|考试|图书馆|食堂|升旗|校车|放学|跳绳|显微镜|课间操|毕业照|奖杯|作业|铅笔盒/笔袋|橡皮|圆规|地球仪|篮球场|排队|值日|运动会|演讲|雨中跑步|打喷嚏|举手|传纸条|军训|合唱|合影|阅读|跳远|羽毛球|乒乓球|午休'),
  english: list('umbrella|ice cream/icecream|volcano|astronaut|skateboard|cactus|robot|pizza|telescope|penguin|alien|unicorn|hamburger/burger|dinosaur|watermelon|rainbow|rocket|submarine|snowman|bicycle/bike|guitar|tent|waterfall|snail|bee|pirate|octopus|magnet|lighthouse|sunflower|popcorn|tornado|turtle|hedgehog|sushi|owl|parachute|clock|pyramid|strawberry|kite|gift/present|basketball|camel|toothbrush|keyboard|headphones|sofa/couch|dolphin|mushroom'),
};
