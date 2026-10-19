import {readFileSync,mkdirSync} from 'node:fs';
import {createRequire} from 'node:module';
import {VOCABULARY} from '../lib/vocabulary.js';
import {botPersona,botSketch,advanceBotDrawing,botDrawingAt} from '../lib/bot-players.js';
const require=createRequire(import.meta.url),mfRequire=createRequire(createRequire(require.resolve('wrangler/package.json')).resolve('miniflare')),sharp=mfRequire('sharp');
const names=[['猫','CAT'],['海豚','DOLPHIN'],['自行车','BICYCLE'],['雨伞','UMBRELLA']],frames=[8000,18000,31000,51000],examples=names.flatMap(([word,name])=>frames.map(t=>[word,name+' / '+t/1000+' seconds',t]));
const assets=async path=>new Response(readFileSync('public'+path)),cells=[],rounds=new Map();
for(let i=0;i<examples.length;i++){const [word,title,elapsed]=examples[i],level=VOCABULARY.find(w=>w.word===word);if(!rounds.has(word))rounds.set(word,{plan:await botSketch(level,botPersona(0,0,123+Math.floor(i/4)*317),1747+Math.floor(i/4)*533,assets)});const round=rounds.get(word);advanceBotDrawing(round,elapsed,true);const plan={events:botDrawingAt(round,elapsed)},x=i%4*310,y=Math.floor(i/4)*235;
 const drawing=plan.events.map(e=>'<polyline points="'+e.points.map(([x,y])=>x*1000+','+y*650).join(' ')+'" stroke="'+e.color+'" stroke-width="'+e.size+'" fill="none" stroke-linecap="round" stroke-linejoin="round"/>').join('');
 cells.push('<g transform="translate('+x+','+y+')"><rect x="6" y="6" width="298" height="223" rx="10" fill="#fffefb" stroke="#dddfd3"/><svg x="12" y="12" width="286" height="184" viewBox="0 0 1000 650">'+drawing+'</svg><text x="18" y="215" font-size="11" font-family="sans-serif" fill="#65705a">'+title+'</text></g>');
}
mkdirSync('node_modules/.cache',{recursive:true});const path=process.argv[2]||'node_modules/.cache/bot-examples.png';await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1240" height="940"><rect width="1240" height="940" fill="#f4f3ed"/>'+cells.join('')+'</svg>')).png().toFile(path);console.log(path);
