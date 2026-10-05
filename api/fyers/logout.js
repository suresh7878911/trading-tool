// FYERS logout: invalidate the upstream session when possible, then clear the local HttpOnly cookie.
module.exports = async function handler(req,res){
  res.setHeader("Cache-Control","no-store");
  if(req.method!=="POST"){res.setHeader("Allow","POST");return res.status(405).json({ok:false,message:"Method not allowed"});}
  const appId=process.env.FYERS_APP_ID;
  const raw=req.headers.cookie||"";
  const pair=raw.split(";").map(x=>x.trim()).find(x=>x.startsWith("fyers_access_token="));
  let upstreamOk=false;
  if(appId&&pair){
    try{
      const token=decodeURIComponent(pair.slice("fyers_access_token=".length));
      const upstream=await fetch("https://api-t1.fyers.in/api/v3/logout",{method:"POST",headers:{Authorization:appId+":"+token,Accept:"application/json"}});
      upstreamOk=upstream.ok;
    }catch(e){}
  }
  res.setHeader("Set-Cookie","fyers_access_token=; Path=/api/fyers; HttpOnly; Secure; SameSite=Lax; Max-Age=0");
  return res.status(200).json({ok:true,upstreamOk,message:"FYERS session cleared"});
};
