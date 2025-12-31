import { createError, defineEventHandler, readBody } from 'h3'
import { expaFetch } from '../../utils/expaFetch'

type StatusKey =
  | 'applied'
  | 'matched'
  | 'accepted'
  | 'approved'
  | 'realized'
  | 'completed'
  | 'finished'

const STATUSES: StatusKey[] = [
  'applied',
  'matched',
  'accepted',
  'approved',
  'realized',
  'completed',
  'finished',
]

const STATUS_STAGE: Record<StatusKey, string> = {
  applied: 'applied',
  matched: 'matched',
  accepted: 'an_accepted',
  approved: 'approved',
  realized: 'realized',
  completed: 'completed',
  finished: 'finished',
}

type MetricKey = 'applications' | 'applicants'

const PROGRAMME_ID_MAP = new Map<number, number>([
  [1, 7],
  [2, 8],
  [5, 9],
  [7, 7],
  [8, 8],
  [9, 9],
])

const DEFAULT_PROGRAMMES = [7]
const SNAPSHOT_CACHE_TTL_MS = 10 * 60 * 1000
const RESULT_CACHE_TTL_MS = 10 * 60 * 1000

const snapshotCache = new Map<
  string,
  { data: Record<string, unknown>; fetchedAt: number }
>()
const resultCache = new Map<
  string,
  { data: Record<string, unknown>; fetchedAt: number }
>()
const inflightResults = new Map<string, Promise<Record<string, unknown>>>()

function normalizeIdArray(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null
  const numbers = value
    .map((entry) => Number(entry))
    .filter((entry) => Number.isInteger(entry) && entry > 0)
  return numbers.length ? numbers : null
}

function toPositiveInt(value: unknown, fallback = 0) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

function resolveOfficeIds(body: Record<string, unknown>): number[] {
  const singleId = toPositiveInt(body.officeId ?? body.office_id)
  if (singleId) return [singleId]
  const fromArray = normalizeIdArray(body.officeIds ?? body.office_ids)
  if (fromArray?.length) return fromArray
  const fromCommittees = normalizeIdArray(body.committees)
  return fromCommittees ?? []
}

function normalizeProgrammes(value: unknown): number[] {
  const raw = normalizeIdArray(value) ?? []
  const mapped = raw
    .map((entry) => PROGRAMME_ID_MAP.get(entry))
    .filter((entry): entry is number => Number.isInteger(entry))
  const unique = Array.from(new Set(mapped))
  return unique.length ? unique : DEFAULT_PROGRAMMES
}

function normalizeMetric(value: unknown): MetricKey {
  if (typeof value !== 'string') return 'applications'
  const lower = value.toLowerCase()
  if (lower === 'applicants' || lower === 'people' || lower === 'unique') {
    return 'applicants'
  }
  return 'applications'
}

function normalizeMonthKey(value: string): string | null {
  const trimmed = value.trim()
  if (/^\d{4}-\d{2}$/.test(trimmed)) {
    return trimmed
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    return trimmed.slice(0, 7)
  }
  return null
}

function extractMonthlyBuckets(analytics: Record<string, unknown>) {
  const containers: Record<string, unknown>[] = [analytics]
  const nestedKeys = [
    'by_month',
    'response_by_month',
    'breakdown',
    'series',
    'data',
  ]
  nestedKeys.forEach((key) => {
    const value = analytics[key]
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      containers.push(value as Record<string, unknown>)
    }
  })

  for (const container of containers) {
    const buckets = Object.entries(container)
      .map(([key, value]) => {
        const monthKey = normalizeMonthKey(key)
        if (!monthKey || !value || typeof value !== 'object') return null
        return { key: monthKey, snapshot: value as Record<string, unknown> }
      })
      .filter(
        (entry): entry is { key: string; snapshot: Record<string, unknown> } =>
          Boolean(entry)
      )
      .sort((a, b) => a.key.localeCompare(b.key))

    if (buckets.length) {
      return buckets
    }
  }

  return []
}

function parseIsoDate(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw createError({ statusCode: 400, statusMessage: `${label} is required` })
  }
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    throw createError({
      statusCode: 400,
      statusMessage: `${label} must be a valid ISO date`,
    })
  }
  return value
}

function formatMonth(date: Date): string {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  return `${year}-${month}`
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function buildMonthRanges(startIso: string, endIso: string) {
  const start = new Date(startIso)
  const end = new Date(endIso)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw createError({
      statusCode: 400,
      statusMessage: 'startDate and endDate must be valid ISO dates',
    })
  }
  if (start > end) {
    throw createError({
      statusCode: 400,
      statusMessage: 'startDate must be before endDate',
    })
  }

  const ranges: Array<{ key: string; start: string; end: string }> = []
  const cursor = new Date(
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1)
  )
  const last = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1))

  while (cursor <= last) {
    const monthStart = new Date(
      Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), 1)
    )
    const monthEnd = new Date(
      Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0)
    )
    const rangeStart = monthStart < start ? start : monthStart
    const rangeEnd = monthEnd > end ? end : monthEnd
    ranges.push({
      key: formatMonth(monthStart),
      start: toIsoDate(rangeStart),
      end: toIsoDate(rangeEnd),
    })
    cursor.setUTCMonth(cursor.getUTCMonth() + 1)
  }

  return ranges
}

function initSeries(months: string[]): Record<StatusKey, number[]> {
  return STATUSES.reduce((acc, status) => {
    acc[status] = months.map(() => 0)
    return acc
  }, {} as Record<StatusKey, number[]>)
}

function movingAverage(values: number[], window: number): Array<number | null> {
  const result: Array<number | null> = values.map(() => null)
  let sum = 0
  for (let i = 0; i < values.length; i += 1) {
    sum += values[i]
    if (i >= window) {
      sum -= values[i - window]
    }
    if (i >= window - 1) {
      result[i] = Math.round((sum / window) * 100) / 100
    }
  }
  return result
}

function momChangePct(values: number[]): Array<number | null> {
  const result: Array<number | null> = values.map(() => null)
  for (let i = 1; i < values.length; i += 1) {
    const prev = values[i - 1]
    if (prev > 0) {
      result[i] = Math.round(((values[i] - prev) / prev) * 10000) / 100
    }
  }
  return result
}

function ratioPct(numerator: number[], denominator: number[]): Array<number | null> {
  return numerator.map((value, index) => {
    const base = denominator[index]
    if (!base || base <= 0) return null
    return Math.round((value / base) * 10000) / 100
  })
}

function buildAnalyticsQuery(params: {
  token: string
  startDate: string
  endDate: string
  officeId: number
  programmes: number[]
  breakdownBy?: string
}) {
  const parts = [
    `access_token=${encodeURIComponent(params.token)}`,
    `start_date=${encodeURIComponent(params.startDate)}`,
    `end_date=${encodeURIComponent(params.endDate)}`,
    `performance_v3[office_id]=${encodeURIComponent(params.officeId)}`,
  ]
  params.programmes.forEach((programme) => {
    parts.push(
      `performance_v3[programmes][]=${encodeURIComponent(programme)}`
    )
  })
  if (params.breakdownBy) {
    parts.push(
      `performance_v3[breakdown_by]=${encodeURIComponent(params.breakdownBy)}`
    )
  }
  return parts.join('&')
}

async function fetchAnalyticsSnapshot(endpoint: string, query: string) {
  const cacheKey = `${endpoint}?${query}`
  const now = Date.now()
  const cached = snapshotCache.get(cacheKey)
  if (cached && now - cached.fetchedAt < SNAPSHOT_CACHE_TTL_MS) {
    return cached.data
  }

  const response = await expaFetch(cacheKey, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
    },
  })

  const rawText = await response.text()
  const trimmed = rawText.trim()
  let payload: any = null
  let parsed = false
  if (trimmed) {
    const normalized = trimmed.replace(/^\uFEFF/, '')
    try {
      payload = JSON.parse(normalized)
      parsed = true
    } catch {
      payload = null
    }
  }

  if (!response.ok) {
    let message =
      payload?.error ||
      payload?.message ||
      `Analytics request failed with ${response.status}`
    if (!parsed && trimmed) {
      message = 'Analytics request failed with non-JSON response.'
    }
    throw createError({ statusCode: response.status, statusMessage: message })
  }

  if (!payload || typeof payload !== 'object') {
    const message = trimmed
      ? 'Analytics response was not valid JSON. Check access token.'
      : 'Analytics response was empty.'
    throw createError({
      statusCode: 502,
      statusMessage: message,
    })
  }

  const data =
    typeof payload.response === 'object'
      ? payload.response
      : typeof payload.data === 'object'
        ? payload.data
        : payload
  if (!data || typeof data !== 'object') {
    throw createError({
      statusCode: 502,
      statusMessage: 'Analytics response missing data payload',
    })
  }

  const normalized = data as Record<string, unknown>
  snapshotCache.set(cacheKey, { data: normalized, fetchedAt: Date.now() })
  return normalized
}

function resolveOfficeBlock(
  analytics: Record<string, unknown>,
  officeId: number
) {
  const officeKey = String(officeId)
  const officeBlock = analytics[officeKey]
  return officeBlock && typeof officeBlock === 'object'
    ? (officeBlock as Record<string, unknown>)
    : analytics
}

function sumStage(
  analytics: Record<string, unknown>,
  stage: string,
  programmes: number[],
  direction: 'o' | 'i',
  metric: MetricKey
) {
  let total = 0
  programmes.forEach((programme) => {
    const key = `${direction}_${stage}_${programme}`
    const entry = analytics[key] as
      | { doc_count?: number; applicants?: { value?: number } }
      | undefined
    if (!entry) return
    if (metric === 'applicants') {
      const value = entry.applicants?.value
      if (typeof value === 'number') {
        total += value
        return
      }
    }
    if (typeof entry.doc_count === 'number') {
      total += entry.doc_count
    }
  })
  return total
}

function applySnapshotToSeries(params: {
  series: Record<StatusKey, number[]>
  index: number
  snapshot: Record<string, unknown>
  programmes: number[]
  direction: 'o' | 'i'
  metric: MetricKey
}) {
  const { series, index, snapshot, programmes, direction, metric } = params
  STATUSES.forEach((status) => {
    const stage = STATUS_STAGE[status]
    series[status][index] += sumStage(
      snapshot,
      stage,
      programmes,
      direction,
      metric
    )
  })
}

export default defineEventHandler(async (event) => {
  const body = (await readBody(event)) ?? {}
  const startDate = parseIsoDate(
    body.startDate ?? body.start_date,
    'startDate'
  )
  const endDate = parseIsoDate(body.endDate ?? body.end_date, 'endDate')

  const programmes = normalizeProgrammes(body.programmes)
  const metric = normalizeMetric(body.metric ?? body.metricType)
  const officeIdsFromBody = resolveOfficeIds(body)
  const maxMonths = toPositiveInt(body.maxMonths ?? body.max_months, 0)
  const useSingleRequest = body.singleRequest !== false
  const breakdownBy =
    typeof body.breakdownBy === 'string' && body.breakdownBy.trim().length > 0
      ? body.breakdownBy.trim()
      : 'month'

  const directionRaw =
    typeof body.direction === 'string' ? body.direction.toLowerCase() : 'o'
  const direction = directionRaw === 'i' ? 'i' : 'o'

  const config = useRuntimeConfig()
  const endpoint =
    config.expaAnalyticsEndpoint ||
    'https://analytics.api.aiesec.org/v2/applications/analyze.json'
  const token =
    config.expaAnalyticsAccessToken || config.expaAccessToken || ''

  if (!token || typeof token !== 'string' || token.trim().length === 0) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Missing analytics access token',
    })
  }

  const defaultOfficeId = Number(config.expaAnalyticsDefaultOfficeId ?? 1626)
  const officeIds =
    officeIdsFromBody.length > 0
      ? officeIdsFromBody
      : Number.isInteger(defaultOfficeId) && defaultOfficeId > 0
        ? [defaultOfficeId]
        : []

  if (!officeIds.length) {
    throw createError({
      statusCode: 400,
      statusMessage: 'officeId is required',
    })
  }

  const cacheKey = [
    'v2',
    startDate,
    endDate,
    direction,
    metric,
    programmes.slice().sort().join(','),
    officeIds.slice().sort().join(','),
    useSingleRequest ? 'single' : 'monthly',
    maxMonths > 0 ? String(maxMonths) : 'all',
    breakdownBy,
  ].join('|')

  const cachedResult = resultCache.get(cacheKey)
  if (cachedResult && Date.now() - cachedResult.fetchedAt < RESULT_CACHE_TTL_MS) {
    const cacheAgeSeconds = Math.floor(
      (Date.now() - cachedResult.fetchedAt) / 1000
    )
    return {
      ...cachedResult.data,
      meta: {
        ...(cachedResult.data.meta as Record<string, unknown>),
        cached: true,
        cacheAgeSeconds,
      },
    }
  }

  const inflight = inflightResults.get(cacheKey)
  if (inflight) {
    return inflight
  }

  const startedAt = Date.now()

  const responsePromise = (async () => {
    const requestedRanges = buildMonthRanges(startDate, endDate)
    const monthRanges =
      maxMonths > 0 && requestedRanges.length > maxMonths
        ? requestedRanges.slice(-maxMonths)
        : requestedRanges
    const months = monthRanges.map((range) => range.key)
    const monthIndex = new Map(months.map((month, index) => [month, index]))
    const series = initSeries(months)

    const fetchMonthlyLoop = async (officeId: number) => {
      const concurrency = Math.min(6, monthRanges.length)
      let cursor = 0
      const runWorker = async () => {
        while (cursor < monthRanges.length) {
          const index = cursor
          cursor += 1
          const range = monthRanges[index]
          const query = buildAnalyticsQuery({
            token: token.trim(),
            startDate: range.start,
            endDate: range.end,
            officeId,
            programmes,
          })
          const analytics = await fetchAnalyticsSnapshot(endpoint, query)
          const snapshot = resolveOfficeBlock(analytics, officeId)
          applySnapshotToSeries({
            series,
            index,
            snapshot,
            programmes,
            direction,
            metric,
          })
        }
      }
      await Promise.all(Array.from({ length: concurrency }, () => runWorker()))
    }

    const fetchSingleRequest = async (officeId: number) => {
      if (monthRanges.length <= 1) {
        return false
      }
      const query = buildAnalyticsQuery({
        token: token.trim(),
        startDate: monthRanges[0].start,
        endDate: monthRanges[monthRanges.length - 1].end,
        officeId,
        programmes,
        breakdownBy,
      })
      const analytics = await fetchAnalyticsSnapshot(endpoint, query)
      const buckets = extractMonthlyBuckets(analytics)
      if (!buckets.length) {
        return false
      }
      buckets.forEach((bucket) => {
        const index = monthIndex.get(bucket.key)
        if (index === undefined) return
        const snapshot = resolveOfficeBlock(bucket.snapshot, officeId)
        applySnapshotToSeries({
          series,
          index,
          snapshot,
          programmes,
          direction,
          metric,
        })
      })
      return true
    }

    const fetchSeriesForOffice = async (officeId: number) => {
      if (useSingleRequest) {
        const usedSingle = await fetchSingleRequest(officeId)
        if (usedSingle) {
          return 'single'
        }
      }
      await fetchMonthlyLoop(officeId)
      return 'monthly'
    }

    const officeConcurrency = Math.min(2, officeIds.length)
    let officeCursor = 0
    const modes: string[] = []
    const runOfficeWorker = async () => {
      while (officeCursor < officeIds.length) {
        const index = officeCursor
        officeCursor += 1
        modes[index] = await fetchSeriesForOffice(officeIds[index])
      }
    }
    await Promise.all(
      Array.from({ length: officeConcurrency }, () => runOfficeWorker())
    )
    const uniqueModes = Array.from(new Set(modes))
    const mode =
      uniqueModes.length === 1 ? uniqueModes[0] : uniqueModes.length > 1 ? 'mixed' : 'monthly'

    const totals = STATUSES.reduce((acc, status) => {
      acc[status] = series[status].reduce((sum, value) => sum + value, 0)
      return acc
    }, {} as Record<StatusKey, number>)

    const movingAverageSeries = STATUSES.reduce((acc, status) => {
      acc[status] = movingAverage(series[status], 3)
      return acc
    }, {} as Record<StatusKey, Array<number | null>>)

    const momChangeSeries = STATUSES.reduce((acc, status) => {
      acc[status] = momChangePct(series[status])
      return acc
    }, {} as Record<StatusKey, Array<number | null>>)

    const conversionRatePct = {
      appliedToMatched: ratioPct(series.matched, series.applied),
      matchedToAccepted: ratioPct(series.accepted, series.matched),
      acceptedToApproved: ratioPct(series.approved, series.accepted),
      approvedToRealized: ratioPct(series.realized, series.approved),
      realizedToCompleted: ratioPct(series.completed, series.realized),
    }

    const statusSummary = STATUSES.reduce((acc, status) => {
      const total = totals[status] ?? 0
      acc[status] = {
        total_items: total,
        total_pages: 1,
        current_page: 1,
        fetched_items: total,
      }
      return acc
    }, {} as Record<string, unknown>)

    const response = {
      range: { startDate, endDate },
      filters: {
        programmes,
        officeIds,
        direction,
        metric,
        maxMonths: maxMonths || null,
        singleRequest: useSingleRequest,
        breakdownBy,
      },
      months,
      series,
      totals,
      inference: {
        movingAverage: {
          window: 3,
          series: movingAverageSeries,
        },
        momChangePct: {
          series: momChangeSeries,
        },
        conversionRatePct,
      },
      statusSummary,
      meta: {
        cached: false,
        mode,
        fetchMs: Date.now() - startedAt,
        months: months.length,
        requestedMonths: requestedRanges.length,
        effectiveRange: {
          startDate: monthRanges[0]?.start ?? startDate,
          endDate: monthRanges[monthRanges.length - 1]?.end ?? endDate,
        },
        trimmed: requestedRanges.length !== monthRanges.length,
      },
    } as Record<string, unknown>

    resultCache.set(cacheKey, { data: response, fetchedAt: Date.now() })
    return response
  })()

  inflightResults.set(cacheKey, responsePromise)
  try {
    return await responsePromise
  } finally {
    inflightResults.delete(cacheKey)
  }
})
