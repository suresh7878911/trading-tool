// FYERS OAuth callback. Tokens are kept in an HttpOnly cookie and never returned to page JavaScript.
const crypto = require("crypto");
function cookies(req){return Object.fromEntries((req.headers.cookie||"").split(";").map(v=>v.trim()).filter(Boolean).map(v=>{const i=v.indexOf("=");return [v.slice(0,i),decodeURIComponent(v.slice(i+1))]}));}
module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
  if (req.method !== "GET") { res.setHeader("Allow", "GET"); return res.status(405).end("Method not allowed"); }
  const appId=process.env.FYERS_APP_ID, secret=process.env.FYERS_SECRET_ID, redirectUri=process.env.FYERS_REDIRECT_URI;
  const q=req.query||{}, jar=cookies(req), state=Array.isArray(q.state)?q.state[0]:q.state, code=Array.isArray(q.auth_code)?q.auth_code[0]:q.auth_code;
  const clearState="fyers_oauth_state=; Path=/api/fyers; HttpOnly; Secure; SameSite=Lax; Max-Age=0";
  if(!appId||!secret||!redirectUri){res.setHeader("Set-Cookie",clearState);return res.redirect(302,"/?fyers=setup");}
  if(!state||!jar.fyers_oauth_state||state!==jar.fyers_oauth_state||!code){res.setHeader("Set-Cookie",clearState);return res.redirect(302,"/?fyers=failed");}
  try{
    const appIdHash=crypto.createHash("sha256").update(appId+secret).digest("hex");
    const upstream=await fetch("https://api-t1.fyers.in/api/v3/validate-authcode",{method:"POST",headers:{"Content-Type":"application/json","Accept":"application/json"},body:JSON.stringify({grant_type:"authorization_code",appIdHash,code})});
    const data=await upstream.json();
    if(!upstream.ok||data.s!=="ok"||!data.access_token){
      console.error("FYERS auth validation failed",{httpStatus:upstream.status,status:data.s,code:data.code,message:data.message});
      res.setHeader("Set-Cookie",clearState);
      const code=encodeURIComponent(String(data.code??"unknown")).slice(0,80),message=encodeURIComponent(String(data.message??"FYERS validation failed")).slice(0,180);
      return res.redirect(302,"/?fyers=failed&code="+code+"&message="+message);
    }
    console.log("FYERS auth validation succeeded");
    res.setHeader("Set-Cookie",[clearState,"fyers_access_token="+encodeURIComponent(data.access_token)+"; Path=/api/fyers; HttpOnly; Secure; SameSite=Lax; Max-Age=43200"]);
    return res.redirect(302,"/?fyers=connected");
  }catch(e){res.setHeader("Set-Cookie",clearState);return res.redirect(302,"/?fyers=failed");}
};
