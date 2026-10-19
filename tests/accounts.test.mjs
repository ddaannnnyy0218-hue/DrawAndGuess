import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {accountRequest} from '../lib/accounts.js';
import {rankedRequest} from '../lib/ranked.js';
import {gameRequest} from '../lib/game.js';

const ORIGIN='https://game.test';
const NOW=Date.UTC(2026,0,15,12,0);
const USER_A='test-oai-user-a',USER_B='test-oai-user-b',USER_C='test-oai-user-c';

// Use the real migrations and a transactional, in-memory D1 adapter. All identities
// and room/profile data in this file are synthetic and never leave this process.
function database(t){
  const sql=new DatabaseSync(':memory:');
  for(const file of readdirSync(new URL('../drizzle',import.meta.url)).filter(f=>f.endsWith('.sql')).sort()){
    sql.exec(readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8').replaceAll('--> statement-breakpoint',''));
  }
  t.after(()=>sql.close());
  return {sql,prepare(query){
    const statement=sql.prepare(query);
    const bound=(args=[])=>({
      bind(...values){return bound(values)},
      async first(){return statement.get(...args)||null},
      async all(){return {results:statement.all(...args)}},
      syncRun(){const result=statement.run(...args);return {meta:{changes:Number(result.changes),last_row_id:Number(result.lastInsertRowid)}}},
      async run(){return this.syncRun()},
    });
    return bound();
  },async batch(items){
    sql.exec('BEGIN');
    try{const result=items.map(item=>item.syncRun());sql.exec('COMMIT');return result}
    catch(error){sql.exec('ROLLBACK');throw error}
  }};
}
function request(path,body,{user=null,method=body===undefined?'GET':'POST',headers={},query={}}={}){
  const url=new URL(path,ORIGIN);
  for(const [key,value] of Object.entries(query))url.searchParams.set(key,value);
  const h=new Headers(method==='GET'?{}:{Origin:ORIGIN,'Content-Type':'application/json','Sec-Fetch-Site':'same-origin'});
  if(user)h.set('oai-authenticated-user-id',user);
  for(const [key,value] of Object.entries(headers)){
    if(value===null)h.delete(key);else h.set(key,value);
  }
  return new Request(url,{method,headers:h,...(method==='GET'?{}:{body:typeof body==='string'?body:JSON.stringify(body)})});
}
async function account(db,user,body,options={}){
  const response=await accountRequest(request('/api/account',body,{user,...options}),db,options.now??NOW);
  return {status:response.status,headers:response.headers,...await response.json()};
}
async function ranked(db,user,body,options={}){
  const response=await rankedRequest(request('/api/ranked',body,{user,...options}),db,options.now??NOW,{
    assets:async path=>new Response(readFileSync(new URL('../public'+path,import.meta.url))),
    judge:async()=>[],
  });
  return {status:response.status,...await response.json()};
}
async function register(db,user,name='Test Player',extra={},options={}){
  const response=await account(db,user,{action:'register',name,avatar:2,...extra},options);
  assert.equal(response.status,200,JSON.stringify(response));
  return response.account.profile;
}
async function guest(db,name='Guest'){
  const response=await ranked(db,null,{action:'register',name,avatar:3});
  assert.equal(response.status,200,JSON.stringify(response));
  return {profileId:response.profile.id,token:response.token};
}
async function link(db,user,options={}){
  const response=await account(db,user,{action:'createInvite'},options);
  assert.equal(response.status,200,JSON.stringify(response));
  return response;
}
async function befriend(db,creator=USER_A,recipient=USER_B){
  const invitation=await link(db,creator);
  const response=await account(db,recipient,{action:'acceptInvite',inviteCode:invitation.inviteCode});
  assert.equal(response.status,200,JSON.stringify(response));
  return invitation;
}
async function createRoom(db,name='Host'){
  const response=await gameRequest(request('/api/game',{action:'create',name,avatar:0}),db,NOW);
  const room=await response.json();
  assert.equal(response.status,200,JSON.stringify(room));
  return room;
}
function count(db,table){return db.sql.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n}
const hash=value=>createHash('sha256').update(value).digest('hex');
function publicAccount(response){return {signedIn:response.signedIn,account:response.account}}
function assertNoSecrets(value,...secrets){
  const encoded=JSON.stringify(value);
  for(const secret of secrets)assert.equal(encoded.includes(secret),false,'response leaked '+secret);
  const walk=node=>{
    if(!node||typeof node!=='object')return;
    for(const [key,child] of Object.entries(node)){
      assert.equal(['token','user_id','owner','token_hash','accepted_by','email'].includes(key),false,'response exposed '+key);
      walk(child);
    }
  };
  walk(value);
}
function seedProgress(db,id){
  db.sql.prepare('UPDATE ranked_profiles SET rp=735,wins=9,losses=4 WHERE id=?').run(id);
  db.sql.prepare('INSERT INTO ranked_memory (profile_id,words,sources) VALUES (?,?,?)').run(id,'["word-a","word-b"]','["trace-a","trace-b"]');
  db.sql.prepare('INSERT INTO ranked_results (match_id,profile_id,delta,won,lost,applied) VALUES (?,?,40,1,0,1)').run('historical-test-match',id);
  db.sql.prepare('INSERT INTO ranked_matches (id,state,version,updated_at) VALUES (?,?,0,?)').run('preserved-test-match',JSON.stringify({id:'preserved-test-match',phase:'finished',players:[{id}]}),NOW);
  db.sql.prepare('INSERT INTO ranked_queue (profile_id,rating,queued_at,seen_at,match_id) VALUES (?,735,?,?,?)').run(id,NOW,NOW,'preserved-test-match');
}
function progress(db,id){
  return {
    profile:db.sql.prepare('SELECT id,rp,wins,losses,created_at FROM ranked_profiles WHERE id=?').get(id),
    memory:db.sql.prepare('SELECT * FROM ranked_memory WHERE profile_id=?').get(id),
    results:db.sql.prepare('SELECT * FROM ranked_results WHERE profile_id=?').all(id),
    queue:db.sql.prepare('SELECT * FROM ranked_queue WHERE profile_id=?').get(id),
    matches:db.sql.prepare('SELECT * FROM ranked_matches ORDER BY id').all(),
  };
}

test('signed-out and first-login GET disclose no account and do not create one',async t=>{
  const db=database(t);
  const signedOut=await account(db,null);
  assert.equal(signedOut.status,200);
  assert.deepEqual(publicAccount(signedOut),{signedIn:false,account:null});
  const firstLogin=await account(db,USER_A);
  assert.deepEqual(publicAccount(firstLogin),{signedIn:true,account:null});
  assert.equal(count(db,'game_accounts'),0);
  assert.equal(count(db,'ranked_profiles'),0);
  assert.equal(signedOut.headers.get('cache-control'),'no-store');
  assert.equal(signedOut.headers.get('x-content-type-options'),'nosniff');
});

test('ChatGPT identity persists profile and preferences across devices and repeat registration',async t=>{
  const db=database(t);
  const profile=await register(db,USER_A,'  Original  ',{}, {headers:{'User-Agent':'device-a'}});
  assert.equal(profile.name,'Original');
  const updated=await account(db,USER_A,{action:'update',name:'Renamed',avatar:7,autoPlay:false});
  assert.equal(updated.status,200);
  assert.deepEqual(updated.account.preferences,{autoPlay:false});
  const fromOtherDevice=await account(db,USER_A,undefined,{headers:{'User-Agent':'device-b'}});
  assert.equal(fromOtherDevice.signedIn,true);
  assert.deepEqual(fromOtherDevice.account,updated.account);
  const repeated=await register(db,USER_A,'Must not reset',{avatar:0});
  assert.deepEqual(repeated,updated.account.profile);
  assert.equal(repeated.id,profile.id);
  assert.equal(count(db,'game_accounts'),1);
  assert.equal(count(db,'ranked_profiles'),1);
  const stored=db.sql.prepare('SELECT token FROM ranked_profiles WHERE id=?').get(profile.id);
  assertNoSecrets(fromOtherDevice,stored.token,USER_A);
});

test('different ChatGPT identities have distinct isolated account data on a shared device',async t=>{
  const db=database(t),a=await register(db,USER_A,'Alice'),b=await register(db,USER_B,'Bob');
  assert.notEqual(a.id,b.id);
  assert.equal((await account(db,USER_C)).account,null);
  await account(db,USER_A,{action:'update',name:'Alice updated',autoPlay:false});
  const seenB=await account(db,USER_B);
  assert.deepEqual(seenB.account.profile,b);
  assert.deepEqual(seenB.account.preferences,{autoPlay:true});
  assert.deepEqual(publicAccount(await account(db,null)),{signedIn:false,account:null});
});

test('registration is idempotent under concurrent requests for one identity',async t=>{
  const db=database(t);
  const replies=await Promise.all(Array.from({length:5},()=>account(db,USER_A,{action:'register',name:'Concurrent',avatar:0})));
  assert.ok(replies.every(r=>r.status===200),JSON.stringify(replies));
  assert.equal(new Set(replies.map(r=>r.account.profile.id)).size,1);
  assert.equal(count(db,'game_accounts'),1);
  assert.equal(count(db,'ranked_profiles'),1,'failed competing registrations must not orphan profiles');
});

test('all account mutations require the platform identity and unregistered users cannot act',async t=>{
  const db=database(t);
  for(const action of ['register','update','createInvite','acceptInvite','inviteToRoom']){
    const response=await account(db,null,{action,name:'Spoofed',userId:USER_A,user_id:USER_A});
    assert.equal(response.status,401,action);
  }
  for(const action of ['update','createInvite','acceptInvite','inviteToRoom']){
    assert.equal((await account(db,USER_A,{action,name:'No account'})).status,403,action);
  }
  assert.equal(count(db,'game_accounts'),0);
  assert.equal(count(db,'ranked_profiles'),0);
});

test('account writes require same-origin POST JSON, including Origin and fetch-site checks',async t=>{
  const db=database(t),a=await register(db,USER_A,'Unchanged');
  const invalid=[
    {headers:{Origin:null}},
    {headers:{Origin:'https://attacker.test'}},
    {headers:{Origin:'null'}},
    {headers:{Origin:'https://game.test.attacker.test'}},
    {headers:{'Content-Type':null}},
    {headers:{'Content-Type':'text/plain'}},
    {headers:{'Content-Type':'application/x-www-form-urlencoded'}},
    {headers:{'Sec-Fetch-Site':'cross-site'}},
    {method:'PUT'},
    {method:'DELETE'},
  ];
  for(const options of invalid){
    const response=await account(db,USER_A,{action:'update',name:'CSRF changed'},options);
    assert.equal(response.status,403,JSON.stringify(options));
  }
  assert.deepEqual((await account(db,USER_A)).account.profile,a);
  const allowed=await account(db,USER_A,{action:'update',name:'JSON charset accepted'},{headers:{'Content-Type':'application/json; charset=utf-8'}});
  // The nickname length check must still run after the CSRF gate.
  assert.equal(allowed.status,400);
  assert.equal((await account(db,USER_A,{action:'update',name:'Allowed'},{headers:{'Content-Type':'application/json; charset=utf-8'}})).status,200);
});

test('body/query identity spoofing cannot read or update another account',async t=>{
  const db=database(t),a=await register(db,USER_A,'Alice'),b=await register(db,USER_B,'Bob');
  const response=await account(db,USER_A,{
    action:'update',name:'Alice only',userId:USER_B,user_id:USER_B,profileId:b.id,
    owner:USER_B,'oai-authenticated-user-id':USER_B,rp:999999,wins:99999,losses:0,
  });
  assert.equal(response.status,200);
  assert.equal(response.account.profile.id,a.id);
  assert.equal(response.account.profile.rp,0);
  assert.equal(response.account.profile.wins,0);
  assert.deepEqual((await account(db,USER_B)).account.profile,b);
  const signedOut=await account(db,null,undefined,{query:{userId:USER_A,profileId:a.id}});
  assert.deepEqual(publicAccount(signedOut),{signedIn:false,account:null});
  const queried=await account(db,USER_A,undefined,{query:{userId:USER_B,profileId:b.id}});
  assert.equal(queried.account.profile.id,a.id);
});

test('malformed and oversized account requests and invalid profile fields fail without creating profiles',async t=>{
  const db=database(t);
  for(const body of ['{','null','[]','"text"',JSON.stringify({action:'unknown'})]){
    assert.equal((await account(db,USER_A,body)).status,400,body);
  }
  assert.equal((await account(db,USER_A,' '.repeat(4097))).status,413);
  const invalid=[{name:''},{name:' '.repeat(5)},{name:'n'.repeat(17)},{name:'bad\nname'},{name:123},{name:'Fine',avatar:-1},{name:'Fine',avatar:8},{name:'Fine',avatar:1.5},{name:'Fine',avatar:'2'}];
  for(const body of invalid)assert.equal((await account(db,USER_A,{action:'register',...body})).status,400,JSON.stringify(body));
  assert.equal(count(db,'game_accounts'),0);
  assert.equal(count(db,'ranked_profiles'),0);
});

test('guest claim preserves profile id, RP, wins, losses, ranked memory, results and queue',async t=>{
  const db=database(t),credentials=await guest(db,'Existing Guest');
  seedProgress(db,credentials.profileId);
  const before=progress(db,credentials.profileId);
  const claimed=await register(db,USER_A,'New name',{guest:credentials});
  assert.equal(claimed.id,credentials.profileId);
  assert.equal(claimed.name,'New name');
  assert.equal(claimed.avatar,2);
  assert.equal(claimed.rp,735);
  assert.equal(claimed.wins,9);
  assert.equal(claimed.losses,4);
  assert.deepEqual(progress(db,credentials.profileId),before);
  assert.equal(count(db,'ranked_profiles'),1);
  assert.equal(count(db,'game_accounts'),1);
  const afterToken=db.sql.prepare('SELECT token FROM ranked_profiles WHERE id=?').get(claimed.id).token;
  assert.notEqual(afterToken,credentials.token,'guest bearer token must rotate during ownership claim');
  const otherDevice=await account(db,USER_A,undefined,{headers:{'User-Agent':'new-device'}});
  assert.deepEqual(otherDevice.account.profile,claimed);
  assertNoSecrets(otherDevice,credentials.token,afterToken,USER_A);
});

test('claimed guest bearer token is revoked for signed-out users and other accounts',async t=>{
  const db=database(t),credentials=await guest(db);
  await register(db,USER_A,'Owner',{guest:credentials});
  const currentToken=db.sql.prepare('SELECT token FROM ranked_profiles WHERE id=?').get(credentials.profileId).token;
  for(const user of [null,USER_B]){
    for(const action of ['profile','queue','status','cancel','match']){
      assert.equal((await ranked(db,user,{...credentials,action})).status,401,`${user}:${action}`);
    }
    assert.equal((await ranked(db,user,{...credentials,token:currentToken,action:'profile'})).status,401,'even a stored bearer token cannot bypass account ownership');
  }
  const signedOutGet=await ranked(db,null,undefined,{query:{action:'profile',profileId:credentials.profileId},headers:{Authorization:'Bearer '+credentials.token}});
  assert.equal(signedOutGet.status,401);
  assert.equal(count(db,'ranked_queue'),0);
});

test('invalid, mismatched and already-owned guest claims fail without modifying either profile',async t=>{
  const db=database(t),one=await guest(db,'One'),two=await guest(db,'Two');
  const rows=()=>db.sql.prepare('SELECT * FROM ranked_profiles ORDER BY id').all();
  const before=rows();
  for(const bad of [
    {profileId:one.profileId,token:'invalid-token'},
    {profileId:one.profileId,token:two.token},
    {profileId:'nonexistent-profile',token:one.token},
  ]){
    assert.equal((await account(db,USER_A,{action:'register',name:'No',guest:bad})).status,409);
    assert.deepEqual(rows(),before);
    assert.equal(count(db,'game_accounts'),0);
  }
  assert.equal((await account(db,USER_A,{action:'register',name:'No',guest:{profileId:one.profileId,token:'x'.repeat(129)}})).status,400);
  await register(db,USER_A,'Owner',{guest:one});
  const ownedBefore=rows();
  assert.equal((await account(db,USER_B,{action:'register',name:'Steal',guest:one})).status,409);
  assert.deepEqual(rows(),ownedBefore);
  assert.equal((await account(db,USER_B)).account,null);
});

test('simultaneous guest claims grant exactly one identity ownership with no lost progress',async t=>{
  const db=database(t),credentials=await guest(db,'Race guest');
  seedProgress(db,credentials.profileId);
  const before=progress(db,credentials.profileId);
  const users=[USER_A,USER_B];
  const results=await Promise.all(users.map(user=>account(db,user,{action:'register',name:'Claimant',guest:credentials})));
  assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
  assert.equal(count(db,'game_accounts'),1);
  assert.equal(count(db,'ranked_profiles'),1);
  assert.deepEqual(progress(db,credentials.profileId),before);
  const winner=users[results.findIndex(r=>r.status===200)],loser=users.find(user=>user!==winner);
  assert.equal((await account(db,winner)).account.profile.id,credentials.profileId);
  assert.equal((await account(db,loser)).account,null);
  assert.equal((await ranked(db,loser,{...credentials,action:'profile'})).status,401);
  assert.equal((await ranked(db,winner,{profileId:credentials.profileId,action:'profile'})).status,200);
});

test('account ranked reads and writes authorize the platform owner, not submitted bearer tokens',async t=>{
  const db=database(t),a=await register(db,USER_A,'Owner A'),b=await register(db,USER_B,'Owner B');
  // Above bronze avoids generating a match before ownership assertions finish.
  db.sql.prepare('UPDATE ranked_profiles SET rp=500 WHERE id=?').run(a.id);
  const response=await ranked(db,USER_A,{action:'profile',profileId:a.id,token:'not-needed'});
  assert.equal(response.status,200);
  assert.equal(response.profile.rp,500);
  const ownGet=await ranked(db,USER_A,undefined,{query:{action:'profile',profileId:a.id}});
  assert.equal(ownGet.status,200);
  for(const user of [null,USER_B]){
    const token=db.sql.prepare('SELECT token FROM ranked_profiles WHERE id=?').get(a.id).token;
    assert.equal((await ranked(db,user,{action:'profile',profileId:a.id,token})).status,401);
    assert.equal((await ranked(db,user,{action:'queue',profileId:a.id,token,userId:USER_A})).status,401);
  }
  assert.equal((await ranked(db,USER_A,{action:'queue',profileId:b.id})).status,401);
  const queued=await ranked(db,USER_A,{action:'queue',profileId:a.id});
  assert.equal(queued.status,200);
  assert.ok(queued.queue);
  assert.equal(count(db,'ranked_queue'),1);
  assert.equal((await ranked(db,USER_A,{action:'status',profileId:a.id})).status,200);
  assert.equal((await ranked(db,USER_B,{action:'cancel',profileId:a.id})).status,401);
  assert.equal(count(db,'ranked_queue'),1);
  assert.equal((await ranked(db,USER_A,{action:'cancel',profileId:a.id})).status,200);
  assert.equal(count(db,'ranked_queue'),0);
});

test('authenticated ranked status/match GETs cannot cause mutation and writes have strict CSRF checks',async t=>{
  const db=database(t),a=await register(db,USER_A);
  for(const action of ['status','match','queue','cancel','register']){
    assert.equal((await ranked(db,USER_A,undefined,{query:{action,profileId:a.id}})).status,405,action);
  }
  for(const headers of [{Origin:null},{Origin:'https://attacker.test'},{'Content-Type':'text/plain'},{'Sec-Fetch-Site':'cross-site'}]){
    assert.equal((await ranked(db,USER_A,{action:'queue',profileId:a.id},{headers})).status,403,JSON.stringify(headers));
  }
  assert.equal(count(db,'ranked_queue'),0);
  assert.equal(count(db,'ranked_matches'),0);
});

test('friend links use expiring random codes and store only their hashes, with no automatic acceptance',async t=>{
  const db=database(t),a=await register(db,USER_A),b=await register(db,USER_B);
  const created=await link(db,USER_A);
  assert.match(created.inviteCode,/^[a-f0-9]{64}$/);
  assert.equal(created.expiresAt,NOW+7*86400000);
  const stored=db.sql.prepare('SELECT * FROM friend_links').get();
  assert.equal(stored.token_hash,hash(created.inviteCode));
  assert.notEqual(stored.token_hash,created.inviteCode);
  assert.equal(stored.creator_id,a.id);
  assert.equal(stored.accepted_by,null);
  assert.equal(JSON.stringify(stored).includes(created.inviteCode),false);
  assert.equal(count(db,'friendships'),0);
  const visited=await account(db,USER_B,undefined,{query:{inviteCode:created.inviteCode,action:'acceptInvite'}});
  assert.equal(visited.status,200);
  assert.deepEqual(visited.account.friends,[]);
  assert.equal(count(db,'friendships'),0,'visiting a link must not silently accept it');
  assert.equal(db.sql.prepare('SELECT accepted_by FROM friend_links').get().accepted_by,null);
  assertNoSecrets(await account(db,USER_A),created.inviteCode,stored.token_hash,USER_A,USER_B);
  assert.notEqual(a.id,b.id);
});

test('explicit friend acceptance is mutual and idempotent for its recipient, never reusable by another user',async t=>{
  const db=database(t),a=await register(db,USER_A,'Alice'),b=await register(db,USER_B,'Bob');
  await register(db,USER_C,'Carol');
  const created=await link(db,USER_A);
  const accepted=await account(db,USER_B,{action:'acceptInvite',inviteCode:created.inviteCode});
  assert.equal(accepted.status,200);
  assert.deepEqual(accepted.account.friends,[{id:a.id,name:'Alice',avatar:2,rp:0}]);
  assert.deepEqual((await account(db,USER_A)).account.friends,[{id:b.id,name:'Bob',avatar:2,rp:0}]);
  assert.equal((await account(db,USER_B,{action:'acceptInvite',inviteCode:created.inviteCode})).status,200);
  assert.equal(count(db,'friendships'),1);
  const denied=await account(db,USER_C,{action:'acceptInvite',inviteCode:created.inviteCode});
  assert.equal(denied.status,409);
  assert.deepEqual((await account(db,USER_C)).account.friends,[]);
  assert.equal(count(db,'friendships'),1);
  assert.equal(db.sql.prepare('SELECT accepted_by FROM friend_links').get().accepted_by,b.id);
});

test('friend links reject self-acceptance, expired links and invalid codes',async t=>{
  const db=database(t);
  await register(db,USER_A);await register(db,USER_B);
  const created=await link(db,USER_A);
  assert.equal((await account(db,USER_A,{action:'acceptInvite',inviteCode:created.inviteCode})).status,400);
  for(const code of ['',null,123,'invalid','G'.repeat(64),'a'.repeat(65)]){
    assert.equal((await account(db,USER_B,{action:'acceptInvite',inviteCode:code})).status,404,JSON.stringify(code));
  }
  assert.equal((await account(db,USER_B,{action:'acceptInvite',inviteCode:'f'.repeat(64)})).status,410);
  assert.equal((await account(db,USER_B,{action:'acceptInvite',inviteCode:created.inviteCode},{now:created.expiresAt})).status,410);
  assert.equal(count(db,'friendships'),0);
  assert.equal(db.sql.prepare('SELECT accepted_by FROM friend_links').get().accepted_by,null);
});

test('simultaneous friend acceptance permits one recipient and preserves a single friendship',async t=>{
  const db=database(t),profiles=[];
  for(const user of [USER_A,USER_B,USER_C])profiles.push(await register(db,user));
  const created=await link(db,USER_A);
  const replies=await Promise.all([USER_B,USER_C].map(user=>account(db,user,{action:'acceptInvite',inviteCode:created.inviteCode})));
  assert.deepEqual(replies.map(r=>r.status).sort(),[200,409]);
  const winner=profiles[replies.findIndex(r=>r.status===200)+1];
  assert.equal(count(db,'friendships'),1);
  assert.equal(db.sql.prepare('SELECT accepted_by FROM friend_links').get().accepted_by,winner.id);
  const friend=(await account(db,USER_A)).account.friends;
  assert.equal(friend.length,1);
  assert.equal(friend[0].id,winner.id);
});

test('room invitations require an existing friendship and the correct active room member token',async t=>{
  const db=database(t),a=await register(db,USER_A,'Alice'),b=await register(db,USER_B,'Bob'),c=await register(db,USER_C,'Carol');
  const room=await createRoom(db),otherRoom=await createRoom(db,'Other host');
  const invite=extra=>account(db,USER_A,{action:'inviteToRoom',friendId:b.id,roomCode:room.code,roomToken:room.token,...extra});
  assert.equal((await invite({})).status,403,'sharing a room code alone must not create a friendship');
  await befriend(db);
  assert.equal((await invite({friendId:c.id})).status,403);
  assert.equal((await invite({roomToken:'wrong-token'})).status,403);
  assert.equal((await invite({roomToken:otherRoom.token})).status,403,'a token from another room is not proof');
  assert.equal((await invite({roomToken:undefined})).status,400);
  assert.equal((await invite({roomCode:'bad-code'})).status,400);
  assert.equal(count(db,'room_invitations'),0);
  const accepted=await invite({});
  assert.equal(accepted.status,200);
  const stored=db.sql.prepare('SELECT * FROM room_invitations').get();
  assert.equal(stored.sender_id,a.id);
  assert.equal(stored.recipient_id,b.id);
  assert.equal(stored.room_code,room.code);
  assert.equal(stored.expires_at,NOW+3600000);
  assert.equal(JSON.stringify(stored).includes(room.token),false);
});

test('departed room members, started rooms and missing rooms cannot send invitations',async t=>{
  const db=database(t);
  await register(db,USER_A);const b=await register(db,USER_B);await befriend(db);
  const room=await createRoom(db);
  const send=()=>account(db,USER_A,{action:'inviteToRoom',friendId:b.id,roomCode:room.code,roomToken:room.token});
  const state=JSON.parse(db.sql.prepare('SELECT state FROM game_rooms WHERE code=?').get(room.code).state);
  state.players.find(p=>p.token===room.token).left=true;
  db.sql.prepare('UPDATE game_rooms SET state=? WHERE code=?').run(JSON.stringify(state),room.code);
  assert.equal((await send()).status,403);
  state.players.find(p=>p.token===room.token).left=false;state.phase='drawing';
  db.sql.prepare('UPDATE game_rooms SET state=? WHERE code=?').run(JSON.stringify(state),room.code);
  assert.equal((await send()).status,409);
  db.sql.prepare('DELETE FROM game_rooms WHERE code=?').run(room.code);
  assert.equal((await send()).status,404);
  assert.equal(count(db,'room_invitations'),0);
});

test('room invitation inbox belongs only to the recipient, repeats dedupe, and expiry hides stale invites',async t=>{
  const db=database(t),a=await register(db,USER_A,'Alice'),b=await register(db,USER_B,'Bob');
  await register(db,USER_C,'Carol');await befriend(db);
  const room=await createRoom(db),body={action:'inviteToRoom',friendId:b.id,roomCode:room.code,roomToken:room.token};
  assert.equal((await account(db,USER_A,body)).status,200);
  const firstId=db.sql.prepare('SELECT id FROM room_invitations').get().id;
  assert.equal((await account(db,USER_A,body,{now:NOW+1000})).status,200);
  assert.equal(count(db,'room_invitations'),1);
  assert.equal(db.sql.prepare('SELECT id FROM room_invitations').get().id,firstId);
  const inbox=await account(db,USER_B);
  assert.equal(inbox.account.invites.length,1);
  assert.deepEqual(inbox.account.invites[0],{id:firstId,from:{id:a.id,name:'Alice',avatar:2},roomCode:room.code,createdAt:NOW+1000});
  assert.deepEqual((await account(db,USER_A)).account.invites,[]);
  assert.deepEqual((await account(db,USER_C,undefined,{query:{profileId:b.id,recipient_id:b.id}})).account.invites,[]);
  assert.equal((await account(db,null)).account,null);
  assertNoSecrets(inbox,room.token,USER_A,USER_B);
  assert.deepEqual((await account(db,USER_B,undefined,{now:NOW+1000+3600000})).account.invites,[]);
  db.sql.prepare('DELETE FROM game_rooms WHERE code=?').run(room.code);
  assert.deepEqual((await account(db,USER_B)).account.invites,[],'deleted rooms must disappear even before invite expiry');
});

test('friend-link rate limits are shared across devices, isolated by identity and reset next minute',async t=>{
  const db=database(t);await register(db,USER_A);await register(db,USER_B);
  const codes=new Set();
  for(let i=0;i<5;i++)codes.add((await link(db,USER_A,{headers:{'User-Agent':'device-'+i}})).inviteCode);
  assert.equal(codes.size,5);
  assert.equal((await account(db,USER_A,{action:'createInvite'},{headers:{'User-Agent':'new-device'}})).status,429);
  assert.equal(count(db,'friend_links'),5);
  assert.equal((await account(db,USER_B,{action:'createInvite'})).status,200);
  assert.equal((await account(db,USER_A,{action:'createInvite'},{now:NOW+60000})).status,200);
  assert.equal(count(db,'friend_links'),7);
});

test('account update and room-invitation rate limits reject excess writes without dropping existing data',async t=>{
  const db=database(t);await register(db,USER_A);const b=await register(db,USER_B);await befriend(db);
  for(let i=0;i<20;i++)assert.equal((await account(db,USER_A,{action:'update',name:'Name '+i})).status,200);
  assert.equal((await account(db,USER_A,{action:'update',name:'Blocked'})).status,429);
  assert.equal((await account(db,USER_A)).account.profile.name,'Name 19');
  const room=await createRoom(db),body={action:'inviteToRoom',friendId:b.id,roomCode:room.code,roomToken:room.token};
  for(let i=0;i<20;i++)assert.equal((await account(db,USER_A,body)).status,200);
  assert.equal((await account(db,USER_A,body)).status,429);
  assert.equal(count(db,'room_invitations'),1);
  assert.equal((await account(db,USER_B)).account.invites.length,1);
  assert.equal((await account(db,USER_A,{action:'update',name:'Allowed again'},{now:NOW+60000})).status,200);
});

test('twenty outstanding friend links cap creation even after minute rate windows reset',async t=>{
  const db=database(t);await register(db,USER_A);
  for(let minute=0;minute<4;minute++){
    for(let i=0;i<5;i++)await link(db,USER_A,{now:NOW+minute*60000});
  }
  assert.equal(count(db,'friend_links'),20);
  assert.equal((await account(db,USER_A,{action:'createInvite'},{now:NOW+4*60000})).status,429);
  assert.equal(count(db,'friend_links'),20);
  assert.equal((await account(db,USER_A,{action:'createInvite'},{now:NOW+8*86400000})).status,200,'expired unused invitations no longer consume the outstanding-link cap');
});

test('same-user competing guest claims bind one profile and leave the unclaimed guest untouched',async t=>{
  const db=database(t),one=await guest(db,'First guest'),two=await guest(db,'Second guest');
  db.sql.prepare('UPDATE ranked_profiles SET rp=735,wins=9,losses=4 WHERE id=?').run(one.profileId);
  db.sql.prepare('UPDATE ranked_profiles SET rp=280,wins=3,losses=2 WHERE id=?').run(two.profileId);
  const before=new Map([one,two].map(p=>[p.profileId,db.sql.prepare('SELECT * FROM ranked_profiles WHERE id=?').get(p.profileId)]));
  const replies=await Promise.all([one,two].map(credentials=>account(db,USER_A,{action:'register',name:'Claimant',guest:credentials})));
  assert.deepEqual(replies.map(r=>r.status).sort(),[200,409]);
  const bound=(await account(db,USER_A)).account.profile;
  const loser=[one,two].find(p=>p.profileId!==bound.id);
  assert.equal(count(db,'ranked_profiles'),2);
  assert.equal(count(db,'game_accounts'),1);
  assert.deepEqual(db.sql.prepare('SELECT * FROM ranked_profiles WHERE id=?').get(loser.profileId),before.get(loser.profileId));
  assert.equal(bound.rp,before.get(bound.id).rp);
  assert.equal(bound.wins,before.get(bound.id).wins);
  assert.equal(bound.losses,before.get(bound.id).losses);
  assert.equal((await ranked(db,null,{action:'profile',...loser})).status,200,'losing guest credentials remain valid');
  const winner=[one,two].find(p=>p.profileId===bound.id);
  assert.equal((await ranked(db,null,{action:'profile',...winner})).status,401,'winning guest credentials are revoked');
});

test('an existing account cannot overwrite its profile by registering another guest',async t=>{
  const db=database(t),owned=await register(db,USER_A,'Existing account'),credentials=await guest(db,'Unclaimed guest');
  const before=db.sql.prepare('SELECT * FROM ranked_profiles WHERE id=?').get(credentials.profileId);
  const repeated=await register(db,USER_A,'New name',{guest:credentials});
  assert.deepEqual(repeated,owned);
  assert.deepEqual(db.sql.prepare('SELECT * FROM ranked_profiles WHERE id=?').get(credentials.profileId),before);
  assert.equal(count(db,'game_accounts'),1);
  assert.equal(count(db,'ranked_profiles'),2);
  assert.equal((await ranked(db,null,{...credentials,action:'profile'})).status,200);
});

test('registration preserves requested autoplay choice and invalid mixed updates are atomic',async t=>{
  const db=database(t);
  const response=await account(db,USER_A,{action:'register',name:'Preference',avatar:1,autoPlay:false});
  assert.equal(response.status,200);
  assert.equal(response.account.profile.name,'Preference');
  assert.equal(response.account.profile.avatar,1);
  assert.deepEqual(response.account.preferences,{autoPlay:false});
  const before=response.account;
  for(const body of [
    {name:'Should not save',autoPlay:'yes'},
    {name:'Should not save',avatar:99},
    {avatar:3,name:'',autoPlay:true},
  ]){
    assert.equal((await account(db,USER_A,{action:'update',...body})).status,400);
    assert.deepEqual((await account(db,USER_A)).account,before);
  }
  assert.equal((await account(db,USER_B,{action:'register',name:'Invalid',autoPlay:'false'})).status,400);
  assert.equal((await account(db,USER_B)).account,null);
  assert.equal(count(db,'ranked_profiles'),1);
});

test('authenticated GET status and match do not touch profiles, queue, matches, memory or rate limits',async t=>{
  const db=database(t),a=await register(db,USER_A);
  seedProgress(db,a.id);
  const snapshot=()=>['ranked_profiles','game_accounts','ranked_queue','ranked_matches','ranked_memory','ranked_results','account_rate_limits'].map(table=>db.sql.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all());
  const before=snapshot();
  for(const action of ['status','match']){
    const response=await ranked(db,USER_A,undefined,{query:{action,profileId:a.id},now:NOW+90000});
    assert.equal(response.status,405);
    assert.deepEqual(snapshot(),before);
  }
});

test('guest-account claim also persists the local autoplay choice',async t=>{
  const db=database(t),credentials=await guest(db);
  const response=await account(db,USER_A,{action:'register',name:'Owner',avatar:6,guest:credentials,autoPlay:false});
  assert.equal(response.status,200);
  assert.equal(response.account.profile.id,credentials.profileId);
  assert.equal(response.account.profile.name,'Owner');
  assert.equal(response.account.profile.avatar,6);
  assert.deepEqual(response.account.preferences,{autoPlay:false});
  assert.deepEqual((await account(db,USER_A)).account.preferences,{autoPlay:false});
});
