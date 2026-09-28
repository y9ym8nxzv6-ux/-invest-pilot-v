#!/usr/bin/env python3
import json, urllib.parse, urllib.request
from datetime import datetime, timezone
from pathlib import Path
from xml.etree import ElementTree as ET

# manual-refresh-hook
ROOT=Path(__file__).resolve().parents[1]
DATA=ROOT/"data"
RANKING=DATA/"latest-ranking.json"
OUT=DATA/"research.json"
UA="Mozilla/5.0 InvestPilotV7"

POS={"上方修正":4,"最高益":4,"過去最高":4,"増益":2,"増収":2,"増配":3,"自社株買い":3,"大型受注":4,"受注":2,"黒字転換":4,"上振れ":3}
NEG={"下方修正":-5,"赤字転落":-5,"赤字":-4,"減益":-3,"減収":-2,"不正":-5,"行政処分":-5,"希薄化":-3,"公募増資":-4,"債務超過":-6,"継続企業":-5,"不祥事":-5,"下振れ":-3}

def fetch(url,timeout=25):
    req=urllib.request.Request(url,headers={"User-Agent":UA})
    with urllib.request.urlopen(req,timeout=timeout) as r:return r.read()

def classify(text):
    score=0;pos=[];neg=[]
    for k,v in POS.items():
        if k in text:score+=v;pos.append(k)
    for k,v in NEG.items():
        if k in text:score+=v;neg.append(k)
    return max(-18,min(18,score)),sorted(set(pos)),sorted(set(neg))

def one(stock):
    q=urllib.parse.quote(f'{stock["code"]} {stock["company"]} 株 決算 OR 上方修正 OR 下方修正 OR 増配 OR 自社株買い')
    url="https://news.google.com/rss/search?q="+q+"&hl=ja&gl=JP&ceid=JP:ja"
    xml=fetch(url)
    root=ET.fromstring(xml)
    items=[];titles=[]
    for item in root.findall(".//item")[:10]:
        title=(item.findtext("title") or "").strip()
        link=(item.findtext("link") or "").strip()
        pub=(item.findtext("pubDate") or "").strip()
        if title:
            titles.append(title)
            items.append({"title":title,"url":link,"published":pub})
    score,pos,neg=classify(" ".join(titles))
    return {"code":stock["code"],"company":stock["company"],"score":score,"positive":pos,"negative":neg,"results":items}

def main():
    if not RANKING.exists():
        print("ranking not ready; skip")
        return
    ranking=json.loads(RANKING.read_text(encoding="utf-8"))
    stocks=ranking.get("top100",[])
    targets=[x for x in stocks if x.get("timing",{}).get("key") in {"buy","wait"}][:30]
    if len(targets)<20:
        seen={x["code"] for x in targets}
        targets+= [x for x in stocks if x["code"] not in seen][:30-len(targets)]
    out={}
    for i,s in enumerate(targets,1):
        try:
            out[s["code"]]=one(s)
            print(f"{i}/{len(targets)} {s['code']} ok",flush=True)
        except Exception as e:
            out[s["code"]]={"code":s["code"],"company":s["company"],"error":str(e),"results":[]}
            print(f"{i}/{len(targets)} {s['code']} error {e}",flush=True)
    payload={"generated_at":datetime.now(timezone.utc).isoformat(),"count":len(out),"stocks":out}
    OUT.write_text(json.dumps(payload,ensure_ascii=False,separators=(",",":")),encoding="utf-8")
    print("research generated",len(out))

if __name__=="__main__":main()
