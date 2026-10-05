// FYERS session status. Token is never returned to the browser.
module.exports = async function handler(req,res){
  res.setHeader("Cache-Control","no-store");
  res.setHeader("Content-Type","application/json; charset=utf-8");
  if(req.method!=="GET"){res.setHeader("Allow","GET");return res.status(405).json({ok:false,connected:false,message:"Method not allowed"});}
  const configured=!!(process.env.FYERS_APP_ID&&process.env.FYERS_SECRET_ID&&process.env.FYERS_REDIRECT_URI);
  const raw=req.headers.cookie||"";
  const pair=raw.split(";").map(x=>x.trim()).find(x=>x.startsWith("fyers_access_token="));
  if(!configured)return res.status(200).json({ok:true,configured:false,connected:false,message:"FYERS credentials are not configured"});
  if(!pair)return res.status(200).json({ok:true,configured:true,connected:false,message:"FYERS not connected"});
  if(String(req.query.validate||"0")!=="1")return res.status(200).json({ok:true,configured:true,connected:true,validated:false,message:"FYERS session present"});
  try{
    const token=decodeURIComponent(pair.slice("fyers_access_token=".length));
    const upstream=await fetch("https://api-t1.fyers.in/api/v3/profile",{headers:{Authorization:process.env.FYERS_APP_ID+":"+token,Accept:"application/json"}});
    const data=await upstream.json().catch(()=>({}));
    if(upstream.ok&&data.s==="ok")return res.status(200).json({ok:true,configured:true,connected:true,validated:true,message:"FYERS session is valid",profile:data.data||null});
    const expired=upstream.status===401||[-8,-15,-16,-17].includes(Number(data.code));
    if(expired){res.setHeader("Set-Cookie","fyers_access_token=; Path=/api/fyers; HttpOnly; Secure; SameSite=Lax; Max-Age=0");}
    return res.status(200).json({ok:true,configured:true,connected:!expired,validated:true,message:expired?"FYERS session expired":"FYERS validation failed",code:data.code??null});
  }catch(e){return res.status(200).json({ok:true,configured:true,connected:true,validated:false,message:"FYERS validation temporarily unavailable"});}
};
