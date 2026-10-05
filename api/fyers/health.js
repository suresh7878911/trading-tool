// Safe FYERS diagnostics endpoint. Never returns credentials or access tokens.
module.exports = async function handler(req,res){
  res.setHeader("Cache-Control","no-store");
  res.setHeader("Content-Type","application/json; charset=utf-8");
  if(req.method!=="GET"){res.setHeader("Allow","GET");return res.status(405).json({ok:false,message:"Method not allowed"});}
  const configured=!!(process.env.FYERS_APP_ID&&process.env.FYERS_SECRET_ID&&process.env.FYERS_REDIRECT_URI);
  const raw=req.headers.cookie||"";
  const hasToken=raw.split(";").map(x=>x.trim()).some(x=>x.startsWith("fyers_access_token="));
  const cooldown=raw.split(";").map(x=>x.trim()).some(x=>x.startsWith("fyers_login_cooldown="));
  return res.status(200).json({
    ok:true,
    configured,
    sessionPresent:hasToken,
    loginCooldown:cooldown,
    redirectConfigured:!!process.env.FYERS_REDIRECT_URI
  });
};