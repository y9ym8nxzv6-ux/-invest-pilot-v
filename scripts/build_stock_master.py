#!/usr/bin/env python3
import csv, io, json, re, urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
DATA=ROOT/"data"; DATA.mkdir(exist_ok=True)
SRC="https://raw.githubusercontent.com/kouji0705/kabu_code_list/main/jpx_stock_codes.csv"

def main():
    req=urllib.request.Request(SRC,headers={"User-Agent":"Mozilla/5.0 InvestPilotV7"})
    with urllib.request.urlopen(req,timeout=30) as r:
        text=r.read().decode("utf-8-sig")
    stocks=[]
    for row in csv.DictReader(io.StringIO(text)):
        code=str(row.get("コード","")).strip().upper()
        market=str(row.get("市場・商品区分","")).strip()
        if not re.fullmatch(r"[0-9A-Z]{4}",code): continue
        if "内国株式" not in market: continue
        stocks.append({
            "code":code,
            "company":str(row.get("銘柄名","")).strip(),
            "market":market,
            "sector33":str(row.get("33業種区分","")).strip()
        })
    stocks.sort(key=lambda x:x["code"])
    out={"generated_at":datetime.now(timezone.utc).isoformat(),"count":len(stocks),"stocks":stocks}
    (DATA/"stock-master.json").write_text(json.dumps(out,ensure_ascii=False,separators=(",",":")),encoding="utf-8")
    print("generated",len(stocks),"stocks")

if __name__=="__main__": main()
