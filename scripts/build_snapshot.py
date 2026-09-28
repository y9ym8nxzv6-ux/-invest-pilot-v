#!/usr/bin/env python3
import csv, io, json, math, re, urllib.request, urllib.parse
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd
import yfinance as yf

ROOT=Path(__file__).resolve().parents[1]
DATA=ROOT/"data"; DATA.mkdir(exist_ok=True)
TICKER_CSV="https://raw.githubusercontent.com/kouji0705/kabu_code_list/main/jpx_stock_codes.csv"

SEMI=set("""
285A 6526 6723 6963 6146 6227 6235 6298 6315 6323 6337 6387 6855 6857 6871 6875 7725 7729 7735 8035
2760 3132 3436 3445 4004 4062 4063 4186 4369 6055 6266 6525 6590 6668 6728 6730 6920 6941 8155
""".split())

def get_jpx_list():
    req=urllib.request.Request(TICKER_CSV,headers={"User-Agent":"Mozilla/5.0 InvestPilotV7"})
    with urllib.request.urlopen(req,timeout=40) as r:
        text=r.read().decode("utf-8-sig")
    rows=[]
    for r in csv.DictReader(io.StringIO(text)):
        cd=str(r.get("コード","")).strip().upper()
        market=str(r.get("市場・商品区分","")).strip()
        if not re.fullmatch(r"[0-9A-Z]{4}",cd): continue
        if "内国株式" not in market: continue
        rows.append({
            "code":cd,
            "ticker":str(r.get("Ticker","") or (cd+".T")).strip(),
            "company":str(r.get("銘柄名","")).strip(),
            "market":market,
            "sector33":str(r.get("33業種区分","")).strip()
        })
    if len(rows)<3000: raise RuntimeError(f"ticker master too small: {len(rows)}")
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
    return raw


def _feature_at(close, i):
    c=float(close.iloc[i])
    if i<60 or c<=0:return None
    def r(n):
        base=float(close.iloc[i-n])
        return c/base-1 if base>0 else 0.0
    ma20=float(close.iloc[i-19:i+1].mean())
    ma60=float(close.iloc[i-59:i+1].mean())
    return (r(5),r(20),r(60),c/ma20-1 if ma20>0 else 0.0,c/ma60-1 if ma60>0 else 0.0)

def forecast_20d(hist):
    if hist is None or hist.empty:return None
    h=hist.dropna(subset=["Close"]).copy()
    close=h["Close"].astype(float).reset_index(drop=True)
    if len(close)<340:return None
    cur=_feature_at(close,len(close)-1)
    if cur is None:return None

    # 距離を各指標の通常変動幅で標準化。過去類似局面同士の重複を減らすため5日刻みで探索。
    scales=(0.05,0.10,0.18,0.06,0.10)
    analogs=[]
    last_hist_idx=len(close)-22
    for i in range(250,last_hist_idx+1,5):
        feat=_feature_at(close,i)
        if feat is None:continue
        dist=math.sqrt(sum(((feat[j]-cur[j])/scales[j])**2 for j in range(len(scales))))
        base=float(close.iloc[i]);future=float(close.iloc[i+20])
        if base<=0 or future<=0:continue
        analogs.append((dist,future/base-1))
    if len(analogs)<12:return None
    analogs.sort(key=lambda x:x[0])
    chosen=analogs[:min(30,len(analogs))]
    vals=sorted(v for _,v in chosen)
    n=len(vals)
    def quantile(q):
        if n==1:return vals[0]
        p=(n-1)*q; lo=int(math.floor(p)); hi=int(math.ceil(p))
        if lo==hi:return vals[lo]
        return vals[lo]*(hi-p)+vals[hi]*(p-lo)
    up=sum(v>0 for v in vals)/n
    median=quantile(.50)
    q25=quantile(.25); q75=quantile(.75)
    spread=q75-q25
    confidence="高め" if n>=25 and spread<=0.18 else ("標準" if n>=18 and spread<=0.30 else "低め")
    return {
        "days":20,
        "range_low":round(q25,6),
        "range_high":round(q75,6),
        "median":round(median,6),
        "up_rate":round(up,4),
        "samples":n,
        "confidence":confidence,
        "method":"同一銘柄の過去5年から現在と似た値動きの局面を抽出し、その20営業日後を集計"
    }

def enrich_forecasts(ranked, meta):
    meta_by={x["code"]:x for x in meta}
    by={x["code"]:x for x in ranked}
    codes=[x["code"] for x in ranked if x["code"] in meta_by]
    batch_size=80
    history_points={}
    optimizer_points={}
    for start in range(0,len(codes),batch_size):
        part=codes[start:start+batch_size]
        tickers=[meta_by[cd]["ticker"] for cd in part]
        print(f"forecast/history {start+1}-{min(start+len(part),len(codes))}/{len(codes)}",flush=True)
        try:
            d=yf.download(tickers,period="5y",interval="1d",auto_adjust=True,actions=False,threads=True,group_by="ticker",progress=False,timeout=40)
        except Exception as e:
            print("forecast batch error",e,flush=True);continue
        for cd,t in zip(part,tickers):
            try:
                if isinstance(d.columns,pd.MultiIndex):
                    h=d[t] if t in d.columns.get_level_values(0) else None
                else:
                    h=d if len(tickers)==1 else None
                if h is None or h.empty:continue
                fc=forecast_20d(h)
                if fc:by[cd]["forecast20"]=fc

                full_h=h.dropna(subset=["Close"]).tail(1260)
                full_pts=[]
                for idx,row in full_h.iterrows():
                    try:
                        dt=pd.Timestamp(idx)
                        di=dt.year*10000+dt.month*100+dt.day
                        cl=float(row["Close"])
                        if math.isfinite(cl) and cl>0:
                            full_pts.append((di,round(cl,4)))
                    except Exception:
                        pass
                if len(full_pts)>=500:
                    optimizer_points[cd]=full_pts
                pts=full_pts[-560:]
                if len(pts)>=260:
                    history_points[cd]=pts
            except Exception as e:
                print("forecast/history error",cd,e,flush=True)

    dates=sorted({dt for pts in history_points.values() for dt,_ in pts})
    date_index={d:i for i,d in enumerate(dates)}
    stocks={}
    for cd,pts in history_points.items():
        x=by.get(cd,{})
        closes=[None]*len(dates)
        for dt,cl in pts:
            closes[date_index[dt]]=cl
        stocks[cd]={
            "company":x.get("company",cd),
            "market":x.get("market",""),
            "sector33":x.get("sector33",""),
            "closes":closes
        }
    hist_out={
        "generated_at":datetime.now(timezone.utc).isoformat(),
        "dates":dates,
        "stocks":stocks
    }
    (DATA/"backtest-history.json").write_text(json.dumps(hist_out,ensure_ascii=False,separators=(",",":")),encoding="utf-8")
    print("history generated",len(stocks),"stocks x",len(dates),"dates",flush=True)

    opt_dates=sorted({dt for pts in optimizer_points.values() for dt,_ in pts})
    opt_index={d:i for i,d in enumerate(opt_dates)}
    opt_stocks={}
    for cd,pts in optimizer_points.items():
        x=by.get(cd,{})
        closes=[None]*len(opt_dates)
        for dt,cl in pts:
            closes[opt_index[dt]]=cl
        opt_stocks[cd]={
            "company":x.get("company",cd),
            "market":x.get("market",""),
            "sector33":x.get("sector33",""),
            "closes":closes
        }
    opt_out={
        "generated_at":datetime.now(timezone.utc).isoformat(),
        "dates":opt_dates,
        "stocks":opt_stocks
    }
    Path("/tmp/invest-pilot-optimizer-history.json").write_text(json.dumps(opt_out,ensure_ascii=False,separators=(",",":")),encoding="utf-8")
    print("optimizer history generated",len(opt_stocks),"stocks x",len(opt_dates),"dates",flush=True)
    return ranked

def main():
    meta=get_jpx_list()
    print("listed",len(meta),flush=True)
    downloaded=download_all(meta)
    universe_count=len(downloaded)
    all_ranked=rank(downloaded)
    candidates=all_ranked[:500]
    candidates=enrich_forecasts(candidates,meta)
    top100=candidates[:100]

    now=datetime.now(timezone.utc).isoformat()
    out={
        "generated_at":now,
        "source":"JPX ticker mirror + Yahoo Finance adjusted daily prices via yfinance",
        "universe_count":universe_count,
        "count":len(top100),
        "top100":top100,
        "candidates":candidates
    }
    (DATA/"latest-ranking.json").write_text(json.dumps(out,ensure_ascii=False,separators=(",",":")),encoding="utf-8")

    compact=[]
    keep=("code","company","market","sector33","close","ret5","ret20","ret60","ret120","ret250","trend_count","avg_value","is_semiconductor","technical_score","rank")
    for x in all_ranked:
        row={k:x.get(k) for k in keep}
        if x.get("forecast20") is not None:
            row["forecast20"]=x.get("forecast20")
        compact.append(row)
    analysis={
        "generated_at":now,
        "universe_count":universe_count,
        "method":"20/60/120/250日騰落・移動平均トレンド・売買代金を共通式で相対採点",
        "stocks":compact
    }
    (DATA/"all-analysis.json").write_text(json.dumps(analysis,ensure_ascii=False,separators=(",",":")),encoding="utf-8")

    print("generated",len(top100),"top100 /",len(candidates),"forecast candidates /",len(all_ranked),"ranked",flush=True)

if __name__=="__main__":main()
