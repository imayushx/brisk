// api/config.js
export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const url     = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return res.status(503).json({ error: 'not_configured' });
  }
  res.status(200).json({ url, anonKey });
}
