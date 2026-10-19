// Sites dispatch supplies authenticated identity; never accept identity from JSON.
export const accountUser=request=>request.headers.get('oai-authenticated-user-id')||null;
export const publicProfile=p=>({id:p.id,name:p.name,avatar:p.avatar,rp:p.rp,wins:p.wins,losses:p.losses});
class AccountError extends Error{constructor(message,status=400){super(message);this.status=status;}}
const check=(v,m,status)=>{if(!v)throw new AccountError(m,status)};
const json=(v,status=200)=>new Response(JSON.stringify(v),{status,headers:{'Content-Type':'application/json;charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export function sameOriginMutation(request){const url=new URL(request.url);return request.method==='POST'&&request.headers.get('origin')===url.origin&&request.headers.get('content-type')?.split(';')[0].trim()==='application/json'&&request.headers.get('sec-fetch-site')!=='cross-site';}
export async function ownedProfile(db,user){if(!user)return null;return db.prepare('SELECT p.*, a.auto_play FROM game_accounts a JOIN ranked_profiles p ON p.id=a.profile_id WHERE a.user_id=?').bind(user).first();}
async function hash(value){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return [...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,'0')).join('');}
const random=()=>[...crypto.getRandomValues(new Uint8Array(32))].map(x=>x.toString(16).padStart(2,'0')).join('');
async function rate(db,user,action,now,limit=20){const period=60000,bucket=await hash(user+':'+action+':'+Math.floor(now/period));await db.prepare('INSERT INTO account_rate_limits (bucket,count,expires_at) VALUES (?,1,?) ON CONFLICT(bucket) DO UPDATE SET count=count+1').bind(bucket,now+period*2).run();const row=await db.prepare('SELECT count FROM account_rate_limits WHERE bucket=?').bind(bucket).first();check(row.count<=limit,'操作太频繁，请稍后再试。',429);await db.batch([db.prepare('DELETE FROM account_rate_limits WHERE bucket IN (SELECT bucket FROM account_rate_limits WHERE expires_at<? LIMIT 100)').bind(now),db.prepare('DELETE FROM friend_links WHERE token_hash IN (SELECT token_hash FROM friend_links WHERE expires_at<? LIMIT 100)').bind(now),db.prepare('DELETE FROM room_invitations WHERE id IN (SELECT id FROM room_invitations WHERE expires_at<? LIMIT 100)').bind(now)]);}
function nickname(value){check(typeof value==='string','请输入昵称。');const name=value.trim();check(name.length>0&&name.length<=16&&!/[\u0000-\u001f\u007f]/.test(name),'昵称需要 1–16 个字符。');return name;}
function avatar(value){check(Number.isInteger(value)&&value>=0&&value<=7,'头像无效。');return value;}
async function accountView(db,p,now){
 const friends=await db.prepare('SELECT p.id,p.name,p.avatar,p.rp FROM friendships f JOIN ranked_profiles p ON p.id=CASE WHEN f.first_id=? THEN f.second_id ELSE f.first_id END WHERE f.first_id=? OR f.second_id=? ORDER BY p.name').bind(p.id,p.id,p.id).all();
 const invitations=await db.prepare('SELECT i.id,i.room_code,i.created_at,p.id AS sender_id,p.name,p.avatar FROM room_invitations i JOIN ranked_profiles p ON p.id=i.sender_id JOIN game_rooms r ON r.code=i.room_code WHERE i.recipient_id=? AND i.expires_at>? ORDER BY i.created_at DESC LIMIT 30').bind(p.id,now).all();
 return {profile:publicProfile(p),preferences:{autoPlay:!!p.auto_play},friends:friends.results,invites:invitations.results.map(i=>({id:i.id,from:{id:i.sender_id,name:i.name,avatar:i.avatar},roomCode:i.room_code,createdAt:i.created_at}))};
}
export async function accountRequest(request,db,now=Date.now()){
 try{
  check(db,'账号服务暂时不可用。',503);const user=accountUser(request);let p=await ownedProfile(db,user);
  if(request.method==='GET')return json({signedIn:!!user,account:p?await accountView(db,p,now):null});
  check(sameOriginMutation(request),'请在游戏页面内操作。',403);check(user,'请先使用 ChatGPT 登录。',401);
  const raw=await request.text();check(raw.length<=4096,'请求内容太大。',413);let b;try{b=JSON.parse(raw)}catch{throw new AccountError('请求内容无效。')};check(b&&typeof b==='object'&&!Array.isArray(b),'请求内容无效。');
  check(['register','update','createInvite','acceptInvite','inviteToRoom'].includes(b.action),'未知操作。');await rate(db,user,b.action,now,b.action==='createInvite'?5:20);
  if(b.action==='register'){
   if(p)return json({account:await accountView(db,p,now)});
   const name=nickname(b.name),av=avatar(b.avatar??0);if(b.autoPlay!==undefined)check(typeof b.autoPlay==='boolean','设置无效。');const autoPlay=b.autoPlay===false?0:1;
   if(b.guest){
    check(typeof b.guest.profileId==='string'&&typeof b.guest.token==='string'&&b.guest.token.length<=128,'游客身份无效。');
    // The INSERT is the ownership claim. Unique user/profile keys serialize races.
    try{await db.batch([
     db.prepare('INSERT INTO game_accounts (user_id,profile_id,created_at,auto_play) SELECT ?,p.id,?,? FROM ranked_profiles p WHERE p.id=? AND p.token=? AND NOT EXISTS (SELECT 1 FROM game_accounts a WHERE a.profile_id=p.id)').bind(user,now,autoPlay,b.guest.profileId,b.guest.token),
     db.prepare('UPDATE ranked_profiles SET token=?,name=?,avatar=? WHERE id=? AND EXISTS (SELECT 1 FROM game_accounts WHERE user_id=? AND profile_id=?)').bind(random(),name,av,b.guest.profileId,user,b.guest.profileId),
    ]);}catch{throw new AccountError('该游客进度已绑定，请刷新账号状态。',409);}
    p=await ownedProfile(db,user);check(p,'游客凭证无效或已被绑定，原进度没有变更。',409);
   }else{
    const id=crypto.randomUUID();try{await db.batch([
     db.prepare('INSERT INTO ranked_profiles (id,token,name,avatar,rp,wins,losses,created_at) VALUES (?,?,?,?,0,0,0,?)').bind(id,random(),name,av,now),
     db.prepare('INSERT INTO game_accounts (user_id,profile_id,created_at,auto_play) VALUES (?,?,?,?)').bind(user,id,now,autoPlay),
    ]);}catch{p=await ownedProfile(db,user);check(p,'账号创建失败，请重试。',409);}
    p=await ownedProfile(db,user);
   }
   return json({account:await accountView(db,p,now)});
  }
  check(p,'请先创建游戏档案。',403);
  if(b.action==='update'){
   if(b.name!==undefined)nickname(b.name);if(b.avatar!==undefined)avatar(b.avatar);if(b.autoPlay!==undefined)check(typeof b.autoPlay==='boolean','设置无效。');
   if(b.name!==undefined||b.avatar!==undefined)await db.prepare('UPDATE ranked_profiles SET name=?,avatar=? WHERE id=?').bind(b.name===undefined?p.name:nickname(b.name),b.avatar===undefined?p.avatar:avatar(b.avatar),p.id).run();
   if(b.autoPlay!==undefined){check(typeof b.autoPlay==='boolean','设置无效。');await db.prepare('UPDATE game_accounts SET auto_play=? WHERE user_id=?').bind(b.autoPlay?1:0,user).run();}
  }else if(b.action==='createInvite'){
   const count=await db.prepare('SELECT COUNT(*) AS n FROM friend_links WHERE creator_id=? AND expires_at>? AND accepted_by IS NULL').bind(p.id,now).first();check(count.n<20,'你还有较多未使用的邀请链接，请先分享已有链接。',429);
   const inviteCode=random(),expiresAt=now+7*86400000;await db.prepare('INSERT INTO friend_links (token_hash,creator_id,expires_at,created_at) VALUES (?,?,?,?)').bind(await hash(inviteCode),p.id,expiresAt,now).run();return json({inviteCode,expiresAt});
  }else if(b.action==='acceptInvite'){
   check(typeof b.inviteCode==='string'&&/^[a-f0-9]{64}$/.test(b.inviteCode),'邀请链接无效。',404);const key=await hash(b.inviteCode);const link=await db.prepare('SELECT * FROM friend_links WHERE token_hash=?').bind(key).first();check(link&&link.expires_at>now,'邀请不存在或已过期。',410);check(link.creator_id!==p.id,'不能添加自己为好友。');check(!link.accepted_by||link.accepted_by===p.id,'邀请已被使用。',409);
   const [a,z]=[link.creator_id,p.id].sort();await db.batch([
    db.prepare('UPDATE friend_links SET accepted_by=? WHERE token_hash=? AND expires_at>? AND (accepted_by IS NULL OR accepted_by=?)').bind(p.id,key,now,p.id),
    db.prepare('INSERT OR IGNORE INTO friendships (first_id,second_id,created_at) SELECT ?,?,? WHERE EXISTS (SELECT 1 FROM friend_links WHERE token_hash=? AND accepted_by=? AND expires_at>?)').bind(a,z,now,key,p.id,now),
   ]);const accepted=await db.prepare('SELECT accepted_by FROM friend_links WHERE token_hash=?').bind(key).first();check(accepted.accepted_by===p.id,'邀请已被使用。',409);
  }else if(b.action==='inviteToRoom'){
   check(typeof b.friendId==='string'&&typeof b.roomToken==='string'&&b.roomToken.length<=128&&/^[A-Z2-9]{6}$/.test(b.roomCode||''),'房间邀请无效。');const [a,z]=[p.id,b.friendId].sort();check(await db.prepare('SELECT 1 FROM friendships WHERE first_id=? AND second_id=?').bind(a,z).first(),'只能邀请自己的好友。',403);
   const room=await db.prepare('SELECT state FROM game_rooms WHERE code=?').bind(b.roomCode).first();check(room,'房间已结束。',404);const state=JSON.parse(room.state);check(state.players.some(x=>x.token===b.roomToken&&!x.left),'你没有这个房间的邀请权限。',403);check(state.phase==='lobby','请在房间大厅邀请好友。',409);
   await db.prepare('INSERT INTO room_invitations (id,sender_id,recipient_id,room_code,created_at,expires_at) VALUES (?,?,?,?,?,?) ON CONFLICT(sender_id,recipient_id,room_code) DO UPDATE SET created_at=excluded.created_at,expires_at=excluded.expires_at').bind(crypto.randomUUID(),p.id,b.friendId,b.roomCode,now,now+3600000).run();
  }
  p=await ownedProfile(db,user);return json({account:await accountView(db,p,now)});
 }catch(e){if(e instanceof AccountError)return json({error:e.message},e.status);console.error('Account request failed');return json({error:'账号服务暂时没有接上，请稍后再试。'},500);}
}
