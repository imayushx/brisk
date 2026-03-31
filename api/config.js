/**
 * ════════════════════════════════════════════════════════════════
 * Configuration Endpoint (/api/config)
 * Serves public configuration (like Supabase anon keys).
 * Keeps keys out of the static UI bundle while keeping them accessible.
 * ════════════════════════════════════════════════════════════════
 */

export default function handler(req, res) {
  // Allow all origins since this might be accessed via various subdomains
  res.setHeader('Access-Control-Allow-Origin', '*');

  // Supabase anon keys are intended to be public, but they should only
  // be served via API instead of hardcoded in static HTML.
  res.status(200).json({
    url: process.env.SUPABASE_URL || '',
    anonKey: process.env.SUPABASE_ANON_KEY || ''
  });
}
