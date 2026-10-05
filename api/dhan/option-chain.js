// TradingINR — DhanHQ v2 option-chain proxy.
// Dhan credentials remain server-side. Returns OI, previous OI, LTP, Greeks,
// volume and bid/ask so the UI can color OI changes by sign.
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

  const underlyings = {
    NIFTY:{ securityId:13, segment:"IDX_I" },
    BANKNIFTY:{ securityId:25, segment:"IDX_I" },
    FINNIFTY:{ securityId:27, segment:"IDX_I" },
    MIDCPNIFTY:{ securityId:442, segment:"IDX_I" }
  };
  const underlying = String(req.query.underlying || "NIFTY").toUpperCase();
  const expiry = String(req.query.expiry || "").trim();
  const u = underlyings[underlying];
  if (!u) return res.status(400).json({ ok:false, message:"Unsupported Dhan underlying.", available:Object.keys(underlyings) });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expiry)) return res.status(400).json({ ok:false, message:"expiry must be YYYY-MM-DD." });

  try {
    const upstream = await fetch("https://api.dhan.co/v2/optionchain", {
      method:"POST",
      headers:{
        Accept:"application/json",
        "Content-Type":"application/json",
        "access-token":accessToken,
        "client-id":clientId
      },
      body:JSON.stringify({ UnderlyingScrip:u.securityId, UnderlyingSeg:u.segment, Expiry:expiry })
    });
    const payload = await upstream.json().catch(()=>null);
    if (!upstream.ok) {
      return res.status(upstream.status === 401 || upstream.status === 403 ? 401 : 502)
        .json({ ok:false, connected:false, message:payload?.errorMessage || "Dhan option-chain request failed." });
    }
    return res.status(200).json({ ok:true, connected:true, provider:"Dhan", underlying, expiry, data:payload?.data || null, serverTime:Date.now() });
  } catch (_) {
    return res.status(502).json({ ok:false, connected:false, message:"Could not reach Dhan option-chain API." });
  }
};
