# QUICK START: Security Setup (5 minutes)

## Step 1: Copy Environment Template
```bash
cp .env.example .env
```

## Step 2: Fill in Your API Keys

### Get Finnhub API Key (Free)
1. Go to https://finnhub.io
2. Sign up (free)
3. Copy your API key
4. Paste into `.env`:
   ```
   FINNHUB_KEY=your_key_here
   ```

### Get Supabase Keys
1. Go to https://supabase.io
2. Create new project
3. Go to Settings → API
4. Copy URL and `anon` key (NOT service_role key)
5. Paste into `.env`:
   ```
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_ANON_KEY=eyJhbGc...
   ```

## Step 3: Verify Setup
```bash
# Check that .env is ignored by git
git check-ignore .env  # Should output: .env

# Verify no hardcoded secrets in code
grep -r "FINNHUB_KEY" api/  # Should only show: process.env.FINNHUB_KEY
```

## Step 4: Test Locally
```bash
npm install
npm run dev
```

Visit http://localhost:3000 and check:
- ✅ Sign in page loads
- ✅ Dashboard works
- ✅ Stock prices load (with real API calls)

## Step 5: Deploy to Production

### On Vercel:
1. Go to your Vercel project
2. Settings → Environment Variables
3. Add the 3 variables:
   - `FINNHUB_KEY`
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
4. Redeploy
5. Check that everything works on live site

## Done! ✅

Your app is now secure:
- ✅ API keys protected
- ✅ Rate limiting enabled (100 req/15 min)
- ✅ Input validation active
- ✅ Security headers added
- ✅ Error handling hardened

## Troubleshooting

**If prices don't load:**
- Check that `FINNHUB_KEY` is set in `.env` (local) or Vercel (production)
- Finnhub free tier has 60 requests/minute limit

**If login doesn't work:**
- Check that `SUPABASE_URL` and `SUPABASE_ANON_KEY` are correct
- Ensure they are from the **anon** key, not service_role

**If rate limiting is too strict:**
- Edit limits in `api/rate-limit.js`:
  ```javascript
  applyRateLimit(req, res, null, 100, 900000); // Change 100 to higher number
  ```

## More Info

- Full guide: `SECURITY.md`
- Implementation details: `SECURITY_SUMMARY.md`
- API rate limits: `api/rate-limit.js`
- Input validation: `api/validate.js`

## Security Checklist

Before deploying:
- [ ] .env file created with all 3 keys
- [ ] .env is in .gitignore (not in git)
- [ ] No hardcoded keys in code
- [ ] Price API returns valid data
- [ ] Login works with Supabase
- [ ] Rate limiting tested (100 requests works, 101st gets 429)

Done! Your security hardening is complete. 🔒
