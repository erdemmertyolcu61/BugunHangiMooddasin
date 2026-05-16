# 🏗️ Proposed Component Structure

## New Components to Create

```
frontend/src/components/
├── Journal/
│   ├── Defterim.jsx              (Main journal page)
│   ├── JournalEntry.jsx          (Single entry form)
│   ├── ViewingTimeline.jsx       (Vertical timeline)
│   ├── CollectionCarousel.jsx    (Horizontal scrolling)
│   └── JournalStats.jsx          (Quick metrics)
│
├── Discovery/
│   ├── MoodExplorer.jsx          (Enhanced mood selector)
│   ├── AtmosphericPreview.jsx    (Video + intro preview)
│   ├── MoodCrateDividers.jsx     (Mood tab buttons)
│   ├── FilterControls.jsx        (Sliders & toggles)
│   └── DiscoveryGrid.jsx         (Results grid)
│
├── Collections/
│   ├── DirectorCollections.jsx   (Director carousels)
│   ├── DirectorCarousel.jsx      (Single director row)
│   ├── GenreCrossovers.jsx       (2x2 blend grid)
│   └── GenreCrossoverCard.jsx    (Single crossover)
│
├── Statistics/
│   ├── ViewingHistory.jsx        (Main stats page)
│   ├── StatCards.jsx             (4-card metrics row)
│   ├── TimelineVisualization.jsx (Years/months chart)
│   ├── MoodDistribution.jsx      (Bar chart)
│   └── DirectorObsessions.jsx    (Top directors list)
│
├── Shared/
│   ├── MovieCardEnhanced.jsx     (With hover actions)
│   ├── MoodBadge.jsx             (Already exists - reuse)
│   ├── QuickActionOverlay.jsx    (Hover buttons)
│   └── CollectionTag.jsx         (Collection indicator)
│
└── Modals/
    ├── DirectorDetailModal.jsx   (Bio, filmography)
    ├── PreviewModal.jsx          (Video preview)
    └── CollectionManagerModal.jsx (Add/remove)
```

## Reusable Hooks to Create

```
frontend/src/hooks/
├── useJournalEntries.js          (Load/save entries)
├── useViewingHistory.js          (Timeline data)
├── useMovieFilters.js            (Filter logic)
├── useAnimationInView.js         (Framer Motion helper)
├── useMoodTheme.js               (Current mood colors)
├── useLocalStorage.js            (Persist data)
└── useMovieSearch.js             (API + filtering)
```

## Services to Create/Update

```
frontend/src/services/
├── journal.js                    (CRUD operations)
├── statistics.js                 (Analytics calculations)
├── recommendations.js            (AI-powered suggestions)
└── (keep existing)
  ├── music.js
  └── (API calls)
```

## Global Context/Store

```
frontend/src/context/
├── JournalContext.jsx            (Journal state)
├── DiscoveryContext.jsx          (Filters, mood)
├── UserStatsContext.jsx          (Viewing history)
└── ThemeContext.jsx              (Current mood theme)
```

## Updated App Structure

```
frontend/src/App.jsx (Updated)
├── Routes:
│   ├── / (Home - current)
│   ├── /defterim (Journal)
│   ├── /discover (Advanced discovery)
│   ├── /collections (Directors & crossovers)
│   ├── /statistics (Viewing history)
│   └── /profile (User preferences)
│
├── Layout:
│   ├── Header (enhanced with nav)
│   ├── Sidebar (quick access)
│   ├── Main Content (route-based)
│   └── Footer (optional)
│
└── Providers:
    ├── JournalProvider
    ├── DiscoveryProvider
    ├── StatsProvider
    └── ThemeProvider
```

## Database Schema (Backend - SQLite)

```python
# Already has Movie, but add:

class JournalEntry(Base):
    id: int (primary)
    user_id: int
    movie_id: int (FK to Movie)
    mood: str
    personal_review: str
    rating: float (1-5)
    watched_date: datetime
    created_at: datetime
    updated_at: datetime

class UserCollection(Base):
    id: int
    user_id: int
    name: str
    description: str
    is_public: bool
    created_at: datetime

class CollectionItem(Base):
    id: int
    collection_id: int (FK)
    movie_id: int (FK)
    added_at: datetime

class UserStats(Base):
    id: int
    user_id: int
    total_films_watched: int
    total_hours_watched: float
    favorite_mood: str
    favorite_director: str
    favorite_genre: str
    last_updated: datetime
```

## Styling Organization

```
frontend/src/styles/
├── globals.css          (Already exists - keep Tailwind)
├── variables.css        (NEW - design token vars)
├── animations.css       (NEW - Framer Motion fallbacks)
├── components.css       (NEW - shared component styles)
│
└── (No separate component CSS - use Tailwind + @apply)
```

## File Size Estimates

```
Core Components:
- Defterim.jsx              ~400 lines
- MoodExplorer.jsx          ~350 lines
- ViewingHistory.jsx        ~300 lines
- DirectorCollections.jsx   ~250 lines

Supporting:
- Various sub-components    ~100-200 lines each
- Hooks                     ~50-150 lines each
- Services                  ~100-300 lines each

Total New Code:            ~3000-4000 lines
```

## Dependencies (Already Have)

✅ React 19  
✅ Tailwind CSS v4  
✅ Framer Motion  
✅ Lucide React (icons)  
✅ Axios (API)  

**May Need to Add:**
- `react-router-dom` (if not present) - for routing
- `recharts` (if detailed charts needed) - for analytics
- `date-fns` - for date formatting
- `zustand` or `jotai` (optional) - for global state vs Context

## Configuration Updates

### tailwind.config.js
Add theme extensions:
```javascript
theme: {
  extend: {
    colors: {
      'warm-paper': '#F5F2EB',
      'aged-ink': '#2C2825',
      'vinyl-red': '#A73A3A',
      // ...
    },
    fontFamily: {
      serif: ['Playfair Display', ...],
      sans: ['Inter', ...],
    },
  }
}
```

### .env (Frontend)
Add only the API base URL (NEVER put API keys in frontend env):
```
VITE_API_BASE_URL=https://your-backend-domain.com
```
All API keys (TMDB, Claude, OMDb) must stay in the backend `.env` only.
See `.env.example` at the project root for the full list.

## Testing Strategy

```
__tests__/
├── components/
│   ├── Defterim.test.jsx
│   ├── MoodExplorer.test.jsx
│   └── ...
├── hooks/
│   ├── useJournalEntries.test.js
│   └── ...
└── services/
    ├── journal.test.js
    └── ...
```

## Performance Considerations

- ✅ Code-split routes (React.lazy)
- ✅ Image lazy loading (native)
- ✅ Memoization for heavy components
- ✅ Virtual scrolling for long lists
- ✅ Debounced filters
- ✅ LocalStorage for journal (offline-first)

## State Management Decision

**Recommended:** Context API (you're already using it)
- JournalContext for journal-specific state
- DiscoveryContext for filters
- ThemeContext for current mood

If you need more:
- Zustand (lightweight, no boilerplate)
- Redux (if you want time-travel debugging)

## Documentation

Create:
- `COMPONENT_API.md` - Component props & usage
- `HOOK_API.md` - Custom hooks reference
- `DESIGN_SYSTEM.md` - Design tokens & guidelines
- `SETUP.md` - Dev environment setup

---

**Ready to start? Begin with: Defterim.jsx → ViewingTimeline.jsx → JournalEntry.jsx**
