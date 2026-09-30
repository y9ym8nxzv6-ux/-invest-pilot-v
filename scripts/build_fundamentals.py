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

def evaluate(vals):
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

def row_values(df,names):
    if df is None or getattr(df,"empty",True):return []
    idx={str(x).strip().lower():x for x in df.index}
    key=None
    for name in names:
        if name.lower() in idx:
            key=idx[name.lower()];break
    if key is None:return []
    vals=[]
    try:
        series=df.loc[key]
        for v in series.tolist():
            x=num(v)
            if x is not None:vals.append(x)
    except Exception:
        return []
    return vals

def safe_growth(vals):
    if len(vals)<2:return None
    latest,prev=vals[0],vals[1]
    if prev==0:return None
    if latest>0 and prev>0:return latest/prev-1
    if latest<0 and prev<0:
        # 赤字縮小/拡大を通常の成長率として扱うと誤解しやすいので除外
        return None
    return None

def derive_from_statements(ticker_obj,close):
    inc=None;bal=None
    try:inc=ticker_obj.get_income_stmt(freq="yearly")
    except Exception:
        try:inc=ticker_obj.financials
        except Exception:pass
    try:bal=ticker_obj.get_balance_sheet(freq="yearly")
    except Exception:
        try:bal=ticker_obj.balance_sheet
        except Exception:pass

    revenue=row_values(inc,["Total Revenue","Operating Revenue"])
    net=row_values(inc,["Net Income","Net Income Common Stockholders"])
    op=row_values(inc,["Operating Income"])
    eps=row_values(inc,["Diluted EPS","Basic EPS"])
    equity=row_values(bal,["Stockholders Equity","Total Stockholder Equity","Common Stock Equity"])

    rev_growth=safe_growth(revenue)
    earn_growth=safe_growth(net)
    op_margin=(op[0]/revenue[0]) if op and revenue and revenue[0] else None
    roe=(net[0]/equity[0]) if net and equity and equity[0]>0 else None
    pe=(close/eps[0]) if close and eps and eps[0]>0 else None

    return {
        "revenueGrowth":num(rev_growth),
        "earningsGrowth":num(earn_growth),
        "returnOnEquity":num(roe),
        "operatingMargins":num(op_margin),
        "trailingPE":num(pe),
        "forwardPE":None,
        "marketCap":None,
        "source_mode":"annual_financial_statements"
    }

def fetch_one(row):
    ticker=(row.get("ticker") or (str(row["code"])+".T")).strip()
    close=num(row.get("close"))
    try:
        t=yf.Ticker(ticker)
        vals={}
        # 軽いinfo系が取れる環境ではそれを優先。空なら財務諸表へフォールバック。
        try:
            info=t.get_info() or {}
            vals={
                "revenueGrowth":num(info.get("revenueGrowth")),
                "earningsGrowth":num(info.get("earningsGrowth")),
                "returnOnEquity":num(info.get("returnOnEquity")),
                "operatingMargins":num(info.get("operatingMargins")),
                "trailingPE":num(info.get("trailingPE")),
                "forwardPE":num(info.get("forwardPE")),
                "marketCap":num(info.get("marketCap")),
                "source_mode":"quote_summary"
            }
        except Exception:
            vals={}
        if sum(v is not None for k,v in vals.items() if k not in ("source_mode",))<2:
            vals=derive_from_statements(t,close)
        out=evaluate(vals)
        out.update({"code":row["code"],"company":row.get("company",""),"ticker":ticker})
        return row["code"],out
    except Exception as e:
        return row["code"],{"code":row["code"],"company":row.get("company",""),"ticker":ticker,"error":str(e),"reference_score":None,"reference_label":"取得失敗","reference_key":"unknown","metrics_available":0}

def main():
    if not RANKING.exists():
        raise SystemExit("ranking missing")
    ranking=json.loads(RANKING.read_text(encoding="utf-8"))
    rows=(ranking.get("top100") or [])[:100]
    previous={}
    previous_date=None
    if OUT.exists():
        try:
            old=json.loads(OUT.read_text(encoding="utf-8"))
            previous=old.get("stocks",{})
            previous_date=old.get("generated_at")
        except (ValueError, OSError):
            pass

    now=datetime.now(timezone.utc)
    def valid_cached(x):
        if not x or int(x.get("metrics_available",0))<2:
            return False
        source_date=x.get("last_success_at") or previous_date
        if not source_date:
            return False
        try:
            dt=datetime.fromisoformat(str(source_date).replace("Z","+00:00"))
            return abs((now-dt).total_seconds())<=45*86400
        except (ValueError,TypeError):
            return False

    stocks={}
    with ThreadPoolExecutor(max_workers=4) as ex:
        futures=[ex.submit(fetch_one,row) for row in rows]
        done=0
        for fut in as_completed(futures):
            code,result=fut.result()
            if int(result.get("metrics_available",0))<2 and valid_cached(previous.get(code)):
                result={**previous[code], "source_mode":"cached_previous_success",
                        "is_cached":True,
                        "last_success_at":previous[code].get("last_success_at") or previous_date}
            elif int(result.get("metrics_available",0))>=2:
                result={**result, "is_cached":False, "last_success_at":now.isoformat()}
            stocks[code]=result
            done+=1
            print(f"fundamentals {done}/{len(rows)} {code} metrics={result.get('metrics_available',0)} cached={result.get('is_cached',False)}",flush=True)
            time.sleep(0.05)
    ok=sum(1 for x in stocks.values() if x.get("metrics_available",0)>=2)
    cached=sum(1 for x in stocks.values() if x.get("is_cached"))
    if ok<60:
        raise RuntimeError(f"fundamentals coverage below release threshold: {ok}/100. Previous file kept unchanged.")
    payload={
        "generated_at":now.isoformat(),
        "count":len(stocks),
        "usable_count":ok,
        "cached_count":cached,
        "scope":"top100",
        "ranking_impact":"none",
        "method":"取得できた財務指標（売上・利益成長率、ROE、営業利益率、PER）を参考採点。指標の対象期間は一致しないことがあります。モメンタム総合順位には反映しない。",
        "stocks":stocks
    }
    OUT.write_text(json.dumps(payload,ensure_ascii=False,separators=(",",":")),encoding="utf-8")
    print("fundamentals generated",len(stocks),"usable",ok,"cached",cached,flush=True)

if __name__=="__main__":main()
