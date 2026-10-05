// Server-side FYERS historical candle proxy. Access tokens never leave the server.
module.exports = async function handler(req,res){
 res.setHeader("Cache-Control","no-store");
 res.setHeader("Content-Type","application/json; charset=utf-8");
 if(req.method!=="GET"){res.setHeader("Allow","GET");return res.status(405).json({ok:false,message:"Method not allowed"});}
 const appId=String(process.env.FYERS_APP_ID||"").trim();
 const raw=req.headers.cookie||"";
 const pair=raw.split(";").map(x=>x.trim()).find(x=>x.startsWith("fyers_access_token="));
 if(!appId||!pair)return res.status(401).json({ok:false,message:"FYERS connection required"});
 let token;try{token=decodeURIComponent(pair.slice("fyers_access_token=".length));}catch(e){return res.status(401).json({ok:false,message:"Invalid session"});}
 const symbols={nifty:"NSE:NIFTY50-INDEX",banknifty:"NSE:NIFTYBANK-INDEX",sensex:"BSE:SENSEX-INDEX",vix:"NSE:INDIAVIX-INDEX",finnifty:"NSE:FINNIFTY-INDEX",midcpnifty:"NSE:MIDCPNIFTY-INDEX",niftyit:"NSE:NIFTYIT-INDEX",next50:"NSE:NIFTYNXT50-INDEX"};
 const symbol=symbols[String(req.query.symbol||"nifty").toLowerCase()];
 if(!symbol)return res.status(400).json({ok:false,message:"Unsupported chart symbol"});
 const allowedRes={ "1":"1","5":"5","15":"15","1h":"60","4h":"240","1D":"D","1W":"W" };
 const resolution=allowedRes[String(req.query.resolution||"15")]||"15";
 const to=new Date(); const days=resolution==="W"?730:resolution==="D"?365:resolution==="240"?90:resolution==="60"?30:7;
 const from=new Date(to.getTime()-days*86400000);
 const iso=d=>d.toISOString().slice(0,10);
 const qs=new URLSearchParams({symbol,resolution,date_format:"1",range_from:iso(from),range_to:iso(to),cont_flag:"1"});
 try{
  const upstream=await fetch("https://api-t1.fyers.in/data/history?"+qs.toString(),{headers:{Authorization:appId+":"+token,Accept:"application/json"}});
  const data=await upstream.json().catch(()=>({}));
  if((upstream.status===401||[-8,-15,-16,-17].includes(Number(data.code))))res.setHeader("Set-Cookie","fyers_access_token=; Path=/api/fyers; HttpOnly; Secure; SameSite=Lax; Max-Age=0");
  if(!upstream.ok||data.s!=="ok")return res.status(upstream.status||502).json({ok:false,message:"FYERS history request failed",code:data.code});
  return res.status(200).json({ok:true,source:"FYERS",symbol,resolution,receivedAt:new Date().toISOString(),candles:data.candles||[]});
 }catch(e){return res.status(502).json({ok:false,message:"Unable to reach FYERS historical data"});}
};