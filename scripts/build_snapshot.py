#!/usr/bin/env python3
import io, json, math, re, urllib.request, urllib.parse
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd
import yfinance as yf

ROOT=Path(__file__).resolve().parents[1]
DATA=ROOT/"data"; DATA.mkdir(exist_ok=True)
JPX_PAGE="https://www.jpx.co.jp/markets/statistics-equities/misc/01.html"

SEMI=set("""
285A 6526 6723 6963 6146 6227 6235 6298 6315 6323 6337 6387 6855 6857 6871 6875 7725 7729 7735 8035
2760 3132 3436 3445 4004 4062 4063 4186 4369 6055 6266 6525 6590 6668 6728 6730 6920 6941 8155
""".split())

def get_jpx_list():
    req=urllib.request.Request(JPX_PAGE,headers={"User-Agent":"Mozilla/5.0 InvestPilotV7"})
    with urllib.request.urlopen(req,timeout=40) as r:
        page=r.read().decode("utf-8","ignore")
    matches=re.findall(r'href=["\\']([^"\\']*data[^"\\']*\\.xls[x]?[^"\\']*)["\\']',page,re.I)
    if not matches:
        matches=re.findall(r'href=["\\']([^"\\']*\\.xls[x]?[^"\\']*)["\\']',page,re.I)
    if not matches:
        raise RuntimeError("JPX listed-issues Excel link not found")
    excel_url=urllib.parse.urljoin("https://www.jpx.co.jp",matches[0])
    print("JPX list:",excel_url,flush=True)
    req=urllib.request.Request(excel_url,headers={"User-Agent":"Mozilla/5.0 InvestPilotV7"})
    with urllib.request.urlopen(req,timeout=40) as r:
        raw=r.read()
    df=pd.read_excel(io.BytesIO(raw),dtype=str)
    df.columns=[str(x).strip() for x in df.columns]
    code_col=next(c for c in df.columns if "コード" in c)
    name_col=next(c for c in df.columns if "銘柄名" in c)
    market_col=next((c for c in df.columns if "市場・商品区分" in c),None)
    sector_col=next((c for c in df.columns if "33業種区分" in c),None)
    rows=[]
    for _,r in df.iterrows():
        cd=str(r.get(code_col,"")).strip().replace(".0","").upper()
        if not re.fullmatch(r"[0-9A-Z]{4}",cd): continue
        market=str(r.get(market_col,"")) if market_col else ""
        if market_col and "内国株式" not in market: continue
        rows.append({
            "code":cd,
            "ticker":cd+".T",
            "company":str(r.get(name_col,"")).strip(),
            "market":market,
            "sector33":str(r.get(sector_col,"")).strip() if sector_col else ""
        })
    if not rows: raise RuntimeError("JPX listed-issues list parsed 0 stocks")
    return rows

def pct_rank(vals):
    valid=sorted((v,i) for i,v in enumerate(vals) if v is not None and math.isfinite(v))
    out=[.5]*len(vals)
    if len(valid)>1:
        for rank,(_,idx) in enumerate(valid): out[idx]=rank/(len(valid)-1)
    return out

def timing(x):
    s=x["technical_score"];r5=x["ret5"];r20=x["ret20"];r60=x["ret60"];trend=x["trend_count"]
    reasons=[]
    if trend>=3:reasons.append("中期上昇")
    if r20>.15:reasons.append("短期過熱")
    elif -.05<=r20<=.10:reasons.append("過熱感小")
    elif r20<-.10:reasons.append("調整中")
    if r5>.06:reasons.append("直近急伸")
    elif r5<-.05:reasons.append("直近反落")
    if s>=80 and trend>=3 and -.05<=r20<=.12 and r5<=.05: key,label="buy","🟢 買い候補"
    elif s>=78 and trend>=3 and (r20>.12 or r5>.05): key,label="wait","🟡 押し目待ち"
    elif s<60 or trend<=1 or r60<-.10: key,label="avoid","🔴 見送り"
    else:key,label="watch","🔵 監視"
    return {"key":key,"label":label,"reason":"・".join(reasons[:2]) or "条件確認中"}

def extract_one(hist, meta):
    if hist is None or hist.empty:return None
    h=hist.dropna(subset=["Close"]).copy()
    if len(h)<251:return None
    close=h["Close"].astype(float); c=float(close.iloc[-1])
    def ret(n):return c/float(close.iloc[-1-n])-1
    def avg(n):return float(close.tail(n).mean())
    trend=sum(c>avg(n) for n in (20,60,120,250))
    if "Volume" in h:
        value=(h["Volume"].astype(float).tail(20)*close.tail(20)).dropna()
        avg_value=float(value.mean()) if len(value) else 0.0
    else:avg_value=0.0
    return {
      "code":meta["code"],"company":meta["company"],"market":meta["market"],"sector33":meta["sector33"],
      "close":round(c,4),"ret5":ret(5),"ret20":ret(20),"ret60":ret(60),"ret120":ret(120),"ret250":ret(250),
      "trend_count":trend,"avg_value":avg_value,"is_semiconductor":meta["code"] in SEMI,"adjustment_events":0
    }

def download_all(meta):
    by={x["ticker"]:x for x in meta}; raw=[]
    tickers=list(by)
    batch_size=120
    for start in range(0,len(tickers),batch_size):
        batch=tickers[start:start+batch_size]
        print(f"download {start+1}-{min(start+len(batch),len(tickers))}/{len(tickers)}",flush=True)
        try:
            d=yf.download(batch,period="13mo",interval="1d",auto_adjust=True,actions=False,threads=True,group_by="ticker",progress=False,timeout=30)
        except Exception as e:
            print("batch error",e,flush=True);continue
        for t in batch:
            try:
                if isinstance(d.columns,pd.MultiIndex):
                    h=d[t] if t in d.columns.get_level_values(0) else None
                else:
                    h=d if len(batch)==1 else None
                item=extract_one(h,by[t])
                if item:raw.append(item)
            except Exception as e: print("ticker error",t,e,flush=True)
    if len(raw)<500: raise RuntimeError(f"only {len(raw)} stocks downloaded")
    return raw

def rank(raw):
    fields=("ret20","ret60","ret120","ret250","avg_value")
    ranks={f:pct_rank([x[f] for x in raw]) for f in fields}
    for i,x in enumerate(raw):
        sc=100*(.28*ranks["ret20"][i]+.28*ranks["ret60"][i]+.18*ranks["ret120"][i]+.12*ranks["ret250"][i]+.10*(x["trend_count"]/4)+.04*ranks["avg_value"][i])
        if x["ret20"]>.40:sc-=min(10,(x["ret20"]-.40)*20)
        if x["ret20"]<-.20:sc-=4
        x["technical_score"]=round(max(0,min(100,sc)),2)
        x["timing"]=timing(x)
    raw.sort(key=lambda x:x["technical_score"],reverse=True)
    for i,x in enumerate(raw,1):x["rank"]=i
    return raw[:100]

def main():
    meta=get_jpx_list()
    print("listed",len(meta),flush=True)
    ranked=rank(download_all(meta))
    out={"generated_at":datetime.now(timezone.utc).isoformat(),"source":"JPX listed issues + Yahoo Finance adjusted daily prices via yfinance","count":len(ranked),"top100":ranked}
    (DATA/"latest-ranking.json").write_text(json.dumps(out,ensure_ascii=False,separators=(",",":")),encoding="utf-8")
    print("generated",len(ranked),flush=True)

if __name__=="__main__":main()
