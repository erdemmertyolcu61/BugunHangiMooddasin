# Security Checklist - Pre-Deployment

## API Key Protection
- [ ] No API keys in frontend source code (search for `sk-`, `api_key`, hardcoded hex strings)
- [ ] No API keys in `.env.example` (only placeholder values)
- [ ] `.env` is in `.gitignore` and NOT committed
- [ ] No `VITE_TMDB_API_KEY` or `VITE_CLAUDE_API_KEY` in frontend env
- [ ] Frontend only calls our backend `/api/*` routes, never external APIs directly
- [ ] All secrets loaded via `os.getenv()` in `backend/config.py`

## Git History
- [ ] Run `git log --all -p | grep -i "sk-ant"` to check for leaked keys in history
- [ ] If keys were ever committed, rotate them immediately
- [ ] Consider `git filter-branch` or BFG Repo-Cleaner if keys are in history

## Backend Security
- [ ] CORS restricted to specific frontend domain(s) via `ALLOWED_ORIGINS`
- [ ] `allow_origins=["*"]` is NOT used in production
- [ ] Admin endpoints require `verify_admin` dependency
- [ ] AI endpoints have `rate_limit_ai` dependency
- [ ] Beta auth enabled via `BETA_PASSWORD` env var
- [ ] `ENVIRONMENT=production` set on hosting platform
- [ ] Debug mode disabled, stack traces hidden from users
- [ ] Health endpoint does NOT expose secret values

## Frontend Security
- [ ] No `console.log` exposing internals in production build
- [ ] API base URL set via `VITE_API_BASE_URL` (not hardcoded)
- [ ] Beta gate active when backend has `beta_enabled: true`
- [ ] No sensitive data stored in localStorage (only beta token)

## Deployment
- [ ] HTTPS enabled on both frontend and backend
- [ ] Environment variables set in hosting dashboard (not in code)
- [ ] Database file backed up before deployment
- [ ] Rate limits configured appropriately
- [ ] CORS `ALLOWED_ORIGINS` includes only the production frontend URL

## Post-Deployment
- [ ] Test beta login flow
- [ ] Test admin endpoint protection (should return 403 without auth)
- [ ] Test rate limiting (rapid requests should get 429)
- [ ] Verify no API keys visible in browser DevTools Network tab
- [ ] Verify no secrets in browser DevTools Sources tab
