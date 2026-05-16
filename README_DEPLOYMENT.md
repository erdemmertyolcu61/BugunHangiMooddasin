# Film Connoisseur - Deployment Guide

## Architecture

```
[Users] --> [Frontend (Vercel/Netlify)] --> [Backend (Render/Railway)] --> [TMDB API]
                                                                      --> [Claude API]
                                                                      --> [SQLite DB]
```

- **Frontend**: Static React app (Vite build) - deployed to Vercel, Netlify, or Cloudflare Pages
- **Backend**: FastAPI Python server - deployed to Render, Railway, or Fly.io
- **Database**: SQLite file (included with backend deployment)
- All API keys stay server-side only. Frontend never touches external APIs.

---

## 1. Backend Deployment (Render Recommended)

### Environment Variables (set in hosting dashboard)
```
TMDB_API_KEY=your_real_tmdb_key
OMDB_API_KEY=your_real_omdb_key
ANTHROPIC_API_KEY=your_real_anthropic_key
CLAUDE_MODEL=claude-sonnet-4-20250514
DATABASE_PATH=movie_cache.db
ENVIRONMENT=production
ALLOWED_ORIGINS=https://your-frontend-domain.com
BETA_PASSWORD=your_beta_password
ADMIN_PASSWORD=your_admin_password
JWT_SECRET=generate_a_random_64char_string
RATE_LIMIT_GENERAL=60
RATE_LIMIT_AI=20
```

### Render Setup
1. Create a new Web Service
2. Connect your GitHub repo
3. Set Root Directory: (leave blank or project root)
4. Build Command: `pip install -r requirements.txt`
5. Start Command: `uvicorn backend.main:app --host 0.0.0.0 --port $PORT`
6. Add all environment variables above

### Railway Setup
1. Create new project from GitHub
2. Add environment variables
3. Start command: `uvicorn backend.main:app --host 0.0.0.0 --port $PORT`

### Verify Backend
```bash
curl https://your-backend-domain.com/api/health
# Should return: {"status":"ok","version":"beta-1","environment":"production",...}
```

---

## 2. Frontend Deployment (Vercel Recommended)

### Environment Variables
```
VITE_API_BASE_URL=https://your-backend-domain.com
```

### Vercel Setup
1. Import GitHub repo
2. Framework Preset: Vite
3. Root Directory: `frontend`
4. Build Command: `npm run build`
5. Output Directory: `dist`
6. Add `VITE_API_BASE_URL` environment variable

### Netlify Setup
1. Import repo, set base directory to `frontend`
2. Build command: `npm run build`
3. Publish directory: `frontend/dist`
4. Add `VITE_API_BASE_URL` in environment settings

---

## 3. Beta Access Management

### Give Friends Access
1. Set `BETA_PASSWORD` in backend environment variables
2. Share the beta password with friends privately
3. They visit the site, enter the password once, get a 24-hour token

### Rotate Beta Password
1. Change `BETA_PASSWORD` in hosting dashboard
2. Redeploy backend
3. Existing tokens remain valid until they expire (24h)
4. Share new password with friends

### Revoke All Access
1. Change `JWT_SECRET` in hosting dashboard
2. Redeploy backend
3. All existing tokens immediately become invalid

---

## 4. Admin Operations

### Expand Movie Pool (admin only)
```bash
curl -X POST https://your-backend.com/api/repository/expand-pool \
  -H "X-Admin-Password: your_admin_password"
```

### Check Expansion Status
```bash
curl https://your-backend.com/api/repository/expand-status \
  -H "X-Admin-Password: your_admin_password"
```

### View Repository Stats (public)
```bash
curl https://your-backend.com/api/repository/stats
```

---

## 5. Monitoring

### Health Check
```bash
curl https://your-backend.com/api/health
```

### Check Logs
- Render: Dashboard > Service > Logs
- Railway: Dashboard > Deployments > Logs

### Important Log Patterns
- `[Seed]` - Movie pool seeding
- `[MoodScore]` - Mood scoring progress
- `rate limit exceeded` - Rate limiting in action
- `Admin access required` - Unauthorized admin attempts

---

## 6. Cost Management

- **Claude API**: Only used for movie analysis and "Kafan mi Karisik" chat
- **TMDB API**: Free tier (rate limited at 40 req/10s)
- Analysis results are cached in SQLite - same movie won't trigger duplicate AI calls
- Rate limiting prevents abuse: 20 AI requests/min per IP
- Movie pool expansion is admin-only (won't run from user actions)
