# ════════════════════════════════════════════════════════════════
# BRISK SECURITY GUIDE
# ════════════════════════════════════════════════════════════════

## Table of Contents
1. [Setup Instructions](#setup-instructions)
2. [Environment Variables](#environment-variables)
3. [Rate Limiting](#rate-limiting)
4. [Input Validation](#input-validation)
5. [API Key Management](#api-key-management)
6. [Deployment Checklist](#deployment-checklist)
7. [Security Incident Response](#security-incident-response)

---

## Setup Instructions

### Local Development

1. **Copy the environment template:**
   ```bash
   cp .env.example .env
   ```

2. **Fill in your secrets in `.env`:**
   - Get `FINNHUB_KEY` from https://finnhub.io (free tier: 60 requests/min)
   - Get `SUPABASE_URL` and `SUPABASE_ANON_KEY` from https://supabase.io

3. **NEVER commit `.env` to git:**
   ```bash
   # .env is in .gitignore — verify:
   git check-ignore .env  # Should show: .env
   ```

4. **Install dependencies:**
   ```bash
   npm install
   ```

### Production (Vercel)

1. **Set environment variables in Vercel Dashboard:**
   - Go to your project → Settings → Environment Variables
   - Add: `FINNHUB_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`

2. **Inject Supabase keys into HTML (server-side only):**
   ```html
   <!-- In a server-side template, add meta tags: -->
   <meta name="supabase-url" content="<%= process.env.SUPABASE_URL %>">
   <meta name="supabase-anon-key" content="<%= process.env.SUPABASE_ANON_KEY %>">
   ```
   
   OR use Vercel environment injection:
   ```javascript
   // This is injected by Vercel automatically
   window.SUPABASE_CONFIG = {
     url: process.env.SUPABASE_URL,
     anonKey: process.env.SUPABASE_ANON_KEY
   };
   ```

---

## Environment Variables

### Required Variables

| Variable | Description | Example | Source |
|----------|-------------|---------|--------|
| `FINNHUB_KEY` | Stock price API key | `d756h91r01qg1eo7qc4g` | https://finnhub.io |
| `SUPABASE_URL` | Supabase project URL | `https://xxx.supabase.co` | https://supabase.io |
| `SUPABASE_ANON_KEY` | Supabase anon public key | `eyJhbGc...` | https://supabase.io |
| `NODE_ENV` | Environment | `production` | Auto set by hosting |

### Optional Configuration

```env
# Rate limiting thresholds
RATE_LIMIT_WINDOW_MS=900000      # 15 minutes
RATE_LIMIT_MAX_REQUESTS=100      # per IP per window
RATE_LIMIT_KEY_PREFIX=brisk_

# Logging
LOG_LEVEL=info                     # info, warn, error
```

### Security Best Practices

- ✅ **Never** hardcode API keys in source code
- ✅ Use environment variables for all secrets
- ✅ Rotate API keys every 90 days
- ✅ Use different keys for dev/staging/production
- ✅ Use Vercel's Sensitive Environment Variables for extra protection
- ❌ **Never** log full API keys
- ❌ **Never** expose private keys in client-side code
- ❌ **Never** commit `.env` files to git

---

## Rate Limiting

### Configuration

All public API endpoints have rate limiting enabled:

**Global Rate Limits (per IP):**
- **Price API (`/api/price`)**: 100 requests per 15 minutes
- **Quote API (`/api/quote`)**: 50 requests per 15 minutes (more expensive)

### How It Works

1. **IP-based tracking**: Uses `x-forwarded-for` header (works with Vercel)
2. **Time window**: Expires automatically every 15 minutes
3. **Graceful handling**: Returns `429 Too Many Requests` with retry info
4. **Headers**: Includes `X-RateLimit-*` headers for client awareness

### Response Format (429 Error)

```json
{
  "error": "Too many requests",
  "message": "Rate limit exceeded. Please retry after 45 seconds.",
  "retryAfter": 45
}
```

Response Headers:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1700000000 (Unix timestamp)
Retry-After: 45 (seconds)
```

### For Client Apps

Implement exponential backoff:

```javascript
async function fetchWithRetry(url, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    const res = await fetch(url);
    
    if (res.status === 429) {
      const retryAfter = parseInt(res.headers.get('Retry-After')) || 60;
      console.log(`Rate limited. Retrying in ${retryAfter}s...`);
      await new Promise(r => setTimeout(r, retryAfter * 1000));
      continue;
    }
    
    return res;
  }
  throw new Error('Max retries exceeded');
}
```

---

## Input Validation

### Rules Applied

All user inputs are validated using the following rules:

#### Ticker Symbols
- **Type**: String
- **Length**: 1-5 characters
- **Pattern**: `^[A-Z0-9.]{1,5}$` (uppercase letters and dot)
- **Example**: `AAPL`, `BRK.B`, `VOO`

#### Email Addresses
- **Type**: String
- **Length**: 5-254 characters
- **Pattern**: Standard email regex
- **Validation**: Checked against `^[^\s@]+@[^\s@]+\.[^\s@]+$`

#### Passwords
- **On Sign In**: 6-128 characters
- **On Sign Up**: 8-128 characters (enforced via Supabase)
- **Validation**: Client-side check, server enforces via Supabase

#### Portfolio Fields
- **Ticker**: 1-5 uppercase letters
- **Entry Price**: Positive number, max $1,000,000
- **Amount**: Positive number (shares or units)

#### Numeric Inputs
- **Type**: Must be valid number
- **Range**: Min 0.01, Max 1,000,000 (depending on field)
- **Validation**: No NaN, Infinity, or negative values

### Sanitization

All string inputs are sanitized to prevent XSS:
- HTML entities escaped (`&`, `<`, `>`, `"`, `'`)
- Whitespace trimmed
- Unexpected fields rejected (strict validation)

### Validation Error Response

```json
{
  "error": "invalid_input",
  "message": "Invalid ticker parameter",
  "details": {
    "ticker": "Ticker must be 1-5 uppercase letters"
  }
}
```

---

## API Key Management

### Finnhub API Key

**Get your key:**
1. Sign up at https://finnhub.io
2. Free tier: 60 requests/minute
3. Copy your API key

**Rotate your key (recommended every 90 days):**
1. Log into Finnhub dashboard
2. Generate new key
3. Update `FINNHUB_KEY` in Vercel environment
4. Wait 24 hours to ensure all servers updated
5. Deactivate old key

**Monitoring:**
```bash
# Monitor rate limit usage in your logs
# Finnhub returns 429 if exceeded, fallback to Yahoo Finance
```

### Supabase Keys

**Never expose in client code:**
- ❌ Private key (used for admin operations)
- ❌ Service role key (unlimited access)
- ✅ Anon/Public key ONLY (limited to Row Level Security)

**Rotate Supabase keys:**
1. Go to Supabase Dashboard → API Settings
2. Click "Generate new key"
3. Update `SUPABASE_ANON_KEY` in Vercel
4. Old keys expire after 24 hours

**Row Level Security (RLS):**
Ensure RLS policies are enabled on all tables:
```sql
-- Example RLS policy
CREATE POLICY "Users can read own data" ON users
  FOR SELECT USING (auth.uid() = id);
```

---

## Deployment Checklist

Before deploying to production:

### Code Security
- [ ] No hardcoded API keys in source code
- [ ] All secrets in `.env` or environment variables
- [ ] `.env` file is in `.gitignore`
- [ ] Rate limiting enabled on all endpoints
- [ ] Input validation on all user inputs
- [ ] HTTPS enforced (automatic on Vercel)
- [ ] CORS headers set correctly
- [ ] Security headers added (`X-Frame-Options`, `X-Content-Type-Options`)

### Configuration
- [ ] `NODE_ENV=production` set on Vercel
- [ ] All environment variables configured in Vercel
- [ ] Finnhub API key validated
- [ ] Supabase keys (anon only, never private)
- [ ] Database RLS policies enabled
- [ ] Email SMTP configured (if using custom emails)

### Monitoring
- [ ] Error logging configured (Sentry, LogRocket, etc.)
- [ ] Rate limit metrics being tracked
- [ ] API usage quota alerts set
- [ ] Database connection limits configured
- [ ] Daily backup scheduled (Supabase)

### Testing
- [ ] Load test API endpoints
- [ ] Test rate limiting with multiple IPs
- [ ] Test input validation edge cases
- [ ] Test error handling (unavailable APIs)
- [ ] Test with invalid credentials

---

## Security Incident Response

### If You Suspect a Key Leak

**IMMEDIATE ACTION (within 15 minutes):**
1. Deactivate the compromised key in dashboard
2. Generate a new key
3. Update environment variables in Vercel
4. Force redeploy all servers
5. Monitor for suspicious API usage

**WITHIN 1 HOUR:**
- Check logs for unauthorized access
- Review recent API calls for anomalies
- Notify your team

**WITHIN 24 HOURS:**
- Write post-incident report
- Update key rotation schedule
- Implement additional monitoring

### Files to Audit

```bash
# Check git history for secrets
git log --all --grep="KEY\|SECRET\|PASSWORD" --oneline

# Scan for accidentally committed secrets
git log -p | grep -i "api.?key\|secret\|password"

# Use tools like git-secrets or truffleHog
npm install -g git-secrets
git secrets --scan
```

---

## Additional Resources

- [OWASP Top 10 Web Application Risks](https://owasp.org/www-project-top-ten/)
- [Vercel Security Best Practices](https://vercel.com/docs/security)
- [Supabase Security Documentation](https://supabase.com/docs/guides/auth)
- [Finnhub API Rate Limits](https://finnhub.io/docs/api/rate-limit)

---

## Questions?

For security questions or to report vulnerabilities:
1. Do NOT create a public GitHub issue
2. Email: [your-security-contact@email.com]
3. Use Vercel's security reporting: https://vercel.com/security

---

**Last Updated**: 2026-03-31  
**Security Level**: Enhanced  
**Maintained By**: Security Team
