// api/quote.js
// Vercel Serverless Function — runs on the SERVER, not in the browser.
// This is why it can call Yahoo Finance without getting blocked.
// Vercel automatically makes this available at: /api/quote?ticker=AAPL
//
// HOW IT WORKS:
// 1. Your website asks: /api/quote?ticker=AAPL
// 2. This function runs on Vercel's servers
// 3. It fetches data from Yahoo Finance
// 4. It sends clean data back to your website
//
// RATE LIMITS: Yahoo Finance allows ~2000 requests/day on the free tier.
// With 50 stocks and session caching on the frontend, you'll never hit this.

export default async function handler(req, res) {
  // Allow cross-origin requests (your site calling this API)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const { ticker } = req.query;

  if (!ticker) {
    return res.status(400).json({ error: 'ticker parameter required' });
  }

  // Cache this response for 6 hours on Vercel's edge network
  // This means the same ticker won't hit Yahoo Finance more than once per 6 hours
  res.setHeader('Cache-Control', 's-maxage=21600, stale-while-revalidate');

  try {
    // Yahoo Finance v8 API — free, no key needed, works from server-side
    const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${ticker}?modules=defaultKeyStatistics,financialData,summaryDetail`;

    const response = await fetch(url, {
      headers: {
        // These headers make Yahoo Finance think we're a real browser
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
      }
    });

    if (!response.ok) {
      throw new Error(`Yahoo Finance returned ${response.status}`);
    }

    const data = await response.json();
    const result = data?.quoteSummary?.result?.[0];

    if (!result) {
      throw new Error('No data returned for ticker: ' + ticker);
    }

    const keyStats    = result.defaultKeyStatistics || {};
    const finData     = result.financialData || {};
    const summaryData = result.summaryDetail || {};

    // Pull the values we need, with safe fallbacks
    const forwardPE   = keyStats.forwardPE?.raw         ?? null;
    const trailingPE  = summaryData.trailingPE?.raw      ?? keyStats.trailingPE?.raw ?? null;
    const fcfMargin   = finData.freeCashflow?.raw && finData.totalRevenue?.raw
                        ? (finData.freeCashflow.raw / finData.totalRevenue.raw) * 100
                        : null;
    const currentPrice = finData.currentPrice?.raw       ?? null;
    const targetPrice  = finData.targetMeanPrice?.raw    ?? null;
    const revenueGrowth= finData.revenueGrowth?.raw      ?? null;
    const grossMargins = finData.grossMargins?.raw        ?? null;

    return res.status(200).json({
      ticker: ticker.toUpperCase(),
      forwardPE:    forwardPE    !== null ? Math.round(forwardPE * 10) / 10    : null,
      trailingPE:   trailingPE   !== null ? Math.round(trailingPE * 10) / 10   : null,
      fcfMargin:    fcfMargin    !== null ? Math.round(fcfMargin * 10) / 10    : null,
      currentPrice: currentPrice !== null ? Math.round(currentPrice * 100)/100 : null,
      analystTarget:targetPrice  !== null ? Math.round(targetPrice * 100)/100  : null,
      revenueGrowth:revenueGrowth !== null? Math.round(revenueGrowth * 1000)/10: null,
      grossMargin:  grossMargins !== null ? Math.round(grossMargins * 1000)/10  : null,
      source: 'yahoo-finance',
      fetchedAt: new Date().toISOString(),
    });

  } catch (error) {
    // If Yahoo Finance fails, return a graceful error — never crash the whole page
    console.error(`Quote API error for ${ticker}:`, error.message);
    return res.status(200).json({
      ticker: ticker.toUpperCase(),
      forwardPE: null,
      trailingPE: null,
      fcfMargin: null,
      currentPrice: null,
      analystTarget: null,
      revenueGrowth: null,
      grossMargin: null,
      error: 'Data temporarily unavailable',
      source: 'fallback',
      fetchedAt: new Date().toISOString(),
    });
  }
}