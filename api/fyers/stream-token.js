module.exports = async function handler(req,res){
  res.setHeader("Cache-Control","no-store");
  res.setHeader("Content-Type","application/json; charset=utf-8");
  if(req.method!=="GET"){res.setHeader("Allow","GET");return res.status(405).json({ok:false,message:"Method not allowed"});}
  const raw=req.headers.cookie||"";
  const pair=raw.split(";").map(x=>x.trim()).find(x=>x.startsWith("fyers_access_token="));
  if(!pair)return res.status(401).json({ok:false,message:"FYERS session required"});
  const token=decodeURIComponent(pair.slice("fyers_access_token=".length));
  const appId=String(process.env.FYERS_APP_ID||"").trim();
  if(!appId||!token)return res.status(401).json({ok:false,message:"FYERS session unavailable"});
  return res.status(200).json({ok:true,accessToken:appId+":"+token});
};
