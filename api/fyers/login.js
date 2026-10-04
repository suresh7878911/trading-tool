// FYERS OAuth start. App credentials are server-only environment variables.
const crypto = require("crypto");
module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") { res.setHeader("Allow", "GET"); return res.status(405).end("Method not allowed"); }
  const appId = process.env.FYERS_APP_ID;
  const redirectUri = process.env.FYERS_REDIRECT_URI;
  if (!appId || !process.env.FYERS_SECRET_ID || !redirectUri) return res.status(503).send("FYERS setup required. Add FYERS_APP_ID, FYERS_SECRET_ID and FYERS_REDIRECT_URI in Vercel.");
  const state = crypto.randomBytes(24).toString("hex");
  res.setHeader("Set-Cookie", "fyers_oauth_state="+state+"; Path=/api/fyers; HttpOnly; Secure; SameSite=Lax; Max-Age=600");
  const params = new URLSearchParams({client_id:appId, redirect_uri:redirectUri, response_type:"code", state});
  return res.redirect(302, "https://api-t1.fyers.in/api/v3/generate-authcode?"+params.toString());
};
