// Tunable game rules. A bot's skill is fixed before the match, never changed to
// force a win/loss in response to the human's current score.
export const RULES={seconds:55,sceneSeconds:55,chooseMs:10000,revealMs:2800,chaseMs:22000,artistPoints:50,maxGuesses:24,autoNextMs:8000};
export const BOT_BANDS=[
 {knowledge:.43,threshold:.58,probe:.12,observe:6800,reaction:4300,cooldown:6200,attempts:4,quality:.66},
 {knowledge:.52,threshold:.54,probe:.15,observe:6000,reaction:3900,cooldown:5800,attempts:4,quality:.68},
 {knowledge:.62,threshold:.49,probe:.19,observe:5200,reaction:3400,cooldown:5200,attempts:4,quality:.70},
 {knowledge:.70,threshold:.44,probe:.23,observe:4500,reaction:3000,cooldown:4700,attempts:5,quality:.73},
 {knowledge:.78,threshold:.39,probe:.28,observe:3800,reaction:2600,cooldown:4200,attempts:5,quality:.76},
 {knowledge:.85,threshold:.34,probe:.32,observe:3200,reaction:2300,cooldown:3800,attempts:5,quality:.79},
];
export function hash(value){let h=2166136261;for(const c of String(value)){h^=c.codePointAt(0);h=Math.imul(h,16777619);}return h>>>0;}
export function guessPoints(elapsedMs,seconds=RULES.seconds){const f=Math.max(0,Math.min(1,elapsedMs/(seconds*1000)));return Math.round(80+220*Math.pow(1-f,.85));}
export function nearGuess(word,text){const a=[...word],b=[...text];if(Math.min(a.length,b.length)<3||Math.abs(a.length-b.length)>1)return false;
 let previous=Array.from({length:b.length+1},(_,i)=>i);for(let i=1;i<=a.length;i++){const row=[i];for(let j=1;j<=b.length;j++)row.push(Math.min(row[j-1]+1,previous[j]+1,previous[j-1]+(a[i-1]===b[j-1]?0:1)));previous=row;}return previous[b.length]===1;
}
