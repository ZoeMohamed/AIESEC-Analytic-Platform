# AIESEC Exchange Analytics

Analytics dashboard for AIESEC exchange pipelines. The app renders time-series trends for exchange statuses with filters for programme, committee, and date range.

## Overview

- Nuxt app with server API routes for analytics and committee lookups.
- Analytics data comes from the AIESEC Analytics REST API (GET with access_token query param).
- Committee suboffices are fetched via EXPA GraphQL (POST with Authorization header using a raw token, no Bearer).
- Programmes are a static list (GV/GTa/GTe).

## Data sources

- Analytics REST: `https://analytics.api.aiesec.org/v2/applications/analyze.json`
- EXPA GraphQL: `https://gis-api.aiesec.org/graphql`

## Statuses tracked

- applied
- matched
- accepted
- approved
- realized
- finished
- completed

## Filter flow

1. Load country MC list (static list).
2. Select a country MC to load its suboffices (local committees).
3. Choose programmes, date range, statuses.
4. Fetch analytics data.

## Analytics logic

- Default metric: applications (`doc_count`).
- Default direction: outgoing (`o`).
- The backend first tries a single request with `performance_v3[breakdown_by]=month` to reduce latency.
- If monthly buckets are missing, it falls back to month-by-month requests.
- `maxMonths` can trim large ranges for faster responses.

## API routes

### `GET /api/expa/programmes`
Response:
```json
{
  "programmes": [
    { "id": "7", "label": "GV", "shortName": "GV" },
    { "id": "8", "label": "GTa", "shortName": "GTa" },
    { "id": "9", "label": "GTe", "shortName": "GTe" }
  ]
}
```

### `GET /api/expa/committees`

- Without `parentId` it returns the country MC list.
- With `parentId` it returns suboffices for that country.

Examples:
```
/api/expa/committees?page=1&perPage=50
/api/expa/committees?parentId=1539&q=bandung
```

Response:
```json
{
  "items": [
    { "id": "1231", "label": "AIESEC in Semarang" }
  ],
  "paging": { "total_items": 1, "total_pages": 1, "current_page": 1 }
}
```

### `POST /api/expa/analytics`

Request body:
```json
{
  "startDate": "2025-01-01",
  "endDate": "2025-03-31",
  "programmes": [7, 8, 9],
  "officeIds": [1539],
  "direction": "o",
  "metric": "applications",
  "singleRequest": true,
  "breakdownBy": "month",
  "maxMonths": 3
}
```

Response (shape):
```json
{
  "range": { "startDate": "2025-01-01", "endDate": "2025-03-31" },
  "filters": { "programmes": [7], "officeIds": [1539], "direction": "o" },
  "months": ["2025-01", "2025-02", "2025-03"],
  "series": { "applied": [10, 12, 9], "matched": [4, 5, 3] },
  "totals": { "applied": 31, "matched": 12 },
  "inference": {
    "movingAverage": { "window": 3, "series": { "applied": [null, null, 10.33] } },
    "momChangePct": { "series": { "applied": [null, 20, -25] } },
    "conversionRatePct": { "appliedToMatched": [40, 41.67, 33.33] }
  },
  "statusSummary": {
    "applied": { "total_items": 31, "total_pages": 1, "current_page": 1, "fetched_items": 31 }
  },
  "meta": {
    "cached": false,
    "mode": "single",
    "fetchMs": 4200,
    "months": 3,
    "requestedMonths": 3,
    "effectiveRange": { "startDate": "2025-01-01", "endDate": "2025-03-31" },
    "trimmed": false
  }
}
```

## Error handling

- 400: invalid or missing date parameters.
- 401: analytics token missing/invalid.
- 502: upstream response missing expected payload.
- 504: upstream timeout.

## Requirements

- Node.js 18+
- EXPA access token for GraphQL
- Analytics access token for REST API

## Setup

```bash
npm install
```

Create a `.env` file:

```bash
NUXT_EXPA_ACCESS_TOKEN=your_graphql_token
NUXT_EXPA_ANALYTICS_ACCESS_TOKEN=your_analytics_token

# Optional overrides
NUXT_EXPA_ENDPOINT=https://gis-api.aiesec.org/graphql
NUXT_EXPA_ANALYTICS_ENDPOINT=https://analytics.api.aiesec.org/v2/applications/analyze.json
NUXT_EXPA_ANALYTICS_DEFAULT_OFFICE_ID=1539
NUXT_EXPA_AUTH_HEADER=Authorization
NUXT_EXPA_AUTH_SCHEME=
NUXT_EXPA_CONNECT_TIMEOUT_MS=30000
NUXT_EXPA_REQUEST_TIMEOUT_MS=45000
NUXT_EXPA_MAX_RETRIES=1
```

## Development

```bash
npm run dev
```

## Production build

```bash
npm run build
npm run preview
```

## Deploy on Vercel

1. Import the repo into Vercel.
2. Set build command to `npm run build`.
3. Add the environment variables above.
4. Deploy.
