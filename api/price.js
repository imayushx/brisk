// api/price.js
// Vercel Serverless Function — fetches real-time stock prices for the dashboard.
// Primary: Finnhub (free, fast, 60 calls/min)
// Fallback: Yahoo Finance v8 chart API
// Cache: 5 minutes (dashboard needs fresher data than the screener)

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const { ticker } = req.query;
  if (!ticker) return res.status(400).json({ error: 'ticker parameter required' });

  // 5-minute cache for dashboard freshness
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate');

  const FINNHUB_KEY = process.env.FINNHUB_KEY || 'd756h91r01qg1eo7qc4g';
  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

  let price = null, change = null, changePercent = null, high = null, low = null, prevClose = null;

  // ── Strategy 1: Finnhub ─────────────────────────────────
  try {
    const url = `https://finnhub.io/api/v1/quote?symbol=${ticker}&token=${FINNHUB_KEY}`;
    const r = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (r.ok) {
      const d = await r.json();
      if (d && d.c && d.c > 0) {
        price = d.c;
        change = d.d;
        changePercent = d.dp;
        high = d.h;
        low = d.l;
        prevClose = d.pc;
      }
    }
  } catch (e) {
    console.error(`Finnhub error for ${ticker}:`, e.message);
  }

  // ── Strategy 2: Yahoo Finance v8 chart ──────────────────
  if (!price) {
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1d`;
      const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'application/json' } });
      if (r.ok) {
        const d = await r.json();
        const meta = d?.chart?.result?.[0]?.meta;
        if (meta) {
          price = meta.regularMarketPrice;
          prevClose = meta.previousClose;
          if (price && prevClose) {
            change = Math.round((price - prevClose) * 100) / 100;
            changePercent = Math.round(((price - prevClose) / prevClose) * 10000) / 100;
          }
        }
      }
    } catch (e) {
      console.error(`Yahoo error for ${ticker}:`, e.message);
    }
  }

  if (!price) {
    return res.status(200).json({ ticker: ticker.toUpperCase(), price: null, error: 'unavailable' });
  }

  return res.status(200).json({
    ticker: ticker.toUpperCase(),
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
