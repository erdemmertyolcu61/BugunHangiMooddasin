# Film Connoisseur - Beta Test Guide

## Quick Start (Local Development)

### Prerequisites
- Python 3.10+
- Node.js 18+
- API keys: TMDB, OMDB (free), Anthropic (optional)

### Setup
```bash
# 1. Clone the repo
git clone <repo-url>
cd film-elestirmen

# 2. Create .env file from template
cp .env.example .env
# Edit .env and fill in your real API keys

# 3. Install Python dependencies
pip install -r requirements.txt

# 4. Install frontend dependencies
cd frontend && npm install && cd ..

# 5. Start everything
python start.py
# Backend: http://localhost:8002
# Frontend: http://localhost:3005
```

---

## For Beta Testers

### How to Access
1. Open the website link shared with you
2. Enter the beta password on the login screen
3. Start exploring movies!

### Features to Test
- **Mood Selection**: Pick a mood on the homepage, browse recommended films
- **Film Analysis**: Click any film to see AI-generated analysis
- **Kafan mi Karisik?**: Describe your mood in text, get personalized recommendations
- **Surprise Film**: Get a random movie suggestion
- **Defterim**: Save films to your personal list, mark as watched
- **Mood Quiz**: Take the quiz to discover your current mood

### Reporting Issues
Please report:
- Broken pages or buttons
- Films with wrong mood categorization
- Slow loading times
- Mobile display issues
- Any error messages you see

---

## For the Admin

### Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `TMDB_API_KEY` | Yes | TMDB API key for movie data |
| `OMDB_API_KEY` | Yes | OMDb API key for ratings |
| `ANTHROPIC_API_KEY` | Optional | Claude AI for analysis (falls back to templates) |
| `CLAUDE_MODEL` | No | Default: claude-sonnet-4-20250514 |
| `DATABASE_PATH` | No | Default: movie_cache.db |
| `ENVIRONMENT` | No | `development` or `production` |
| `ALLOWED_ORIGINS` | No | Comma-separated frontend URLs |
| `BETA_PASSWORD` | No | Password for beta access gate |
| `ADMIN_PASSWORD` | No | Password for admin endpoints |
| `JWT_SECRET` | No | Auto-generated if not set |
| `RATE_LIMIT_GENERAL` | No | Default: 60/min |
| `RATE_LIMIT_AI` | No | Default: 20/min |

### Movie Count Check
```bash
curl http://localhost:8002/api/repository/stats
```

### Expanding Movie Pool
```bash
# Expand all moods
curl -X POST http://localhost:8002/api/repository/expand-pool \
  -H "X-Admin-Password: your_admin_password"

# Expand specific mood
curl -X POST "http://localhost:8002/api/repository/expand-pool?mood_id=kalp" \
  -H "X-Admin-Password: your_admin_password"

# Check progress
curl http://localhost:8002/api/repository/expand-status \
  -H "X-Admin-Password: your_admin_password"
```
