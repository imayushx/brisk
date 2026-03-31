/**
 * ════════════════════════════════════════════════════════════════
 * API ENDPOINT: /api/price
 * Fetches real-time stock prices for dashboard
 * Security: Rate limiting, input validation, secure key handling
 * ════════════════════════════════════════════════════════════════
 */

import { applyRateLimit } from './rate-limit.js';
import { validateInput, validateTicker, SCHEMAS } from './validate.js';

export default async function handler(req, res) {
  // ── CORS Headers ─────────────────────────────────────────────
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');

  // ── RATE LIMITING ────────────────────────────────────────────
  // Limit by IP address: max 100 requests per 15 minutes per IP
  const rateLimitError = applyRateLimit(req, res, null, 100, 900000);
  if (rateLimitError) return rateLimitError;

  // ── INPUT VALIDATION ─────────────────────────────────────────
  const { ticker } = req.query;
  
  // Validate ticker parameter
  const validation = validateInput({ ticker }, SCHEMAS.priceQuery, true);
  if (!validation.valid) {
    return res.status(400).json({
      error: 'invalid_input',
      message: 'Invalid ticker parameter',
      details: validation.errors,
    });
  }

  const cleanTicker = validation.cleaned.ticker.toUpperCase().trim();
  
  // Extra security: Ensure ticker matches safe pattern
  if (!validateTicker(cleanTicker)) {
    return res.status(400).json({
      error: 'invalid_ticker',
      message: 'Ticker must be 1-5 uppercase letters',
    });
  }

  // 5-minute cache for dashboard freshness
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate');

  // ── SECURE API KEY HANDLING ──────────────────────────────────
  // NEVER expose API keys in client-side code
  // Use environment variables on the server only
  const FINNHUB_KEY = process.env.FINNHUB_KEY;
  
  if (!FINNHUB_KEY) {
    console.error('[SECURITY] Finnhub API key not configured');
    return res.status(503).json({
      error: 'service_unavailable',
      message: 'Price service temporarily unavailable',
    });
  }

  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

  let price = null, change = null, changePercent = null, high = null, low = null, prevClose = null;

  // ── Strategy 1: Finnhub ─────────────────────────────────
  // Primary: Finnhub is reliable and works for most stocks
  try {
    const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(cleanTicker)}&token=${FINNHUB_KEY}`;
    const r = await fetch(url, { headers: { 'Accept': 'application/json' } });
    
    if (r.ok) {
      const d = await r.json();
      // Validate response structure before using
      if (d && typeof d.c === 'number' && d.c > 0) {
        price = d.c;
        change = d.d || null;
        changePercent = d.dp || null;
        high = d.h || null;
        low = d.l || null;
        prevClose = d.pc || null;
      }
    }
  } catch (e) {
    // Log error server-side (never expose to client)
    console.error(`[Finnhub] Error for ${cleanTicker}:`, e.message);
  }

  // ── Strategy 2: Yahoo Finance v8 chart ──────────────────
  // Fallback: More resilient, doesn't require API key
  if (!price) {
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(cleanTicker)}?interval=1d&range=1d`;
      const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'application/json' } });
      if (r.ok) {
        const d = await r.json();
        const meta = d?.chart?.result?.[0]?.meta;
        if (meta && typeof meta.regularMarketPrice === 'number' && meta.regularMarketPrice > 0) {
          price = meta.regularMarketPrice;
          prevClose = meta.previousClose;
          if (price && prevClose) {
            change = Math.round((price - prevClose) * 100) / 100;
            changePercent = Math.round(((price - prevClose) / prevClose) * 10000) / 100;
          }
        }
      }
    } catch (e) {
      // Log server-side only
      console.error(`[Yahoo] Error for ${cleanTicker}:`, e.message);
    }
  }

  // ── Response ─────────────────────────────────────────────────
  if (!price) {
    return res.status(200).json({
      ticker: cleanTicker,
      price: null,
      error: 'unavailable',
      message: 'Price data not available at this time',
    });
  }

  // Return sanitized response
  return res.status(200).json({
    ticker: cleanTicker,
    price: Math.round(price * 100) / 100,
    change: change ? Math.round(change * 100) / 100 : null,
    changePercent: changePercent ? Math.round(changePercent * 100) / 100 : null,
    high: high ? Math.round(high * 100) / 100 : null,
    low: low ? Math.round(low * 100) / 100 : null,
    prevClose: prevClose ? Math.round(prevClose * 100) / 100 : null,
    source: price ? 'finnhub' : 'yahoo',
    ts: new Date().toISOString(),
  });
}
