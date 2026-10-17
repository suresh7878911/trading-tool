// Server-side FYERS historical S/R backtest. Uses the existing HttpOnly FYERS session cookie.
// Research-only endpoint: never places orders. Limits requests to 1 year and chunks them to <= 90 days.
module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  if (req.method !== "GET") { res.setHeader("Allow", "GET"); return res.status(405).json({ok:false,message:"Method not allowed"}); }
  const appId = String(process.env.FYERS_APP_ID || "").trim();
  const pair = String(req.headers.cookie || "").split(";").map(x=>x.trim()).find(x=>x.startsWith("fyers_access_token="));
  if (!appId || !pair) return res.status(401).json({ok:false,message:"Connect FYERS first from the dashboard."});
  let token;
  try { token = decodeURIComponent(pair.slice("fyers_access_token=".length)); } catch (_) { return res.status(401).json({ok:false,message:"Invalid FYERS session."}); }
  const requestedDays = Math.max(30, Math.min(365, Number(req.query.days || 365)));
  const end = new Date(); end.setUTCHours(0,0,0,0);
  const start = new Date(end.getTime() - requestedDays*86400000);
  const iso = d => d.toISOString().slice(0,10);
  const all = [];
  try {
    for (let cursor = new Date(start); cursor <= end;) {
      const chunkEnd = new Date(Math.min(cursor.getTime()+89*86400000, end.getTime()));
      const qs = new URLSearchParams({symbol:"NSE:NIFTY50-INDEX", resolution:"5", date_format:"1", range_from:iso(cursor), range_to:iso(chunkEnd), cont_flag:"1"});
      const upstream = await fetch("https://api-t1.fyers.in/data/history?"+qs.toString(), {headers:{Authorization:appId+":"+token,Accept:"application/json"}});
      const data = await upstream.json().catch(()=>({}));
      if (!upstream.ok || data.s !== "ok") return res.status(upstream.status || 502).json({ok:false,message:"FYERS history request failed for a date chunk.",code:data.code});
      all.push(...(data.candles || []));
      cursor = new Date(chunkEnd.getTime()+86400000);
    }
  } catch (_) { return res.status(502).json({ok:false,message:"Unable to reach FYERS historical data."}); }

  const candles = Array.from(new Map(all.map(c=>[c[0],c])).values()).sort((a,b)=>a[0]-b[0]);
  if (candles.length < 100) return res.status(422).json({ok:false,message:"Not enough candles returned; check FYERS plan, symbol, and history permission.",candles:candles.length});

  // Pivot S/R baseline: 3 bars on each side, level becomes available only after confirmation.
  const n = candles.length, atr = Array(n).fill(null), support = Array(n).fill(null), resistance = Array(n).fill(null);
  let sup = null, resis = null;
  for (let i=0;i<n;i++) {
    if (i>=14) {
      let sum=0;
      for (let j=i-13;j<=i;j++) {
        const prevClose = j>0 ? candles[j-1][4] : candles[j][4];
        sum += Math.max(candles[j][2]-candles[j][3],Math.abs(candles[j][2]-prevClose),Math.abs(candles[j][3]-prevClose));
      }
      atr[i]=sum/14;
    }
    if (i>=6) {
      const p=i-3, ph=candles[p][2], pl=candles[p][3];
      let isHigh=true,isLow=true;
      for(let j=p-3;j<=p+3;j++){ if(j!==p && candles[j][2]>=ph) isHigh=false; if(j!==p && candles[j][3]<=pl) isLow=false; }
      if(isHigh) resis=ph;
      if(isLow) sup=pl;
    }
    support[i]=sup; resistance[i]=resis;
  }

  function test(mode) {
    const trades=[]; let pos=null;
    for(let i=1;i<n;i++) {
      const c=candles[i], p=candles[i-1], a=atr[i];
      if(pos) {
        let exit=null,reason=null;
        if(pos.side==="LONG"){if(c[3]<=pos.sl){exit=pos.sl;reason="SL";} else if(c[2]>=pos.tp){exit=pos.tp;reason="TP";}}
        else {if(c[2]>=pos.sl){exit=pos.sl;reason="SL";} else if(c[3]<=pos.tp){exit=pos.tp;reason="TP";}}
        if(exit!==null){const points=pos.side==="LONG"?exit-pos.entry:pos.entry-exit;trades.push({side:pos.side,entryTime:pos.time,exitTime:c[0],entry:pos.entry,exit,reason,points});pos=null;continue;}
      }
      if(pos || a===null || support[i]===null || resistance[i]===null || support[i-1]===null || resistance[i-1]===null) continue;
      let buy=false,sell=false;
      if(mode==="Breakout"){buy=c[4]>resistance[i]&&p[4]<=resistance[i-1];sell=c[4]<support[i]&&p[4]>=support[i-1];}
      else {const tol=.2*a;buy=c[3]<=support[i]+tol&&c[4]>support[i]&&c[4]>c[1];sell=c[2]>=resistance[i]-tol&&c[4]<resistance[i]&&c[4]<c[1];}
      if(buy)pos={side:"LONG",entry:c[4],time:c[0],sl:c[4]-1.5*a,tp:c[4]+2*a};
      else if(sell)pos={side:"SHORT",entry:c[4],time:c[0],sl:c[4]+1.5*a,tp:c[4]-2*a};
    }
    const wins=trades.filter(t=>t.points>0).reduce((s,t)=>s+t.points,0);
    const losses=-trades.filter(t=>t.points<0).reduce((s,t)=>s+t.points,0);
    let equity=0,peak=0,maxDD=0; for(const t of trades){equity+=t.points;peak=Math.max(peak,equity);maxDD=Math.max(maxDD,peak-equity);}
    return {mode,trades:trades.length,winRatePct:trades.length?Math.round(trades.filter(t=>t.points>0).length/trades.length*10000)/100:0,netPoints:Math.round(trades.reduce((s,t)=>s+t.points,0)*100)/100,profitFactor:losses?Math.round(wins/losses*1000)/1000:null,maxDrawdownPoints:Math.round(maxDD*100)/100,tradeList:trades};
  }
  return res.status(200).json({ok:true,source:"FYERS",symbol:"NSE:NIFTY50-INDEX",resolution:"5",from:iso(start),to:iso(end),candles:candles.length,warning:"Baseline pivot S/R research only; excludes brokerage, taxes and realistic slippage; not a profit guarantee.",results:[test("Breakout"),test("Bounce")]});
};
