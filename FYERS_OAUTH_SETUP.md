# FYERS OAuth setup for TradingINR

- Production redirect URI: `https://optionai.vercel.app/api/fyers/callback`
- Configure the same redirect URI in the FYERS API Dashboard app settings.
- Configure `FYERS_APP_ID`, `FYERS_SECRET_ID`, and `FYERS_REDIRECT_URI` as Production environment variables in Vercel.
- Keep app secrets and access tokens private. Never commit them to the repository or expose them in screenshots.
- After changing environment variables, create a new Production deployment so the functions receive the updated values.
