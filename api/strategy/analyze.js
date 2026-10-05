export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok:false, message:"POST only" });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const strategy = String(body.strategy || "").trim();
    const mode = String(body.mode || "AI-Based").trim();
    if (!strategy) return res.status(400).json({ ok:false, message:"Strategy text is required" });

    const system = [
      "You are TradingINR Strategy AI, a research assistant for Indian equities and F&O.",
      "Never place or recommend live orders automatically. Do not claim certainty or guaranteed accuracy.",
      "Convert the user's strategy idea into a structured, testable specification.",
      "Return concise JSON with keys: market, timeframe, entry, exit, risk, confirmations, filters, backtestPlan, warnings, score.",
      "score must be an integer 0-100 representing rule completeness, not expected profit.",
      "Mention missing data, ambiguity, slippage/brokerage, and overfitting risks where relevant."
    ].join(" ");

    if (process.env.OPENAI_API_KEY) {
      const response = await fetch("https://api.openai.com/v1/responses", {
        method:"POST",
        headers:{
          "Content-Type":"application/json",
          "Authorization":"Bearer "+process.env.OPENAI_API_KEY
        },
        body:JSON.stringify({
          model: process.env.OPENAI_MODEL || "gpt-5-mini",
          input:[
            {role:"system",content:system},
            {role:"user",content:"Mode: "+mode+"\nStrategy:\n"+strategy}
          ],
          temperature:0.2
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error?.message || "AI provider error");
      const text = data.output_text || data.output?.flatMap(x=>x.content||[]).map(x=>x.text||"").join("") || "";
      let parsed;
      try { parsed = JSON.parse(text); } catch (_) { parsed = { market:"Derived from input", timeframe:"Derived from input", entry:text, exit:"Review with backtest", risk:"Define fixed risk per trade", confirmations:"Trend + momentum + volume", filters:"None specified", backtestPlan:"Use historical OHLCV with brokerage and slippage", warnings:["Review generated rules before use"], score:50 }; }
      return res.status(200).json({ok:true, source:"openai", mode, analysis:parsed});
    }

    const upper = strategy.toUpperCase();
    const find = (rx, fallback) => (strategy.match(rx)?.[1] || fallback).trim();
    const analysis = {
      market: find(/MARKET\s*:\s*(.+)/i, upper.includes("BANKNIFTY")?"BANKNIFTY":upper.includes("FINNIFTY")?"FINNIFTY":"NIFTY"),
      timeframe: find(/TIMEFRAME\s*:\s*(.+)/i, "Not explicitly specified"),
      entry: find(/ENTRY\s*:\s*(.+)/i, "Define a precise trigger and confirmation"),
      exit: find(/EXIT\s*:\s*(.+)/i, "Define stop-loss, target and invalidation"),
      risk: find(/(?:RISK|STOP-LOSS|SL)\s*:\s*(.+)/i, "Define fixed risk per trade and position sizing"),
      confirmations: "Trend + momentum + volume confirmation; add multi-timeframe confirmation where appropriate",
      filters: "Avoid ambiguous signals; define session/liquidity filters",
      backtestPlan: "Test historical OHLCV, include brokerage/slippage, out-of-sample validation and max drawdown",
      warnings: ["AI-ready fallback is active because OPENAI_API_KEY is not configured; this is rule structuring, not predictive AI"],
      score: Math.min(100, 35 + (strategy.match(/ENTRY|EXIT|SL|STOP|TARGET|RISK|TIMEFRAME|MARKET/gi)||[]).length*8)
    };
    return res.status(200).json({ok:true, source:"local-fallback", mode, analysis});
  } catch (e) {
    return res.status(500).json({ok:false, message:e.message || "Strategy analysis failed"});
  }
}