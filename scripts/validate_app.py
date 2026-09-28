#!/usr/bin/env python3
import json, re
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]

def load_json(path):
    p=ROOT/path
    if not p.exists():
        raise SystemExit(f"missing {path}")
    with p.open(encoding="utf-8") as f:
        return json.load(f)

def require(cond,msg):
    if not cond:
        raise SystemExit(msg)

index=(ROOT/"index.html").read_text(encoding="utf-8")
required_ids=[
    "homeSearch","homeSearchBtn","stockCards","researchQuery","researchBtn",
    "stockAnalysisCard","favoriteBtn","favoriteList","compareAddBtn",
    "compareList","btRun","dataHealthText","favoriteChanges"
]
for i in required_ids:
    require(re.search(rf'id=["\']{re.escape(i)}["\']',index),f"missing DOM id: {i}")

ranking=load_json(Path("data/latest-ranking.json"))
require(len(ranking.get("top100",[]))==100,"top100 must contain 100 rows")
require(len(ranking.get("candidates",[]))>=400,"candidate pool too small")

analysis=load_json(Path("data/all-analysis.json"))
require(int(analysis.get("universe_count",0))>=3000,"analysis universe too small")
stocks=analysis.get("stocks",[])
require(len(stocks)>=3000,"full analysis too small")
require(all("rank" in x and "technical_score" in x for x in stocks[:100]),"analysis rows missing rank/score")

master=load_json(Path("data/stock-master.json"))
require(int(master.get("count",0))>=3000,"stock master too small")

research=load_json(Path("data/research.json"))
require(int(research.get("count",0))>=90,"research cache too small")

history=load_json(Path("data/backtest-history.json"))
require(len(history.get("stocks",{}))>=400,"backtest history stock count too small")
require(len(history.get("dates",[]))>=250,"backtest history date count too small")

print("APP VALIDATION PASS")
print({
    "top100":len(ranking["top100"]),
    "candidates":len(ranking["candidates"]),
    "analysis":len(stocks),
    "master":master["count"],
    "research":research["count"],
    "history_stocks":len(history["stocks"]),
    "history_dates":len(history["dates"]),
})
