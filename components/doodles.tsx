export function BrandMark(){return <svg viewBox="0 0 44 44" fill="none" aria-hidden="true"><rect x="2" y="2" width="40" height="40" rx="13" fill="#C6E77C" stroke="currentColor" strokeWidth="2.5"/><path d="m12 30 4-14 6 9 7-13 4 18" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/><circle cx="14" cy="32" r="1.5" fill="currentColor"/></svg>}
export function Avatar({index=0,className=''}:{index?:number;className?:string}){
  const colors=['#c6e77c','#c6d8fc','#ffc4b6','#ffd489','#d5c5f1','#b8e6dd','#f5b9d6','#d9dfad'];
  return <span className={'avatar '+className} style={{background:colors[index%8]}}><svg viewBox="0 0 64 64" fill="none" aria-hidden="true">
    {index%4===0?<><path d="M14 29 13 13l16 10m6 0 15-10-1 20" fill="#fffefb" stroke="#292c25" strokeWidth="2.4"/><path d="M14 34c-2-17 39-20 38 0 1 22-37 24-38 0Z" fill="#fffefb" stroke="#292c25" strokeWidth="2.4"/><path d="m18 43-8 1m9 3-7 3m34-7 9 1m-10 3 8 3" stroke="#292c25" strokeWidth="2" strokeLinecap="round"/></>:index%4===1?<><path d="M17 28c-19-28 5-32 11-2m8 0c9-32 28-25 12 4" fill="#fffefb" stroke="#292c25" strokeWidth="2.4"/><path d="M13 35c0-21 40-20 40 0 0 25-40 24-40 0Z" fill="#fffefb" stroke="#292c25" strokeWidth="2.4"/></>:index%4===2?<><path d="M10 31c-13-20 13-28 17-12m10 0c5-16 29-6 17 12" fill="#fffefb" stroke="#292c25" strokeWidth="2.4"/><path d="M10 35c0-27 45-25 45 0 0 26-45 25-45 0Z" fill="#fffefb" stroke="#292c25" strokeWidth="2.4"/></>:<><path d="M11 27c0-18 19-10 21-14 6 12 23-1 23 20 0 26-44 27-44-6Z" fill="#fffefb" stroke="#292c25" strokeWidth="2.4"/><path d="m26 11 7-6 6 6" stroke="#292c25" strokeWidth="2.4" strokeLinecap="round"/></>}
    <path d="M24 33v4m16-4v4" stroke="#292c25" strokeWidth="3" strokeLinecap="round"/><path d="m29 43 3 2 4-3" stroke="#292c25" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg></span>
}
export function Balloon({className=''}:{className?:string}){return <svg className={className} viewBox="0 0 500 420" fill="none" aria-hidden="true">
  <path d="M49 310c26-22 51-13 58-26s18-19 33-7m225-31c24-16 43-4 51-10 14-11 34-10 47 4" stroke="#b6beb0" strokeWidth="2" strokeLinecap="round"/>
  <path d="M226 267c-41-43-73-75-69-126 3-65 54-104 113-98 69 6 105 48 98 111-5 49-37 81-70 119" fill="#d9edb1"/>
  <path d="M223 267c-39-43-75-76-70-128 7-65 59-105 120-96 65 9 100 52 91 111-7 49-40 84-69 117" stroke="#30382a" strokeWidth="4" strokeLinecap="round"/>
  <path d="M247 270c-31-78-29-177 15-227m12 229c34-83 34-176-2-228" stroke="#30382a" strokeWidth="3" strokeLinecap="round"/>
  <path d="M165 116c54 34 129 39 190 6m-193 53c61 32 121 40 184 11m-146 49c36 17 75 21 119 6" stroke="#30382a" strokeWidth="2.5" strokeLinecap="round"/>
  <path d="m223 269 13 42m59-40-9 40m-53 0 56-1-6 35-43 1-7-35Z" fill="#ffd489" stroke="#30382a" strokeWidth="3" strokeLinejoin="round"/>
  <path d="m250 310 4 34m17-34-3 35M82 99l10-15m-24 16-7-9m33 26 15-2m285 220 12 8m-21-1-2 14" stroke="#30382a" strokeWidth="3" strokeLinecap="round"/>
  <path d="M108 215c1-8 7-13 13-7 9-14 26-8 27 5" stroke="#bbc2b2" strokeWidth="2.5" strokeLinecap="round"/>
</svg>}
