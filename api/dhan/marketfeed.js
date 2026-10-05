// TradingINR — DhanHQ v2 market snapshot proxy.
// Secrets stay server-side. Supports LTP/OHLC/Quote (including OI) for known
// index symbols plus custom symbols supplied through DHAN_SECURITY_MAP_JSON.
module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok:false, error:"Method not allowed" });
  }

  const clientId = process.env.DHAN_CLIENT_ID;
  const accessToken = process.env.DHAN_ACCESS_TOKEN;
  if (!clientId || !accessToken) {
    return res.status(503).json({ ok:false, connected:false, message:"Dhan credentials are not configured on the server." });
  }

  const known = {
    NIFTY: { exchangeSegment:"IDX_I", securityId:"13", label:"NIFTY 50" },
    BANKNIFTY: { exchangeSegment:"IDX_I", securityId:"25", label:"NIFTY BANK" },
    FINNIFTY: { exchangeSegment:"IDX_I", securityId:"27", label:"NIFTY FIN SERVICE" },
    MIDCPNIFTY: { exchangeSegment:"IDX_I", securityId:"442", label:"NIFTY MIDCAP SELECT" },
    VIX: { exchangeSegment:"IDX_I", securityId:"26", label:"INDIA VIX" },
    SENSEX: { exchangeSegment:"IDX_I", securityId:"1", label:"SENSEX" }
  };

  let custom = {};
  try { custom = JSON.parse(process.env.DHAN_SECURITY_MAP_JSON || "{}"); } catch (_) {}
  const map = { ...known, ...custom };

  const requested = String(req.query.symbols || "NIFTY,BANKNIFTY")
    .split(",").map(x=>x.trim().toUpperCase()).filter(Boolean).slice(0,100);
  const items = requested.map(symbol => {
    const x = map[symbol];
    return x ? { symbol, ...x } : null;
  }).filter(Boolean);

  if (!items.length) {
    return res.status(400).json({ ok:false, connected:true, message:"No mapped Dhan symbols requested.", available:Object.keys(map) });
  }

  const grouped = {};
  for (const x of items) (grouped[x.exchangeSegment] ||= []).push(Number(x.securityId));

  try {
    const upstream = await fetch("https://api.dhan.co/v2/marketfeed/quote", {
      method:"POST",
      headers:{
        Accept:"application/json",
        "Content-Type":"application/json",
        "access-token":accessToken,
        "client-id":clientId
      },
      body:JSON.stringify(grouped)
    });
    const payload = await upstream.json().catch(()=>null);
    if (!upstream.ok) {
      return res.status(upstream.status === 401 || upstream.status === 403 ? 401 : 502)
        .json({ ok:false, connected:false, message:payload?.errorMessage || "Dhan market quote request failed." });
    }

    const byKey = new Map();
    for (const [segment, rows] of Object.entries(payload?.data || {})) {
      for (const [id, value] of Object.entries(rows || {})) byKey.set(segment+":"+id, value || {});
    }

    const data = items.map(x => {
      const v = byKey.get(x.exchangeSegment+":"+x.securityId) || {};
      const lp = Number(v.last_price);
      const prev = Number(v.ohlc?.close ?? v.previous_close_price);
      const oi = Number(v.oi);
      const prevOi = Number(v.previous_oi);
      return {
        symbol:x.symbol, label:x.label, exchangeSegment:x.exchangeSegment, securityId:String(x.securityId),
        last_price:Number.isFinite(lp)?lp:null,
        change:Number.isFinite(lp)&&Number.isFinite(prev)?lp-prev:null,
        change_percent:Number.isFinite(lp)&&Number.isFinite(prev)&&prev!==0?(lp-prev)/prev*100:null,
        oi:Number.isFinite(oi)?oi:null,
        previous_oi:Number.isFinite(prevOi)?prevOi:null,
        oi_change:Number.isFinite(oi)&&Number.isFinite(prevOi)?oi-prevOi:null,
        volume:Number.isFinite(Number(v.volume))?Number(v.volume):null,
        buy_quantity:Number.isFinite(Number(v.buy_quantity))?Number(v.buy_quantity):null,
        sell_quantity:Number.isFinite(Number(v.sell_quantity))?Number(v.sell_quantity):null,
        ohlc:v.ohlc || null
      };
    });

    return res.status(200).json({ ok:true, connected:true, provider:"Dhan", data, serverTime:Date.now() });
  } catch (_) {
    return res.status(502).json({ ok:false, connected:false, message:"Could not reach Dhan market data." });
  }
};
