#!/usr/bin/env python3
import csv, io, json, math, re, statistics, urllib.request, urllib.parse, zipfile
from collections import defaultdict
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from xml.etree import ElementTree as ET

SOURCE="https://softhompo.a.la9.jp/Data/StockData.html"
UA="Mozilla/5.0 InvestPilotV7/1.0"
ROOT=Path(__file__).resolve().parents[1]
DATA=ROOT/"data"
DATA.mkdir(exist_ok=True)

SEMI=set("""
285A 6526 6723 6963 6146 6227 6235 6298 6315 6323 6337 6387 6855 6857 6871 6875 7725 7729 7735 8035
2760 3132 3436 3445 4004 4062 4063 4186 4369 6055 6266 6525 6590 6668 6728 6730 6920 6941 8155
""".split())

POS={"上方修正":4,"最高益":4,"過去最高":4,"増益":2,"増収":2,"増配":3,"自社株買い":3,"大型受注":4,"受注":2,"黒字転換":4,"上振れ":3}
NEG={"下方修正":-5,"赤字転落":-5,"赤字":-4,"減益":-3,"減収":-2,"不正":-5,"行政処分":-5,"希薄化":-3,"公募増資":-4,"債務超過":-6,"継続企業":-5,"不祥事":-5,"下振れ":-3}

def get(url, timeout=45):
    req=urllib.request.Request(url,headers={"User-Agent":UA,"Accept":"*/*"})
    with urllib.request.urlopen(req,timeout=timeout) as r:
        return r.read()

class LinkParser(HTMLParser):
    def __init__(self):
        super().__init__(); self.links=[]; self._href=None; self._txt=[]; self.section=""
    def handle_starttag(self,tag,attrs):
        if tag.lower()=="a":
            self._href=dict(attrs).get("href"); self._txt=[]
        if tag.lower() in {"h1","h2","h3","h4"}: self._txt=[]
    def handle_data(self,data): self._txt.append(data)
    def handle_endtag(self,tag):
        text=" ".join("".join(self._txt).split())
        if tag.lower() in {"h1","h2","h3","h4"}:
            if "株価データ" in text and "信用" not in text: self.section="prices"
            elif "株式分割・併合データ" in text: self.section="splits"
            elif self.section and any(k in text for k in ["信用取引","公開の趣旨"]): self.section=""
        if tag.lower()=="a" and self._href:
            self.links.append((self.section,text,urllib.parse.urljoin(SOURCE,self._href)))
            self._href=None; self._txt=[]

def discover():
    html=get(SOURCE).decode("shift_jis","ignore")
    p=LinkParser(); p.feed(html)
    prices=[]
    for section,label,url in p.links:
        if section!="prices": continue
        m=re.search(r"(20\d{2})年\s*(\d{1,2})月(?:\s*(\d{1,2})日)?",label)
        if not m: continue
        y,mo,d=m.groups(); key=f"{y}-{int(mo):02d}"+(f"-{int(d):02d}" if d else "")
        prices.append((key,label,url))
    prices.sort()
    months=[x for x in prices if len(x[0])==7][-14:]
    days=[x for x in prices if len(x[0])==10][-40:]
    seen=set(); out=[]
    for x in months+days:
        if x[2] not in seen: seen.add(x[2]); out.append(x)
    return out

def decode(b):
    for enc in ("cp932","shift_jis","utf-8-sig","utf-8"):
        try:return b.decode(enc)
        except:pass
    return b.decode("utf-8","ignore")

def norm(s): return re.sub(r"\s+"," ",str(s or "")).strip()
def code(s): return re.sub(r"\.0$","",norm(s)).upper()

def dateint(s, fallback=None):
    s=norm(s)
    m=re.search(r"(20\d{2})\D?(\d{1,2})\D?(\d{1,2})",s)
    if not m and re.fullmatch(r"\d{8}",s): return int(s)
    if not m: return fallback
    return int(m.group(1))*10000+int(m.group(2))*100+int(m.group(3))

def infer_date(name, fallback=None):
    m=re.search(r"(20\d{2})[-_]?(\d{2})[-_]?(\d{2})",name)
    if m:return int(m.group(1))*10000+int(m.group(2))*100+int(m.group(3))
    m=re.search(r"(?:^|\D)(\d{2})(\d{2})(\d{2})(?:\D|$)",name)
    if m:return (2000+int(m.group(1)))*10000+int(m.group(2))*100+int(m.group(3))
    return fallback

def col(headers, candidates):
    hs=[norm(x).lower() for x in headers]
    for c in candidates:
        if c.lower() in hs:return hs.index(c.lower())
    for i,h in enumerate(hs):
        if any(c.lower() in h for c in candidates): return i
    return -1

def parse_text(text, default_date=None):
    lines=[x for x in text.splitlines() if x.strip() and not x.strip().startswith("!")]
    if len(lines)<2:return []
    sep="\t" if lines[0].count("\t")>lines[0].count(",") else ","
    rows=list(csv.reader(lines,delimiter=sep))
    h=rows[0]
    ci=col(h,["code","コード","銘柄コード","証券コード"])
    di=col(h,["date","日付","年月日","取引日"])
    xi=col(h,["close","終値","終値(円)","closing"])
    vi=col(h,["volume","出来高","売買高"])
    ni=col(h,["company","会社名","銘柄名","銘柄名称","name"])
    mi=col(h,["market","市場区分","市場"])
    si=col(h,["sector33","33業種区分","業種","業種名"])
    if ci<0 or xi<0:return []
    out=[]
    for r in rows[1:]:
        if len(r)<=max(ci,xi):continue
        cd=code(r[ci])
        try:cl=float(str(r[xi]).replace(",",""))
        except:continue
        dt=dateint(r[di],default_date) if di>=0 and di<len(r) else default_date
        if not cd or not dt or cl<=0:continue
        vol=None
        if vi>=0 and vi<len(r):
            try:vol=float(str(r[vi]).replace(",",""))
            except:pass
        out.append((cd,dt,cl,vol,norm(r[ni]) if ni>=0 and ni<len(r) else "",norm(r[mi]) if mi>=0 and mi<len(r) else "",norm(r[si]) if si>=0 and si<len(r) else ""))
    return out

def parse_archive(key,label,url):
    b=get(url,90); fallback=dateint(key)
    out=[]
    if b[:2]==b"PK":
        z=zipfile.ZipFile(io.BytesIO(b))
        for name in z.namelist():
            if not re.search(r"\.(csv|txt)$",name,re.I):continue
            out.extend(parse_text(decode(z.read(name)),infer_date(name,fallback)))
    else: out.extend(parse_text(decode(b),fallback))
    return out

def pct_rank(items, field):
    vals=sorted((x[field],i) for i,x in enumerate(items) if isinstance(x.get(field),(int,float)) and math.isfinite(x[field]))
    ranks=[.5]*len(items)
    if len(vals)>1:
        for rank,(_,idx) in enumerate(vals): ranks[idx]=rank/(len(vals)-1)
    return ranks

def signal(x):
    s=x["technical_score"]; r5=x.get("ret5"); r20=x.get("ret20"); r60=x.get("ret60"); trend=x.get("trend_count",0)
    reasons=[]
    if trend>=3: reasons.append("中期上昇")
    if isinstance(r20,float):
        if r20>.15: reasons.append("短期過熱")
        elif -.05<=r20<=.10: reasons.append("過熱感小")
        elif r20<-.10: reasons.append("調整中")
    if isinstance(r5,float) and r5>.06: reasons.append("直近急伸")
    if isinstance(r5,float) and r5<-.05: reasons.append("直近反落")
    if s>=80 and trend>=3 and isinstance(r20,float) and -.05<=r20<=.12 and (not isinstance(r5,float) or r5<=.05):
        lab="buy";label="🟢 買い候補"
    elif s>=78 and trend>=3 and ((isinstance(r20,float) and r20>.12) or (isinstance(r5,float) and r5>.05)):
        lab="wait";label="🟡 押し目待ち"
    elif s<60 or trend<=1 or (isinstance(r60,float) and r60<-.10):
        lab="avoid";label="🔴 見送り"
    else:lab="watch";label="🔵 監視"
    return {"key":lab,"label":label,"reason":"・".join(reasons[:2]) or "条件確認中"}

def score(series):
    raw=[]
    for cd,x in series.items():
        pts=sorted(x["points"].items())
        if len(pts)<251:continue
        vals=[p[1][0] for p in pts]; c=vals[-1]
        def ret(n): return c/vals[-1-n]-1
        def avg(n): return sum(vals[-n:])/n
        trend=sum(c>avg(n) for n in (20,60,120,250))
        volvals=[p[1][1]*p[1][0] for p in pts[-20:] if p[1][1]]
        raw.append({"code":cd,"company":x["company"] or cd,"market":x["market"],"sector33":x["sector"],"close":c,"ret5":ret(5),"ret20":ret(20),"ret60":ret(60),"ret120":ret(120),"ret250":ret(250),"trend_count":trend,"avg_value":sum(volvals)/len(volvals) if volvals else 0,"is_semiconductor":cd in SEMI,"adjustment_events":0})
    ranks={f:pct_rank(raw,f) for f in ("ret20","ret60","ret120","ret250","avg_value")}
    for i,x in enumerate(raw):
        sc=100*(.28*ranks["ret20"][i]+.28*ranks["ret60"][i]+.18*ranks["ret120"][i]+.12*ranks["ret250"][i]+.10*(x["trend_count"]/4)+.04*ranks["avg_value"][i])
        if x["ret20"]>.40:sc-=min(10,(x["ret20"]-.40)*20)
        if x["ret20"]<-.20:sc-=4
        x["technical_score"]=round(max(0,min(100,sc)),2);x["timing"]=signal(x)
    raw.sort(key=lambda x:x["technical_score"],reverse=True)
    for i,x in enumerate(raw,1):x["rank"]=i
    return raw[:100]

def research(items):
    out={}
    for x in items[:30]:
        q=urllib.parse.quote(f'{x["code"]} {x["company"]} 株 決算 OR 上方修正 OR 下方修正')
        url="https://news.google.com/rss/search?q="+q+"&hl=ja&gl=JP&ceid=JP:ja"
        try:
            xml=get(url,25); root=ET.fromstring(xml); entries=[]
            text=""
            for item in root.findall(".//item")[:8]:
                title=norm(item.findtext("title")); link=norm(item.findtext("link")); pub=norm(item.findtext("pubDate"))
                entries.append({"title":title,"url":link,"published":pub});text+=" "+title
            sc=0;pos=[];neg=[]
            for k,v in POS.items():
                if k in text:sc+=v;pos.append(k)
            for k,v in NEG.items():
                if k in text:sc+=v;neg.append(k)
            out[x["code"]]={"code":x["code"],"company":x["company"],"score":max(-18,min(18,sc)),"positive":sorted(set(pos)),"negative":sorted(set(neg)),"results":entries}
        except Exception as e:out[x["code"]]={"code":x["code"],"company":x["company"],"error":str(e),"results":[]}
    return out

def main():
    links=discover()
    if not links: raise SystemExit("No price links found")
    series=defaultdict(lambda:{"company":"","market":"","sector":"","points":{}})
    for key,label,url in links:
        try:
            for cd,dt,cl,vol,name,market,sector in parse_archive(key,label,url):
                x=series[cd];x["points"][dt]=(cl,vol);x["company"]=x["company"] or name;x["market"]=x["market"] or market;x["sector"]=x["sector"] or sector
        except Exception as e: print("WARN",label,e)
    ranked=score(series)
    if not ranked:raise SystemExit("No ranked stocks")
    now=datetime.now(timezone.utc).isoformat()
    snap={"generated_at":now,"source":SOURCE,"count":len(ranked),"top100":ranked}
    (DATA/"latest-ranking.json").write_text(json.dumps(snap,ensure_ascii=False,separators=(",",":")),encoding="utf-8")
    rc={"generated_at":now,"count":min(30,len(ranked)),"stocks":research(ranked)}
    (DATA/"research.json").write_text(json.dumps(rc,ensure_ascii=False,separators=(",",":")),encoding="utf-8")
    print("generated",len(ranked),"ranking rows and",len(rc["stocks"]),"research rows")

if __name__=="__main__":main()
