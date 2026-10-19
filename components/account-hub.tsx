'use client';

import {useCallback,useEffect,useRef,useState} from 'react';
import {ArrowRight,Check,Cloud,Copy,Loader2,LogIn,LogOut,RefreshCw,ShieldCheck,UserRound,Users,X} from 'lucide-react';
import {Avatar} from './doodles';

export type AccountProfile={id:string;name:string;avatar:number;rp:number;wins:number;losses:number};
export type Account={profile:AccountProfile;friends:{id:string;name:string;avatar:number;rp:number}[];invites:{id:string;from:{id:string;name:string;avatar:number};roomCode:string;createdAt:number|string}[];preferences:{autoPlay:boolean}};
export type AccountStatus={signedIn:boolean;account:Account|null};
type GuestIdentity={profileId:string;token:string};
type AccountReply=Partial<AccountStatus>&{error?:string;inviteCode?:string;expiresAt?:number|string};

export function openAccount(){window.dispatchEvent(new Event('dg-open-account'));}

export function AccountHub({notify,roomCode,roomToken,playLocked=false,onProfile}:{notify:(message:string)=>void;roomCode?:string;roomToken?:string;playLocked?:boolean;onProfile?:(profile:AccountProfile|null)=>void}){
 const [open,setOpen]=useState(false),[status,setStatus]=useState<AccountStatus|null>(null),[loading,setLoading]=useState(true),[busy,setBusy]=useState(''),[error,setError]=useState('');
 const [name,setName]=useState(''),[avatar,setAvatar]=useState(0),[autoPlay,setAutoPlay]=useState(true),[claimGuest,setClaimGuest]=useState(true),[guest,setGuest]=useState<GuestIdentity|null>(null),[hasGuestData,setHasGuestData]=useState(false);
 const [friendCode,setFriendCode]=useState(''),[inviteLink,setInviteLink]=useState(''),[expiresAt,setExpiresAt]=useState<number|string|undefined>(),[copied,setCopied]=useState(false),[returnTo,setReturnTo]=useState('/');
 const panel=useRef<HTMLElement>(null),fetchRevision=useRef(0),profileKey=useRef(''),accountId=useRef<string|null|undefined>(undefined),mounted=useRef(true);
 const account=status?.account;
 const inspectGuest=useCallback(()=>{
  try{const raw=localStorage.getItem('dg-ranked');setHasGuestData(!!raw);const saved=JSON.parse(raw||'null') as GuestIdentity|null;setGuest(saved&&typeof saved.profileId==='string'&&typeof saved.token==='string'&&saved.profileId&&saved.token?saved:null);}catch{setHasGuestData(true);setGuest(null);}
 },[]);
 const refresh=useCallback(async(showLoading=false)=>{
  const revision=++fetchRevision.current;if(showLoading)setLoading(true);
  try{
   const response=await fetch('/api/account',{cache:'no-store',signal:AbortSignal.timeout(12000)}),data=await response.json() as AccountReply;
   if(!response.ok)throw new Error(data.error||'账号暂时没有连接上，请重试。');
   if(!mounted.current||revision!==fetchRevision.current)return null;
   const next:AccountStatus={signedIn:!!data.signedIn,account:data.account||null};setStatus(next);
   const nextId=next.account?.profile.id||null,identityChanged=accountId.current!==undefined&&accountId.current!==nextId;accountId.current=nextId;
   if(identityChanged)window.dispatchEvent(new Event('dg-account-changed'));
   const key=next.account?JSON.stringify([next.account.profile.id,next.account.profile.name,next.account.profile.avatar,next.account.preferences.autoPlay]):'guest';
   if(key!==profileKey.current){profileKey.current=key;onProfile?.(next.account?.profile||null);setName(next.account?.profile.name||localStorage.getItem('dg-name')||'');setAvatar(next.account?.profile.avatar??Number(localStorage.getItem('dg-avatar')||0));setAutoPlay(next.account?.preferences.autoPlay??localStorage.getItem('dg-autoplay')!=='off');}
   setError('');return next;
  }catch(e){if(mounted.current&&revision===fetchRevision.current)setError(e instanceof Error?e.message:'账号暂时没有连接上。');return null;}
  finally{if(mounted.current&&revision===fetchRevision.current)setLoading(false);}
 },[onProfile]);
 useEffect(()=>{
  mounted.current=true;
  const initialize=setTimeout(()=>{inspectGuest();void refresh(true);setReturnTo(location.pathname+location.search+location.hash);const incoming=new URLSearchParams(location.search).get('friend');if(incoming){setFriendCode(incoming.slice(0,160));setOpen(true);}},0);
  const show=()=>{inspectGuest();setReturnTo(location.pathname+location.search+location.hash);setOpen(true);void refresh(true);};
  const changed=()=>{inspectGuest();void refresh();};
  const focus=()=>{if(document.visibilityState==='visible')void refresh();};
  window.addEventListener('dg-open-account',show);window.addEventListener('dg-account-changed',changed);window.addEventListener('focus',focus);
  return()=>{mounted.current=false;clearTimeout(initialize);window.removeEventListener('dg-open-account',show);window.removeEventListener('dg-account-changed',changed);window.removeEventListener('focus',focus);};
 },[inspectGuest,refresh]);
 useEffect(()=>{
  if(!open)return;
  const previous=document.activeElement as HTMLElement|null,previousOverflow=document.body.style.overflow;
  document.body.style.overflow='hidden';panel.current?.querySelector<HTMLButtonElement>('.account-close')?.focus();
  const keyboard=(event:KeyboardEvent)=>{
   if(event.key==='Escape'){setOpen(false);return;}
   if(event.key!=='Tab')return;
   const items=[...panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),[tabindex="0"]')||[]],first=items[0],last=items.at(-1);
   if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
  };
  document.addEventListener('keydown',keyboard);
  const timer=setInterval(()=>{if(document.visibilityState==='visible')void refresh();},30000);
  return()=>{clearInterval(timer);document.removeEventListener('keydown',keyboard);document.body.style.overflow=previousOverflow;previous?.focus();};
 },[open,refresh]);
 async function post(action:string,extra:Record<string,unknown>={}){
  const response=await fetch('/api/account',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,...extra}),signal:AbortSignal.timeout(15000)}),data=await response.json() as AccountReply;
  if(!response.ok)throw new Error(data.error||'操作没有完成，请稍后重试。');return data;
 }
 async function saveProfile(register=false){
  if(busy||playLocked)return;if(!name.trim()){setError('先取一个昵称吧。');return;}
  if(register&&claimGuest&&hasGuestData&&!guest){setError('本地游客记录无法读取，记录仍保留在浏览器里。请先取消勾选，才会创建独立的新档案。');return;}
  setBusy(register?'register':'save');setError('');
  try{
   const submittedGuest=register&&claimGuest&&guest?{...guest}:null;
   const result=await post(register?'register':'update',{name:name.trim(),avatar,autoPlay,...(submittedGuest?{guest:submittedGuest}: {})});
   const claimed=!!submittedGuest&&result.account?.profile.id===submittedGuest.profileId;
   if(claimed){try{const stored=JSON.parse(localStorage.getItem('dg-ranked')||'null') as GuestIdentity|null;if(stored?.profileId===submittedGuest.profileId&&stored?.token===submittedGuest.token)localStorage.removeItem('dg-ranked');}catch{/* Preserve a local identity that changed or cannot be read. */}}

   localStorage.setItem('dg-name',name.trim());localStorage.setItem('dg-avatar',String(avatar));localStorage.setItem('dg-autoplay',autoPlay?'on':'off');
   inspectGuest();await refresh();window.dispatchEvent(new Event('dg-account-changed'));notify(register?(submittedGuest&&!claimed?'已恢复账号已有的云端档案，游客记录未合并、未删除。':'账号档案已就绪，之后的段位和战绩会云端保存。'):'账号资料已保存。');
  }catch(e){setError(e instanceof Error?e.message:'保存没有完成，本地游客记录未被清除。');}
  finally{setBusy('');}
 }
 async function copyInvite(){
  if(busy)return;setBusy('copy');setError('');
  try{
   let link=inviteLink;const expires=expiresAt?new Date(expiresAt).getTime():0;
   if(!link||(expires&&expires<=Date.now())){const data=await post('createInvite');if(!data.inviteCode)throw new Error('邀请链接没有生成成功，请重试。');const url=new URL(location.pathname,location.origin);url.searchParams.set('friend',data.inviteCode);link=url.toString();setInviteLink(link);setExpiresAt(data.expiresAt);}
   try{await navigator.clipboard.writeText(link);setCopied(true);notify('好友邀请链接已复制，发给你想邀请的朋友。');}catch{notify('链接已生成，请选中下方链接手动复制。');}
  }catch(e){setError(e instanceof Error?e.message:'邀请链接没有生成成功。');}finally{setBusy('');}
 }
 async function acceptFriend(){
  if(busy||!friendCode.trim())return;setBusy('accept');setError('');
  try{
   let code=friendCode.trim();if(code.startsWith('https://')||code.startsWith('http://')){try{code=new URL(code).searchParams.get('friend')||'';}catch{throw new Error('请输入完整的好友邀请链接或邀请码。');}}
   if(!code)throw new Error('邀请链接里没有找到邀请码。');
   await post('acceptInvite',{inviteCode:code});setFriendCode('');
   const url=new URL(location.href);url.searchParams.delete('friend');history.replaceState(null,'',url.pathname+url.search+url.hash);setReturnTo(url.pathname+url.search+url.hash);
   await refresh();notify('已添加为好友，现在可以互相邀请开画。');
  }catch(e){setError(e instanceof Error?e.message:'添加好友没有完成。');}finally{setBusy('');}
 }
 async function inviteToRoom(friendId:string){
  if(busy||!roomCode)return;setBusy(friendId);setError('');
  try{await post('inviteToRoom',{friendId,roomCode,roomToken});notify('房间邀请已发送，对方可在好友面板加入。');}catch(e){setError(e instanceof Error?e.message:'房间邀请没有发送成功。');}finally{setBusy('');}
 }
 const returnUrl=new URL(returnTo,'https://drawandguess.invalid');if(friendCode&&!returnUrl.searchParams.has('friend'))returnUrl.searchParams.set('friend',friendCode);
 const authReturn=returnUrl.pathname+returnUrl.search+returnUrl.hash;
 const authHref='/signin-with-chatgpt?return_to='+encodeURIComponent(authReturn),signoutHref='/signout-with-chatgpt?return_to='+encodeURIComponent(authReturn);
 return <>
  <button className={'account-button '+(account?'has-account':'')} onClick={()=>{inspectGuest();setReturnTo(location.pathname+location.search+location.hash);setOpen(true);void refresh(true);}} aria-haspopup="dialog" aria-label={account?'打开账号和好友面板':'登录、注册与好友'}>
   {account?<Avatar index={account.profile.avatar}/>:<UserRound size={17}/>}<span>{account?account.profile.name:'登录 / 注册'}</span>{!!account?.invites.length&&<i aria-label={account.invites.length+' 条房间邀请'}>{Math.min(account.invites.length,99)}</i>}
  </button>
  {open&&<div className="modal-backdrop account-backdrop" onClick={event=>{if(event.target===event.currentTarget)setOpen(false);}}>
   <section ref={panel} className="account-panel" role="dialog" aria-modal="true" aria-labelledby="account-title" aria-busy={!!busy||loading}>
    <header className="account-panel-header"><div><span className="eyebrow">YOUR LITTLE DRAWING CLUB</span><h2 id="account-title">{account?'你的账号，与好友':'留住段位，找到画友。'}</h2></div><button className="icon-button account-close" aria-label="关闭账号面板" onClick={()=>setOpen(false)}><X size={21}/></button></header>
    {loading&&!status?<div className="account-loading" role="status"><Loader2 className="spin" size={25}/>正在连接你的账号…</div>:<>
     {error&&<div className="account-error" role="alert"><p>{error}</p>{!status&&<button className="text-button" onClick={()=>void refresh(true)}><RefreshCw size={14}/>重新连接</button>}</div>}
     {playLocked&&<p className="account-lock-note">先回到大厅，再登录、创建档案或修改账号，避免中断当前对局。好友列表仍可查看。</p>}
     {status&&!status.signedIn&&<div className="account-welcome">
      <div className="account-cloud-mark"><Cloud size={31}/><span><ShieldCheck size={17}/></span></div><h3>每一笔进步，都跟着你。</h3><p>使用 ChatGPT 账号登录。首次登录后，取个昵称就能创建游戏档案，无需单独设置密码。</p>
      <ul className="account-benefits"><li><Check size={16}/>段位、战绩、头像与设置云端保存</li><li><Check size={16}/>换个设备，登录后接着玩</li><li><Check size={16}/>保存好友，直接邀请一起开画</li></ul>
      {friendCode&&<div className="account-pending-invite"><Users size={18}/><span>你收到了一份好友邀请。登录并创建档案后，点击“接受邀请”即可添加。</span></div>}
      {playLocked?<button className="primary account-auth" disabled><LogIn size={18}/>使用 ChatGPT 登录 / 注册</button>:<a className="primary account-auth" href={authHref} target="_top"><LogIn size={18}/>使用 ChatGPT 登录 / 注册<ArrowRight size={17}/></a>}
      <p className="account-caption">也可以继续游客体验。游客身份只保存在当前浏览器，不会自动同步到其他设备。</p>
     </div>}
     {status?.signedIn&&<>
      {!account&&<div className="account-enroll-note"><ShieldCheck size={21}/><span><strong>ChatGPT 已登录</strong><small>最后一步：创建属于你的游戏档案。</small></span></div>}
      {account&&<div className="account-summary"><Avatar index={account.profile.avatar}/><div><strong>{account.profile.name}</strong><span><Cloud size={14}/>账号云端保存</span></div><div className="account-record"><b>{account.profile.rp} <small>RP</small></b><span>{account.profile.wins} 胜 · {account.profile.losses} 负</span></div></div>}
      <form className="account-profile-form" onSubmit={event=>{event.preventDefault();void saveProfile(!account);}}>
       <label htmlFor="account-name">游戏昵称</label><input id="account-name" name="nickname" autoComplete="nickname" maxLength={16} placeholder="取一个大家认得出的昵称" value={name} onChange={event=>setName(event.target.value)} disabled={!!busy||playLocked}/>
       <fieldset disabled={!!busy||playLocked}><legend>选一个头像</legend><div className="account-avatar-grid">{Array.from({length:8},(_,index)=><button type="button" key={index} className={avatar===index?'selected':''} aria-label={'头像 '+(index+1)} aria-pressed={avatar===index} onClick={()=>setAvatar(index)}><Avatar index={index}/>{avatar===index&&<span><Check size={11}/></span>}</button>)}</div></fieldset>
       <label className="account-checkbox"><input type="checkbox" checked={autoPlay} onChange={event=>setAutoPlay(event.target.checked)} disabled={!!busy||playLocked}/><span>排位结束后自动开始下一桌</span></label>
       {!account&&hasGuestData&&<label className="account-claim"><input type="checkbox" checked={claimGuest} onChange={event=>setClaimGuest(event.target.checked)} disabled={!!busy||playLocked}/><span><strong>保存这台浏览器的游客战绩</strong><small>{guest?'把现有段位和胜负记录转入这个新账号。仅创建新账号时可转入，成功后才会移除本地游客身份。':'本地游客记录无法读取，记录未被删除。取消勾选可创建独立的新档案。'}不勾选则保留原游客记录，不会合并。</small></span></label>}
       <button className="primary account-save" disabled={!!busy||playLocked||!name.trim()}>{busy==='save'||busy==='register'?<Loader2 className="spin" size={17}/>:<Cloud size={17}/>} {account?'保存账号资料':'创建游戏档案'}</button>
      </form>
      {account&&<>
       {hasGuestData&&<p className="account-caption account-existing-note">此处显示账号已有的云端档案。本浏览器的游客记录没有与它合并，也没有被删除。</p>}
       <section className="account-friends"><div className="account-section-heading"><h3><Users size={18}/>好友 <span>{account.friends.length}</span></h3><button className="text-button" disabled={loading||!!busy} aria-label="刷新好友和邀请" onClick={()=>void refresh(true)}><RefreshCw size={15} className={loading?'spin':''}/></button></div>
        <div className="account-invite-card"><strong>把画友留在好友列表里。</strong><p>邀请链接 7 天有效，每条只能添加一位好友。复制后由你分享，不会自动发给其他人。</p><button className="secondary" disabled={!!busy} onClick={()=>void copyInvite()}>{busy==='copy'?<Loader2 size={16} className="spin"/>:copied?<Check size={16}/>:<Copy size={16}/>} {copied?'再次复制好友链接':'复制好友邀请链接'}</button>
         {inviteLink&&<div className="account-generated-link"><label htmlFor="friend-share-link">好友邀请链接</label><input id="friend-share-link" readOnly value={inviteLink} onFocus={event=>event.target.select()}/><div><small>{expiresAt?'有效期至 '+new Date(expiresAt).toLocaleDateString('zh-CN'):'7 天内有效'} · 单次使用</small><button className="text-button" disabled={!!busy} onClick={()=>{setInviteLink('');setExpiresAt(undefined);setCopied(false);}}>换一条新链接</button></div></div>}
        </div>
        <form className={'account-accept-form '+(friendCode?'has-invite':'')} onSubmit={event=>{event.preventDefault();void acceptFriend();}}><label htmlFor="friend-invite-code">{friendCode?'接受好友邀请':'已经有朋友的邀请码？'}</label><div><input id="friend-invite-code" value={friendCode} onChange={event=>setFriendCode(event.target.value.slice(0,2048))} placeholder="粘贴好友邀请链接或邀请码" autoComplete="off" disabled={!!busy}/><button className="primary" disabled={!!busy||!friendCode.trim()}>{busy==='accept'?<Loader2 className="spin" size={16}/>:<Check size={16}/>}接受邀请</button></div><small>只有点击接受，才会互相添加为好友。</small></form>
        {!account.friends.length?<div className="account-empty"><Users size={25}/><p>还没有好友，把第一份灵感分享给朋友吧。</p></div>:<ul className="account-friend-list">{account.friends.map(friend=><li key={friend.id}><Avatar index={friend.avatar}/><div><strong>{friend.name}</strong><span>{friend.rp} RP</span></div>{roomCode?<button className="secondary" disabled={!!busy} onClick={()=>void inviteToRoom(friend.id)}>{busy===friend.id?<Loader2 size={14} className="spin"/>:<ArrowRight size={14}/>}邀请进房</button>:<span className="account-friend-note">开房后可邀请</span>}</li>)}</ul>}
       </section>
       <section className="account-room-invites"><div className="account-section-heading"><h3>收到的房间邀请 <span>{account.invites.length}</span></h3></div>{!account.invites.length?<p className="account-caption">暂时没有新邀请。好友邀请你时，会出现在这里。</p>:<ul>{account.invites.map(invite=><li key={invite.id}><Avatar index={invite.from.avatar}/><div><strong>{invite.from.name} 邀你一起画</strong><span>房间 {invite.roomCode}</span></div>{playLocked?<button className="secondary" disabled>先结束当前对局</button>:<a className="secondary" href={'?room='+encodeURIComponent(invite.roomCode)}>加入房间<ArrowRight size={14}/></a>}</li>)}</ul>}</section>
      </>}
      <footer className="account-panel-footer"><span><ShieldCheck size={14}/>使用 ChatGPT 账号验证身份</span>{playLocked?<button className="text-button" disabled><LogOut size={14}/>退出登录</button>:<a href={signoutHref} target="_top"><LogOut size={14}/>退出登录</a>}</footer>
     </>}
    </>}
   </section>
  </div>}
 </>;
}
