// FYERS OAuth start. App credentials are server-only environment variables.
// A short browser-side cooldown prevents accidental repeated OAuth starts.
const crypto = require("crypto");
function hasCooldown(req) {
  return (req.headers.cookie || "").split(";").some(v => v.trim().startsWith("fyers_login_cooldown="));
}
module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") { res.setHeader("Allow", "GET"); return res.status(405).end("Method not allowed"); }
  if (hasCooldown(req)) {
    res.setHeader("Retry-After", "60");
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    return res.status(429).send("Please wait 60 seconds before starting FYERS login again.");
  }
  const appId = process.env.FYERS_APP_ID;
  const redirectUri = process.env.FYERS_REDIRECT_URI;
  if (!appId || !process.env.FYERS_SECRET_ID || !redirectUri) return res.status(503).send("FYERS setup required. Add FYERS_APP_ID, FYERS_SECRET_ID and FYERS_REDIRECT_URI in Vercel.");
  const state = crypto.randomBytes(24).toString("hex");
  res.setHeader("Set-Cookie", [
    "fyers_oauth_state="+state+"; Path=/api/fyers; HttpOnly; Secure; SameSite=Lax; Max-Age=600",
    "fyers_login_cooldown=1; Path=/api/fyers; HttpOnly; Secure; SameSite=Lax; Max-Age=60"
  ]);
  const params = new URLSearchParams({client_id:appId, redirect_uri:redirectUri, response_type:"code", state});
  return res.redirect(302, "https://api-t1.fyers.in/api/v3/generate-authcode?"+params.toString());
};
