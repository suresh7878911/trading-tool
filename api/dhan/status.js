// Vercel serverless function: checks Dhan API connectivity without exposing profile data.
// Set DHAN_CLIENT_ID and DHAN_ACCESS_TOKEN in Vercel Project Settings > Environment Variables.
module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const clientId = process.env.DHAN_CLIENT_ID;
  const accessToken = process.env.DHAN_ACCESS_TOKEN;
  if (!clientId || !accessToken) {
    return res.status(503).json({
      ok: false,
      connected: false,
      message: "Dhan credentials are not configured on the server."
    });
  }

  try {
    const upstream = await fetch("https://api.dhan.co/v2/profile", {
      method: "GET",
      headers: {
        Accept: "application/json",
        "access-token": accessToken,
        "client-id": clientId
      }
    });

    if (!upstream.ok) {
      const authFailure = upstream.status === 401 || upstream.status === 403;
      return res.status(authFailure ? 401 : 502).json({
        ok: false,
        connected: false,
        message: authFailure
          ? "Dhan rejected the credentials. Check server settings and token validity."
          : "Dhan could not confirm the connection."
      });
    }

    // Never return Dhan's profile response or account details to the browser.
    return res.status(200).json({
      ok: true,
      connected: true,
      provider: "Dhan",
      message: "Dhan credentials accepted."
    });
  } catch (error) {
    return res.status(502).json({
      ok: false,
      connected: false,
      message: "Could not reach Dhan. Try again later."
    });
  }
};
