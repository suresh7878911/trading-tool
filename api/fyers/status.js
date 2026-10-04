// Reports whether this browser has an FYERS session without exposing the token.
module.exports = async function handler(req,res){
  res.setHeader("Cache-Control","no-store");
  res.setHeader("Content-Type","application/json; charset=utf-8");
  if(req.method!=="GET"){res.setHeader("Allow","GET");return res.status(405).json({connected:false,message:"Method not allowed"});}
  const configured=!!(process.env.FYERS_APP_ID&&process.env.FYERS_SECRET_ID&&process.env.FYERS_REDIRECT_URI);
  const token=(req.headers.cookie||"").split(";").map(x=>x.trim()).find(x=>x.startsWith("fyers_access_token="));
  return res.status(200).json({ok:true,configured,connected:configured&&!!token,message:configured?(token?"FYERS session present":"FYERS not connected"):"FYERS credentials are not configured"});
};
