"""
FYERS NIFTY 50 5-minute S/R backtest starter.
Run locally only; never commit credentials or share tokens.
Install: py -m pip install fyers-apiv3 pandas
Set environment variables FYERS_CLIENT_ID and FYERS_ACCESS_TOKEN before running.
"""
import os, time
from datetime import date, datetime, timedelta
from pathlib import Path
import pandas as pd
from fyers_apiv3 import fyersModel

CLIENT_ID = os.getenv("FYERS_CLIENT_ID", "").strip()
TOKEN = os.getenv("FYERS_ACCESS_TOKEN", "").strip()
SYMBOL = "NSE:NIFTY50-INDEX"  # verify against current FYERS Symbol Master if rejected
RESOLUTION = "5"
START = date.today() - timedelta(days=365)
END = date.today()
OUT = Path("fyers_backtest_output")
OUT.mkdir(exist_ok=True)

def fetch(client, start, end):
    payload = {"symbol": SYMBOL, "resolution": RESOLUTION, "date_format": "1",
               "range_from": start.isoformat(), "range_to": end.isoformat(), "cont_flag": "1"}
    result = client.history(data=payload)
    if not isinstance(result, dict) or result.get("s") != "ok":
        raise RuntimeError(f"FYERS history error: {result}")
    rows = result.get("candles", [])
    if not rows:
        return pd.DataFrame(columns=["datetime","open","high","low","close","volume"])
    df = pd.DataFrame(rows, columns=["timestamp","open","high","low","close","volume"])
    df["datetime"] = pd.to_datetime(df.pop("timestamp"), unit="s", utc=True).dt.tz_convert("Asia/Kolkata")
    return df[["datetime","open","high","low","close","volume"]]

def load_data(client):
    chunks, start = [], START
    while start <= END:
        stop = min(start + timedelta(days=89), END)
        print(f"Downloading {start} to {stop}")
        chunks.append(fetch(client, start, stop))
        start = stop + timedelta(days=1)
        time.sleep(0.25)
    df = pd.concat(chunks, ignore_index=True).drop_duplicates("datetime").sort_values("datetime")
    if df.empty:
        raise RuntimeError("No candles returned. Check symbol, permissions, token and plan.")
    return df.reset_index(drop=True)

def indicators(df):
    d = df.copy()
    prev = d.close.shift()
    tr = pd.concat([d.high-d.low, (d.high-prev).abs(), (d.low-prev).abs()], axis=1).max(axis=1)
    d["atr"] = tr.rolling(14).mean()
    n = 7  # 3 bars left + pivot bar + 3 bars right
    d["ph"] = d.high.where(d.high.eq(d.high.rolling(n, center=True).max())).shift(3).ffill()
    d["pl"] = d.low.where(d.low.eq(d.low.rolling(n, center=True).min())).shift(3).ffill()
    return d

def backtest(df, mode, sl_atr=1.5, tp_atr=2.0):
    d = indicators(df).reset_index(drop=True)
    trades, pos = [], None
    for i in range(1, len(d)):
        r, p = d.iloc[i], d.iloc[i-1]
        if pd.isna(r.atr) or pd.isna(r.ph) or pd.isna(r.pl): continue
        if pos:
            exit_price = reason = None
            if pos["side"] == "LONG":
                if r.low <= pos["sl"]: exit_price, reason = pos["sl"], "SL"
                elif r.high >= pos["tp"]: exit_price, reason = pos["tp"], "TP"
                gross = exit_price-pos["entry"] if exit_price is not None else None
            else:
                if r.high >= pos["sl"]: exit_price, reason = pos["sl"], "SL"
                elif r.low <= pos["tp"]: exit_price, reason = pos["tp"], "TP"
                gross = pos["entry"]-exit_price if exit_price is not None else None
            if exit_price is not None:
                trades.append({"mode":mode,"side":pos["side"],"entry_time":pos["time"],"exit_time":r.datetime,
                               "entry":pos["entry"],"exit":exit_price,"reason":reason,"points":gross})
                pos = None
                continue
        if pos: continue
        if mode == "Breakout":
            long_sig = r.close > r.ph and p.close <= p.ph
            short_sig = r.close < r.pl and p.close >= p.pl
        else:
            tol = 0.2*r.atr
            long_sig = r.low <= r.pl+tol and r.close > r.pl and r.close > r.open
            short_sig = r.high >= r.ph-tol and r.close < r.ph and r.close < r.open
        if long_sig:
            e = float(r.close)
            pos = {"side":"LONG","entry":e,"time":r.datetime,"sl":e-sl_atr*r.atr,"tp":e+tp_atr*r.atr}
        elif short_sig:
            e = float(r.close)
            pos = {"side":"SHORT","entry":e,"time":r.datetime,"sl":e+sl_atr*r.atr,"tp":e-tp_atr*r.atr}
    t = pd.DataFrame(trades)
    if t.empty:
        return t, {"mode":mode,"trades":0,"win_rate_pct":0,"net_points_before_costs":0,"profit_factor":None}
    wins = t.loc[t.points>0,"points"].sum()
    losses = -t.loc[t.points<0,"points"].sum()
    summary = {"mode":mode,"trades":len(t),"win_rate_pct":round((t.points>0).mean()*100,2),
               "net_points_before_costs":round(t.points.sum(),2),
               "profit_factor":round(wins/losses,3) if losses else None}
    return t, summary

def main():
    if not CLIENT_ID or not TOKEN:
        raise SystemExit("Set FYERS_CLIENT_ID and FYERS_ACCESS_TOKEN locally first; never paste them into chat.")
    client = fyersModel.FyersModel(client_id=CLIENT_ID, token=TOKEN, is_async=False, log_path="")
    data = load_data(client)
    data.to_csv(OUT/"nifty50_5min_candles.csv", index=False)
    summaries, trades = [], []
    for mode in ("Breakout","Bounce"):
        t, s = backtest(data, mode)
        summaries.append(s)
        if not t.empty: trades.append(t)
    pd.DataFrame(summaries).to_csv(OUT/"summary.csv", index=False)
    if trades: pd.concat(trades, ignore_index=True).to_csv(OUT/"trades.csv", index=False)
    print(pd.DataFrame(summaries).to_string(index=False))
    print("Saved outputs to", OUT.resolve())
    print("Baseline research only; verify symbol/data coverage and add brokerage, taxes, slippage before evaluating.")

if __name__ == "__main__":
    main()
