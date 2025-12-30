# AIESEC Exchange Analytics

Analytics dashboard for AIESEC exchange pipelines. The app pulls time-series data from EXPA GraphQL and renders status trends with filters for programme, committee, and time range.

## Specification

### Scope

- Visualize monthly time-series counts for at least 3 exchange statuses (default: Applied, Accepted, Approved, Realized).
- Provide filters for date range, programme(s), committee(s), status selection, and committee scope.
- Backend proxy to EXPA GraphQL for secure token usage and data aggregation.

### Data sources

- EXPA GraphQL endpoint: `https://gis-api.aiesec.org/graphql`
- Queries:
  - Programmes: `opportunityDurationTypes` → programme id and names.
  - Committees: `committeeAutocomplete` for text search, `committeesListBasic` for ID lookup.
  - Analytics: `allOpportunityApplication` for each status.

### Statuses supported

- applied
- accepted
- approved
- realized
- completed
- finished

### Filter behavior

- Start date / end date: required, ISO dates, used to build monthly buckets.
- Programmes: optional, multi-select by programme id.
- Committees: optional, multi-select by committee id (search requires 2+ chars).
- Committee scope:
  - `opportunity`: filters by `opportunity_home_lc` (host LC).
  - `person`: filters by `person_home_lc` (home LC).
- Status selection: controls which series render in the chart and cards.

### Time-series logic

- The backend aggregates all matched applications into monthly buckets.
- Month key format: `YYYY-MM` (UTC).
- Status date field mapping:
  - applied → `created_at` fallback `experience_start_date`
  - accepted → `date_matched` fallback `created_at`
  - approved → `date_approved`
  - realized → `date_realized`
  - completed → `experience_end_date`
  - finished → `experience_end_date`
- Optional calculations:
  - Moving average (per status, window 2–6).
  - Month-over-month percentage change.
  - Conversion rate percentages between consecutive stages.

### API contract

#### `GET /api/expa/programmes`
Response:
```json
{
  "programmes": [
    { "id": "7", "label": "GV", "shortName": "GV" }
  ]
}
```

#### `GET /api/expa/committees?q=search&page=1&perPage=50`
Response:
```json
{
  "items": [
    { "id": "1231", "label": "AIESEC in Semarang" }
  ],
  "paging": { "total_items": 1, "total_pages": 1, "current_page": 1 }
}
```

#### `POST /api/expa/analytics`
Request body:
```json
{
  "startDate": "2024-01-01",
  "endDate": "2024-12-31",
  "programmes": [7],
  "committees": [1231],
  "committeeScope": "opportunity",
  "fetchAllPages": false,
  "maxPages": 5
}
```
Response (shape):
```json
{
  "range": { "startDate": "2024-01-01", "endDate": "2024-12-31" },
  "filters": { "programmes": [7], "committees": [1231], "committeeScope": "opportunity" },
  "pagination": { "page": 1, "pagesFetched": 1, "perPage": 1000, "totalPages": 1 },
  "months": ["2024-01", "2024-02"],
  "series": { "applied": [10, 12], "accepted": [3, 4] },
  "totals": { "applied": 22, "accepted": 7 },
  "inference": {
    "movingAverage": { "window": 3, "series": { "applied": [null, 11] } },
    "momChangePct": { "series": { "applied": [null, 20] } },
    "conversionRatePct": { "appliedToAccepted": [30, 33.33] }
  },
  "statusSummary": {
    "applied": { "total_items": 22, "total_pages": 1, "current_page": 1, "fetched_items": 22 }
  }
}
```

### Error handling

- 400: invalid or missing date parameters.
- 401: EXPA auth rejected (token missing/invalid).
- 502: EXPA GraphQL returned errors.
- 504: EXPA request timed out (retryable network errors).

### Deployment

- Frontend and server API routes deploy together on Vercel.
- Configure `NUXT_EXPA_ACCESS_TOKEN` and optional overrides in Vercel env vars.

## Requirements

- Node.js 18+
- An EXPA access token

## Setup

Install dependencies:

```bash
npm install
```

Create a `.env` file (keep it private) with the required variables:

```bash
NUXT_EXPA_ACCESS_TOKEN=your_token_here

# Optional overrides
NUXT_EXPA_ENDPOINT=https://gis-api.aiesec.org/graphql
NUXT_EXPA_AUTH_HEADER=Authorization
NUXT_EXPA_AUTH_SCHEME=Bearer
NUXT_EXPA_CONNECT_TIMEOUT_MS=30000
NUXT_EXPA_REQUEST_TIMEOUT_MS=45000
NUXT_EXPA_MAX_RETRIES=1
```

## Development

Start the dev server on `http://localhost:3000`:

```bash
npm run dev
```

## Production build

```bash
npm run build
npm run preview
```

## API routes

- `GET /api/expa/programmes`
- `GET /api/expa/committees?q=search`
- `POST /api/expa/analytics`

## Deploy on Vercel

1. Import the repo into Vercel.
2. Set build command to `npm run build`.
3. Add the environment variables from the `.env` section above.
4. Deploy.
