#!/usr/bin/env python3
"""EOD Japanese stock quotes for Invest Pilot. Separate from momentum ranking."""
import json
import math
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

import pandas as pd
import yfinance as yf

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
MASTER = DATA / "stock-master.json"
OUT = DATA / "daily-changes.json"
JST = ZoneInfo("Asia/Tokyo")


def finite(v):
    try:
        n = float(v)
        return n if math.isfinite(n) and n > 0 else None
    except (ValueError, TypeError, OverflowError):
        return None


def one(h):
    if h is None or getattr(h, "empty", True) or "Close" not in h:
        return None
    close = h["Close"].dropna()
    if len(close) < 3:
        return None
    values = []
    for day, value in close.tail(20).items():
        v = finite(value)
        if v is not None:
            values.append((pd.Timestamp(day).strftime("%Y-%m-%d"), v))
    if len(values) < 3:
        return None
    # Delisted/stale symbols must not masquerade as fresh daily prices.
    latest = date.fromisoformat(values[-1][0])
    if (datetime.now(JST).date() - latest).days > 14:
        return None
    last, previous = values[-1][1], values[-2][1]
    sessions = []
    for i in range(max(1, len(values)-10), len(values)):
        day, value = values[i]
        prior = values[i-1][1]
        sessions.append({
            "date": day,
            "close": round(value, 4),
            "change_yen": round(value - prior, 4),
            "change_pct": round(value / prior - 1, 6)
        })
    return {
        "price_date": values[-1][0],
        "close": round(last, 4),
        "previous_close": round(previous, 4),
        "change_yen": round(last - previous, 4),
        "change_pct": round(last / previous - 1, 6),
        "daily_history": sessions
    }


def batch_download(part):
    tickers = [x["ticker"] for x in part]
    try:
        data = yf.download(tickers, period="1mo", interval="1d",
                           auto_adjust=False, actions=False, threads=True,
                           group_by="ticker", progress=False, timeout=35)
    except Exception as ex:
        print("batch error", str(ex), flush=True)
        return {}
    results = {}
    for x in part:
        try:
            if isinstance(data.columns, pd.MultiIndex):
                h = data[x["ticker"]] if x["ticker"] in data.columns.get_level_values(0) else None
            else:
                h = data if len(part) == 1 else None
            quote = one(h)
            if quote:
                results[x["code"]] = quote
        except Exception as ex:
            print("symbol error", x["code"], str(ex), flush=True)
    return results


def main():
    master = json.loads(MASTER.read_text(encoding="utf-8"))
    seen = set()
    targets = []
    for x in master.get("stocks", []):
        code = str(x.get("code", "")).strip()
        if not code or code in seen:
            continue
        seen.add(code)
        targets.append({"code": code, "ticker": str(x.get("ticker") or code + ".T")})
    results = {}
    size = 100
    chunks = [targets[i:i+size] for i in range(0, len(targets), size)]
    # Two downloads in parallel prevents excessive Yahoo request bursts.
    with ThreadPoolExecutor(max_workers=2) as pool:
        for i, batch in enumerate(pool.map(batch_download, chunks), 1):
            results.update(batch)
            print(f"daily quotes {i}/{len(chunks)} available={len(results)}", flush=True)
    if len(results) < 2500:
        raise RuntimeError(f"daily quote coverage too low: {len(results)}")
    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source": "Yahoo Finance daily Close (non-adjusted); not real-time",
        "basis": "previous trading session close",
        "count": len(results),
        "stocks": results
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    sample = results.get("6857") or next(iter(results.values()))
    print("DAILY QUOTES PASS", len(results), "sample", sample["price_date"], sample["change_pct"], flush=True)


if __name__ == "__main__":
    main()
