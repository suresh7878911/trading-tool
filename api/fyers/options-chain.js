// Secure FYERS option-chain proxy. The access token remains in an HttpOnly cookie.
module.exports = async function handler(req,res){
 res.setHeader("Cache-Control","no-store");res.setHeader("Content-Type","application/json; charset=utf-8");
 if(req.method!=="GET"){res.setHeader("Allow","GET");return res.status(405).json({ok:false,message:"Method not allowed"});}
 const appId=process.env.FYERS_APP_ID;const raw=req.headers.cookie||"";const pair=raw.split(";").map(x=>x.trim()).find(x=>x.startsWith("fyers_access_token="));
 if(!appId||!pair)return res.status(401).json({ok:false,message:"FYERS connection required"});
 let token;try{token=decodeURIComponent(pair.slice("fyers_access_token=".length));}catch(e){return res.status(401).json({ok:false,message:"Invalid session"});}
 const allowed={nifty:"NSE:NIFTY50-INDEX",banknifty:"NSE:NIFTYBANK-INDEX"};
 const key=String(req.query.symbol||"nifty").toLowerCase();if(!allowed[key])return res.status(400).json({ok:false,message:"Unsupported underlying"});
 const count=Number.parseInt(req.query.strikecount||"10",10);if(!Number.isInteger(count)||count<1||count>50)return res.status(400).json({ok:false,message:"strikecount must be between 1 and 50"});
 const params=new URLSearchParams({symbol:allowed[key],strikecount:String(count),greeks:"1"});
 const timestamp=String(req.query.timestamp||"");if(timestamp){if(!/^\d{9,12}$/.test(timestamp))return res.status(400).json({ok:false,message:"Invalid expiry timestamp"});params.set("timestamp",timestamp);}
 try{const upstream=await fetch("https://api-t1.fyers.in/data/options-chain-v3?"+params.toString(),{headers:{Authorization:appId+":"+token,Accept:"application/json"}});const data=await upstream.json().catch(()=>({}));if((upstream.status===401||[-8,-15,-16,-17].includes(Number(data.code))))res.setHeader("Set-Cookie","fyers_access_token=; Path=/api/fyers; HttpOnly; Secure; SameSite=Lax; Max-Age=0");if(!upstream.ok||data.s!=="ok")return res.status(upstream.status||502).json({ok:false,message:"FYERS option-chain request failed",code:data.code});return res.status(200).json({ok:true,source:"FYERS",receivedAt:new Date().toISOString(),data:data.data||{}});}catch(e){return res.status(502).json({ok:false,message:"Unable to reach FYERS option-chain data"});}
};
