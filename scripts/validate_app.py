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

fundamentals=load_json(Path("data/fundamentals.json"))
require(int(fundamentals.get("count",0))>=90,"fundamental cache too small")
require(int(fundamentals.get("usable_count",0))>=60,"too few usable fundamental rows")
require(fundamentals.get("ranking_impact")=="none","fundamentals must remain reference-only")

daily=load_json(Path("data/daily-changes.json"))
require(int(daily.get("count",0))>=2500,"daily quote count too small")
require(len(daily.get("stocks",{}))==int(daily.get("count",0)),"daily quote count mismatch")
daily_rows=list(daily["stocks"].values())
for q in daily_rows[:200]:
    close=q.get("close"); previous=q.get("previous_close")
    require(close is not None and previous is not None and previous>0,"missing quote close")
    require(abs((close-previous)-q.get("change_yen",float("inf")))<0.02,"daily yen change inconsistent")
    require(abs((close/previous-1)-q.get("change_pct",float("inf")))<0.00002,"daily percent change inconsistent")
    sessions=q.get("daily_history",[])
    require(2<=len(sessions)<=10,"daily session length must be 2 to 10")
    require(sessions[-1]["date"]==q.get("price_date"),"daily price date inconsistent")
    require(sessions[-1]["close"]==q["close"],"daily last close inconsistent")

strategy=load_json(Path("data/strategy-config.json"))
require(int(strategy.get("recommended_days",0)) in (10,20,40,60,100),"invalid recommended rebalance days")
evals=strategy.get("evaluations",[])
require(len(evals)==5,"strategy optimizer must compare five intervals")
require(all("robust_score" in x and "min_periods_per_window" in x for x in evals),"optimizer output incomplete")

print("APP VALIDATION PASS")
print({
    "top100":len(ranking["top100"]),
    "candidates":len(ranking["candidates"]),
    "analysis":len(stocks),
    "master":master["count"],
    "research":research["count"],
    "history_stocks":len(history["stocks"]),
    "history_dates":len(history["dates"]),
    "fundamentals":fundamentals["count"],
    "fundamentals_usable":fundamentals["usable_count"],
    "daily_quotes":daily["count"],
    "recommended_days":strategy["recommended_days"],
})
