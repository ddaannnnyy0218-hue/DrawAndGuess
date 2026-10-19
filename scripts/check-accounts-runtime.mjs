import {createRequire} from 'node:module';
import {readFileSync,readdirSync} from 'node:fs';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {Miniflare}=createRequire(require.resolve('wrangler/package.json'))('miniflare');
const mf=new Miniflare({
  modules:[
    {type:'ESModule',path:resolve('dist/server/index.js')},
    ...readdirSync('dist/server',{recursive:true}).filter(path=>/\.(m?js)$/.test(path)&&path!=='index.js').map(path=>({type:'ESModule',path:resolve('dist/server',path)})),
  ],
  modulesRoot:resolve('dist/server'),
  compatibilityDate:'2026-05-15',
  compatibilityFlags:['nodejs_compat'],
  d1Databases:{DB:'00000000-0000-4000-8000-000000000000'},
  cf:false,
  assets:{directory:resolve('dist/client'),binding:'ASSETS',routerConfig:{has_user_worker:true,invoke_user_worker_ahead_of_assets:true}},
});
try{
 const db=await mf.getD1Database('DB');
 for(const file of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())for(const statement of readFileSync('drizzle/'+file,'utf8').split('--> statement-breakpoint').filter(s=>s.trim()))await db.prepare(statement).run();
 async function call(path,body,user){const response=await mf.dispatchFetch('https://game.test'+path,{method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json',Origin:'https://game.test'}:{}),...(user?{'oai-authenticated-user-id':user}: {})},...(body?{body:JSON.stringify(body)}:{})});const data=await response.json();return {status:response.status,data};}
 assert.deepEqual((await call('/api/account')).data,{signedIn:false,account:null});
 const guest=await call('/api/ranked',{action:'register',name:'Runtime guest'});assert.equal(guest.status,200);
 const claim=await call('/api/account',{action:'register',name:'Runtime account',avatar:1,guest:{profileId:guest.data.profile.id,token:guest.data.token}},'runtime-a');assert.equal(claim.status,200);assert.equal(claim.data.account.profile.id,guest.data.profile.id);
 assert.equal((await call('/api/ranked',{action:'profile',profileId:guest.data.profile.id,token:guest.data.token})).status,401);
 assert.equal((await call('/api/account',undefined,'runtime-a')).data.account.profile.id,guest.data.profile.id);
 assert.equal((await call('/api/ranked',{action:'profile',profileId:guest.data.profile.id},'runtime-a')).status,200);
 const b=await call('/api/account',{action:'register',name:'Runtime friend',avatar:2},'runtime-b');assert.equal(b.status,200);
 const invite=await call('/api/account',{action:'createInvite'},'runtime-a');assert.equal(invite.status,200);
 const accepted=await call('/api/account',{action:'acceptInvite',inviteCode:invite.data.inviteCode},'runtime-b');assert.equal(accepted.status,200);assert.equal(accepted.data.account.friends[0].id,guest.data.profile.id);
 const room=await call('/api/game',{action:'create',name:'Runtime guest',pack:'everyday'});assert.equal(room.status,200);
 assert.equal((await call('/api/account',{action:'inviteToRoom',friendId:b.data.account.profile.id,roomCode:room.data.code,roomToken:room.data.token},'runtime-a')).status,200);
 const inbox=await call('/api/account',undefined,'runtime-b');assert.equal(inbox.data.account.invites[0].roomCode,room.data.code);
 const denied=await mf.dispatchFetch('https://game.test/api/account',{method:'POST',headers:{Origin:'https://evil.test','Content-Type':'application/json','oai-authenticated-user-id':'runtime-a'},body:JSON.stringify({action:'createInvite'})});assert.equal(denied.status,403);
 console.log('PASS compiled Worker account enrollment, guest claim, cross-device read, revocation, friend acceptance, private room inbox and CSRF.');
}finally{await mf.dispose();}
