"""Retain diverse real human Quick, Draw! strokes, without author/country/timestamp metadata."""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor,as_completed
import json,urllib.request,urllib.parse,time
root=Path(__file__).resolve().parents[1]
levels=json.loads((root/'lib/lexicon.json').read_text())
def expand(item):
 label,word=item[:2];p=root/'public/drawings'/(label.replace(' ','-')+'.json');old=json.loads(p.read_text()) if p.exists() else {'samples':[]}
 if len(old['samples'])>=24:return label,'cached'
 samples={d['sourceId']:d for d in old['samples']};preferred=old['samples'][old.get('preferred',0)]['sourceId'] if old['samples'] else None
 req=urllib.request.Request('https://storage.googleapis.com/quickdraw_dataset/full/simplified/'+urllib.parse.quote(label)+'.ndjson',headers={'Range':'bytes=0-262143'})
 for attempt in range(3):
  try:
   with urllib.request.urlopen(req,timeout=25) as r:raw=r.read(262144).decode('utf8')
   for line in raw.splitlines():
    try:d=json.loads(line)
    except json.JSONDecodeError:continue
    if not d.get('recognized') or not 1<=len(d['drawing'])<=28 or sum(len(s[0]) for s in d['drawing'])>1300:continue
    samples[str(d['key_id'])]={'drawing':[s[:2] for s in d['drawing']],'sourceId':str(d['key_id'])}
    if len(samples)>=24:break
   data=list(samples.values());p.write_text(json.dumps({'label':label,'word':word,'preferred':next((i for i,d in enumerate(data) if d['sourceId']==preferred),0),'samples':data},separators=(',',':'),ensure_ascii=False));return label,len(data)
  except Exception:
   if attempt==2:raise
   time.sleep(.4)
with ThreadPoolExecutor(max_workers=8) as pool:
 for n,f in enumerate(as_completed([pool.submit(expand,l) for l in levels]),1):
  label,count=f.result()
  if n%10==0:print(n,'/',len(levels),label,count,flush=True)
