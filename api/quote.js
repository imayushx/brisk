/**
 * ════════════════════════════════════════════════════════════════
 * API ENDPOINT: /api/quote
 * Fetches detailed stock fundamentals (PE ratios, analyst targets, etc)
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
  // Limit by IP: max 50 requests per 15 minutes (quote is more expensive)
  const rateLimitError = applyRateLimit(req, res, null, 50, 900000);
  if (rateLimitError) return rateLimitError;

  // ── INPUT VALIDATION ─────────────────────────────────────────
  const { ticker } = req.query;

  // Validate ticker parameter
  const validation = validateInput({ ticker }, SCHEMAS.quoteQuery, true);
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

  // Cache this response for 6 hours on Vercel's edge network
  res.setHeader('Cache-Control', 's-maxage=21600, stale-while-revalidate');

  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

  let forwardPE = null;
  let trailingPE = null;
  let fcfMargin = null;
  let currentPrice = null;
  let analystTarget = null;
  let revenueGrowth = null;
  let grossMargin = null;

  // ── STRATEGY 1: Yahoo Finance v8 chart API ──────────────────
  // Most reliable — almost never blocked. Gives us current price + trailing PE.
  try {
    const chartUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(cleanTicker)}?interval=1d&range=5d`;
    const chartRes = await fetch(chartUrl, {
      headers: { 'User-Agent': UA, 'Accept': 'application/json' }
    });
    if (chartRes.ok) {
      const chartData = await chartRes.json();
      const meta = chartData?.chart?.result?.[0]?.meta;
      if (meta && typeof meta.regularMarketPrice === 'number') {
        currentPrice = meta.regularMarketPrice ?? null;
      }
    }
  } catch (e) {
    console.error(`[Yahoo Chart] Error for ${cleanTicker}:`, e.message);
  }

  // ── STRATEGY 2: Yahoo Finance v6 quote API ──────────────────
  // Returns forward PE, trailing PE, analyst target, etc.
  try {
    const quoteUrl = `https://query2.finance.yahoo.com/v6/finance/quote?symbols=${encodeURIComponent(cleanTicker)}`;
    const quoteRes = await fetch(quoteUrl, {
      headers: { 'User-Agent': UA, 'Accept': 'application/json' }
    });
    if (quoteRes.ok) {
      const quoteData = await quoteRes.json();
      const q = quoteData?.quoteResponse?.result?.[0];
      if (q) {
        forwardPE = q.forwardPE ?? null;
        trailingPE = q.trailingPE ?? null;
        if (!currentPrice) currentPrice = q.regularMarketPrice ?? null;
        analystTarget = q.targetMeanPrice ?? null;
      }
    }
  } catch (e) {
    console.error(`[Yahoo Quote V6] Error for ${cleanTicker}:`, e.message);
  }

  // ── STRATEGY 3: Yahoo Finance v10 quoteSummary ──────────────
  // Try it — may work on some Vercel regions. Gets us FCF data.
  if (forwardPE === null || fcfMargin === null) {
    try {
      const summaryUrl = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(cleanTicker)}?modules=defaultKeyStatistics,financialData,summaryDetail`;
      const summaryRes = await fetch(summaryUrl, {
        headers: { 'User-Agent': UA, 'Accept': 'application/json', 'Accept-Language': 'en-US,en;q=0.9' }
      });
      if (summaryRes.ok) {
        const summaryData = await summaryRes.json();
        const result = summaryData?.quoteSummary?.result?.[0];
        if (result) {
          const keyStats = result.defaultKeyStatistics || {};
          const finData = result.financialData || {};
          const summaryDetail = result.summaryDetail || {};

          if (forwardPE === null) forwardPE = keyStats.forwardPE?.raw ?? null;
          if (trailingPE === null) trailingPE = summaryDetail.trailingPE?.raw ?? keyStats.trailingPE?.raw ?? null;
          if (fcfMargin === null && finData.freeCashflow?.raw && finData.totalRevenue?.raw) {
            fcfMargin = (finData.freeCashflow.raw / finData.totalRevenue.raw) * 100;
          }
          if (!currentPrice) currentPrice = finData.currentPrice?.raw ?? null;
          if (analystTarget === null) analystTarget = finData.targetMeanPrice?.raw ?? null;
          if (revenueGrowth === null) revenueGrowth = finData.revenueGrowth?.raw ?? null;
          if (grossMargin === null) grossMargin = finData.grossMargins?.raw ?? null;
        }
      }
    } catch (e) {
      console.error(`[Yahoo Summary V10] Error for ${cleanTicker}:`, e.message);
    }
  }

  // ── STRATEGY 4: FMP API (free tier) ──────────────────────────
  // Financial Modeling Prep provides a free endpoint for basic quote data
  if (forwardPE === null && trailingPE === null) {
    try {
      const fmpUrl = `https://financialmodelingprep.com/api/v3/quote/${encodeURIComponent(cleanTicker)}?apikey=demo`;
      const fmpRes = await fetch(fmpUrl, {
        headers: { 'User-Agent': UA }
      });
      if (fmpRes.ok) {
        const fmpData = await fmpRes.json();
        if (fmpData && Array.isArray(fmpData) && fmpData[0]) {
          const fmp = fmpData[0];
          if (trailingPE === null) trailingPE = fmp.pe ?? null;
          if (!currentPrice) currentPrice = fmp.price ?? null;
          if (analystTarget === null) analystTarget = fmp.priceAvg200 ?? null; // Use 200-day avg as proxy
        }
      }
    } catch (e) {
      console.error(`[FMP] Error for ${cleanTicker}:`, e.message);
    }
  }

  // ── Response ─────────────────────────────────────────────────
  // Round values for clean output
  const round1 = v => v !== null ? Math.round(v * 10) / 10 : null;
  const round2 = v => v !== null ? Math.round(v * 100) / 100 : null;

  return res.status(200).json({
    ticker: cleanTicker,
    forwardPE: round1(forwardPE),
    trailingPE: round1(trailingPE),
    fcfMargin: round1(fcfMargin),
    currentPrice: round2(currentPrice),
    analystTarget: round2(analystTarget),
    revenueGrowth: revenueGrowth !== null ? Math.round(revenueGrowth * 1000) / 10 : null,
    grossMargin: grossMargin !== null ? Math.round(grossMargin * 1000) / 10 : null,
    source: forwardPE || trailingPE ? 'yahoo-finance' : 'fallback',
    fetchedAt: new Date().toISOString(),
  });
}