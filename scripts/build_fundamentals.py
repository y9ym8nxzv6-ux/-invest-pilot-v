#!/usr/bin/env python3
import json, math, time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path
import yfinance as yf

ROOT=Path(__file__).resolve().parents[1]
DATA=ROOT/"data"
RANKING=DATA/"latest-ranking.json"
OUT=DATA/"fundamentals.json"

FIELDS=("revenueGrowth","earningsGrowth","returnOnEquity","operatingMargins","trailingPE","forwardPE","marketCap")

def num(v):
    try:
        x=float(v)
        return x if math.isfinite(x) else None
    except Exception:
        return None

def metric_score(name,v):
    if v is None:return None
    if name=="revenueGrowth":
        return 85 if v>=.15 else 70 if v>=.05 else 55 if v>=0 else 40 if v>=-.05 else 20
    if name=="earningsGrowth":
        return 90 if v>=.20 else 72 if v>=.05 else 55 if v>=0 else 38 if v>=-.10 else 18
    if name=="returnOnEquity":
        return 85 if v>=.15 else 70 if v>=.08 else 52 if v>=0 else 20
    if name=="operatingMargins":
        return 85 if v>=.15 else 70 if v>=.08 else 58 if v>=.03 else 45 if v>=0 else 20
    if name=="trailingPE":
        if v<=0:return None
        return 78 if v<=15 else 68 if v<=25 else 52 if v<=40 else 35
    return None

def evaluate(info):
    vals={k:num(info.get(k)) for k in FIELDS}
    parts=[]
    for k in ("revenueGrowth","earningsGrowth","returnOnEquity","operatingMargins","trailingPE"):
        s=metric_score(k,vals.get(k))
        if s is not None:parts.append(s)
    score=round(sum(parts)/len(parts),1) if parts else None
    if score is None or len(parts)<2:
        label="データ不足"; key="unknown"
    elif score>=72:
        label="良好"; key="good"
    elif score>=52:
        label="普通"; key="neutral"
    else:
        label="注意"; key="caution"
    return {
        **vals,
        "reference_score":score,
        "reference_label":label,
        "reference_key":key,
        "metrics_available":len(parts)
    }

def fetch_one(row):
    ticker=(row.get("ticker") or (str(row["code"])+".T")).strip()
    try:
        info=yf.Ticker(ticker).get_info()
        out=evaluate(info or {})
        out.update({"code":row["code"],"company":row.get("company",""),"ticker":ticker})
        return row["code"],out
    except Exception as e:
        return row["code"],{"code":row["code"],"company":row.get("company",""),"ticker":ticker,"error":str(e),"reference_score":None,"reference_label":"取得失敗","reference_key":"unknown","metrics_available":0}

def main():
    if not RANKING.exists():
        raise SystemExit("ranking missing")
    ranking=json.loads(RANKING.read_text(encoding="utf-8"))
    rows=(ranking.get("top100") or [])[:100]
    # latest-ranking does not always preserve ticker; .T fallback is correct for normal JPX codes.
    stocks={}
    with ThreadPoolExecutor(max_workers=6) as ex:
        futures=[ex.submit(fetch_one,row) for row in rows]
        done=0
        for fut in as_completed(futures):
            code,result=fut.result()
            stocks[code]=result
            done+=1
            print(f"fundamentals {done}/{len(rows)} {code}",flush=True)
            time.sleep(0.03)
    ok=sum(1 for x in stocks.values() if x.get("metrics_available",0)>=2)
    payload={
        "generated_at":datetime.now(timezone.utc).isoformat(),
        "count":len(stocks),
        "usable_count":ok,
        "scope":"top100",
        "ranking_impact":"none",
        "method":"売上成長・利益成長・ROE・営業利益率・PERを参考評価。モメンタム総合順位には反映しない。",
        "stocks":stocks
    }
    OUT.write_text(json.dumps(payload,ensure_ascii=False,separators=(",",":")),encoding="utf-8")
    print("fundamentals generated",len(stocks),"usable",ok,flush=True)

if __name__=="__main__":main()
