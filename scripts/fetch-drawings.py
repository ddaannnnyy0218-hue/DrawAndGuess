"""Download bounded samples of recognized Quick, Draw! strokes; omit source personal metadata."""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor,as_completed
import urllib.request,urllib.parse,json,time
ROOT=Path(__file__).resolve().parents[1]
levels=json.loads((ROOT/'lib/levels.json').read_text())
target=ROOT/'public/drawings';target.mkdir(parents=True,exist_ok=True)
def fetch(item):
 label,word,_=item;dest=target/(label.replace(' ','-')+'.json')
 if dest.exists():return label,'cached'
 url='https://storage.googleapis.com/quickdraw_dataset/full/simplified/'+urllib.parse.quote(label)+'.ndjson'
 for attempt in range(3):
  try:
   req=urllib.request.Request(url,headers={'Range':'bytes=0-65535'})
   with urllib.request.urlopen(req,timeout=30) as r: raw=r.read(65536).decode('utf8')
   drawings=[]
   for line in raw.splitlines():
    try:d=json.loads(line)
    except json.JSONDecodeError:continue
    if d.get('recognized') and len(d['drawing'])<35:
     drawings.append({'drawing':d['drawing'],'sourceId':str(d['key_id'])})
    if len(drawings)>=5:break
   if not drawings:raise ValueError('no complete recognized drawings')
   dest.write_text(json.dumps({'label':label,'word':word,'samples':drawings},separators=(',',':'),ensure_ascii=False))
   return label,len(drawings)
  except Exception:
   if attempt==2:raise
   time.sleep(.5)
with ThreadPoolExecutor(max_workers=10) as pool:
 jobs={pool.submit(fetch,item):item[0] for item in levels}
 for n,future in enumerate(as_completed(jobs),1):
  label,result=future.result()
  if n%10==0:print(n,'/',len(levels),label,result,flush=True)
