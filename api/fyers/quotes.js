// Server-side FYERS quote proxy. Access tokens never leave the server.
module.exports = async function handler(req,res){
 res.setHeader("Cache-Control","no-store");res.setHeader("Content-Type","application/json; charset=utf-8");
 if(req.method!=="GET"){res.setHeader("Allow","GET");return res.status(405).json({ok:false,message:"Method not allowed"});}
 const appId=process.env.FYERS_APP_ID;const raw=req.headers.cookie||"";const pair=raw.split(";").map(x=>x.trim()).find(x=>x.startsWith("fyers_access_token="));
 if(!appId||!pair)return res.status(401).json({ok:false,message:"FYERS connection required"});
 let token;try{token=decodeURIComponent(pair.slice("fyers_access_token=".length));}catch(e){return res.status(401).json({ok:false,message:"Invalid session"});}
 const allowed={nifty:"NSE:NIFTY50-INDEX",banknifty:"NSE:NIFTYBANK-INDEX",finnifty:"NSE:FINNIFTY-INDEX",midcpnifty:"NSE:MIDCPNIFTY-INDEX",niftyit:"NSE:NIFTYIT-INDEX",next50:"NSE:NIFTYNXT50-INDEX",sensex:"BSE:SENSEX-INDEX",vix:"NSE:INDIAVIX-INDEX"};const requested=String(req.query.symbols||"nifty,banknifty,finnifty,midcpnifty,niftyit,next50,sensex,vix").split(",").map(x=>x.trim().toLowerCase());
 const symbols=[...new Set(requested.filter(x=>allowed[x]).map(x=>allowed[x]))];if(!symbols.length)return res.status(400).json({ok:false,message:"No supported symbols requested"});
 try{const url="https://api-t1.fyers.in/data/quotes?symbols="+encodeURIComponent(symbols.join(","));const upstream=await fetch(url,{headers:{Authorization:appId+":"+token,Accept:"application/json"}});const data=await upstream.json();if(!upstream.ok||data.s!=="ok")return res.status(upstream.status||502).json({ok:false,message:"FYERS quote request failed",code:data.code});return res.status(200).json({ok:true,source:"FYERS",receivedAt:new Date().toISOString(),data:data.d||[]});}catch(e){return res.status(502).json({ok:false,message:"Unable to reach FYERS market data"});}
};
