import { createError, defineEventHandler, readBody } from 'h3'
import { expaFetch } from '../../utils/expaFetch'

type StatusKey =
  | 'applied'
  | 'accepted'
  | 'approved'
  | 'realized'
  | 'completed'
  | 'finished'

interface AnalyticsVariables {
  startDate: string
  endDate: string
  programmes?: number[] | null
  personCommittees?: number[] | null
  opportunityCommittees?: number[] | null
  page?: number
}

const STATUSES: StatusKey[] = [
  'applied',
  'accepted',
  'approved',
  'realized',
  'completed',
  'finished',
]

const QUERY = /* GraphQL */ `
query ComprehensiveExchangeAnalytics(
  $startDate: DateTime!
  $endDate: DateTime!
  $programmes: [Int]
  $personCommittees: [Int]
  $opportunityCommittees: [Int]
  $page: Int = 1
) {
  applied: allOpportunityApplication(
    filters: {
      statuses: ["applied"]
      experience_start_date: { start_date: $startDate, end_date: $endDate }
      programmes: $programmes
      person_home_lc: $personCommittees
      opportunity_home_lc: $opportunityCommittees
    }
    pagination: { per_page: 1000, page: $page }
  ) {
    data {
      id
      current_status
      created_at
      experience_start_date
      experience_end_date
      opportunity {
        id
        title
        programme {
          id
          short_name
        }
        sub_product {
          id
          name
        }
        duration
      }
      person {
        id
        full_name
        home_lc {
          id
          name
        }
      }
      host_lc {
        id
        name
      }
    }
    paging {
      total_items
      total_pages
      current_page
    }
    facets {
      name
      type
      total
      terms
    }
  }

  accepted: allOpportunityApplication(
    filters: {
      statuses: ["accepted"]
      experience_start_date: { start_date: $startDate, end_date: $endDate }
      programmes: $programmes
      person_home_lc: $personCommittees
      opportunity_home_lc: $opportunityCommittees
    }
    pagination: { per_page: 1000, page: $page }
  ) {
    data {
      id
      current_status
      created_at
      date_matched
      experience_start_date
      opportunity {
        programme {
          id
          short_name
        }
      }
      person {
        home_lc {
          id
          name
        }
      }
    }
    paging {
      total_items
      total_pages
      current_page
    }
    facets {
      name
      type
      total
    }
  }

  approved: allOpportunityApplication(
    filters: {
      statuses: ["approved"]
      date_approved: { start_date: $startDate, end_date: $endDate }
      programmes: $programmes
      person_home_lc: $personCommittees
      opportunity_home_lc: $opportunityCommittees
    }
    pagination: { per_page: 1000, page: $page }
  ) {
    data {
      id
      current_status
      date_approved
      experience_start_date
      opportunity {
        programme {
          id
          short_name
        }
      }
      person {
        home_lc {
          id
          name
        }
      }
    }
    paging {
      total_items
      total_pages
      current_page
    }
    facets {
      name
      type
      total
    }
  }

  realized: allOpportunityApplication(
    filters: {
      statuses: ["realized"]
      date_realized: { start_date: $startDate, end_date: $endDate }
      programmes: $programmes
      person_home_lc: $personCommittees
      opportunity_home_lc: $opportunityCommittees
    }
    pagination: { per_page: 1000, page: $page }
  ) {
    data {
      id
      current_status
      date_realized
      experience_start_date
      experience_end_date
      opportunity {
        programme {
          id
          short_name
        }
      }
      person {
        home_lc {
          id
          name
        }
      }
      nps_grade
    }
    paging {
      total_items
      total_pages
      current_page
    }
    facets {
      name
      type
      total
    }
  }

  completed: allOpportunityApplication(
    filters: {
      statuses: ["completed"]
      experience_end_date: { start_date: $startDate, end_date: $endDate }
      programmes: $programmes
      person_home_lc: $personCommittees
      opportunity_home_lc: $opportunityCommittees
    }
    pagination: { per_page: 1000, page: $page }
  ) {
    data {
      id
      current_status
      experience_end_date
      opportunity {
        programme {
          id
          short_name
        }
      }
      person {
        home_lc {
          id
          name
        }
      }
      nps_grade
      testimonial_filled_at
    }
    paging {
      total_items
      total_pages
      current_page
    }
    facets {
      name
      type
      total
    }
  }

  finished: allOpportunityApplication(
    filters: {
      statuses: ["finished"]
      experience_end_date: { start_date: $startDate, end_date: $endDate }
      programmes: $programmes
      person_home_lc: $personCommittees
      opportunity_home_lc: $opportunityCommittees
    }
    pagination: { per_page: 1000, page: $page }
  ) {
    data {
      id
      current_status
      experience_end_date
      opportunity {
        programme {
          id
          short_name
        }
      }
      person {
        home_lc {
          id
          name
        }
      }
    }
    paging {
      total_items
      total_pages
      current_page
    }
  }
}
`

const STATUS_DATE_FIELD: Record<StatusKey, (item: any) => string | null | undefined> =
  {
    applied: (item) => item?.created_at ?? item?.experience_start_date,
    accepted: (item) =>
      item?.date_matched ?? item?.created_at ?? item?.experience_start_date,
    approved: (item) => item?.date_approved ?? item?.experience_start_date,
    realized: (item) => item?.date_realized ?? item?.experience_start_date,
    completed: (item) => item?.experience_end_date ?? item?.experience_start_date,
    finished: (item) => item?.experience_end_date ?? item?.experience_start_date,
  }

function normalizeIdArray(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null
  const numbers = value
    .map((entry) => Number(entry))
    .filter((entry) => Number.isInteger(entry) && entry > 0)
  return numbers.length ? numbers : null
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

function buildMonthKeys(startIso: string, endIso: string): string[] {
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

  const months: string[] = []
  const cursor = new Date(
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1)
  )
  const last = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1))

  while (cursor <= last) {
    months.push(formatMonth(cursor))
    cursor.setUTCMonth(cursor.getUTCMonth() + 1)
  }

  return months
}

function monthKey(value: string | null | undefined): string | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return formatMonth(date)
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

async function fetchAnalyticsPage(
  endpoint: string,
  headers: Record<string, string>,
  variables: AnalyticsVariables
) {
  const response = await expaFetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      query: QUERY,
      variables,
    }),
  })

  const payload = await response.json()
  if (!response.ok) {
    throw createError({
      statusCode: response.status,
      statusMessage: `EXPA request failed with ${response.status}`,
    })
  }
  if (payload?.errors?.length) {
    throw createError({
      statusCode: 502,
      statusMessage: payload.errors.map((err: any) => err.message).join('; '),
    })
  }
  if (!payload?.data) {
    throw createError({
      statusCode: 502,
      statusMessage: 'EXPA response missing data payload',
    })
  }

  return payload.data as Record<
    StatusKey,
    {
      data: any[]
      paging?: { total_items?: number; total_pages?: number; current_page?: number }
      facets?: Array<{ name: string; type: string; total: number }>
    }
  >
}

function mergePages(
  target: Record<StatusKey, any>,
  next: Record<StatusKey, any>
) {
  STATUSES.forEach((status) => {
    const targetData = target?.[status]?.data
    const nextData = next?.[status]?.data ?? []
    if (Array.isArray(targetData)) {
      targetData.push(...nextData)
    }
    if (next?.[status]?.paging) {
      target[status].paging = next[status].paging
    }
  })
}

function maxTotalPages(data: Record<StatusKey, any>): number {
  return Math.max(
    1,
    ...STATUSES.map((status) => data?.[status]?.paging?.total_pages ?? 1)
  )
}

export default defineEventHandler(async (event) => {
  const body = (await readBody(event)) ?? {}

  const startDate = parseIsoDate(
    body.startDate ?? body.start_date,
    'startDate'
  )
  const endDate = parseIsoDate(body.endDate ?? body.end_date, 'endDate')

  const programmes = normalizeIdArray(body.programmes)
  const committees = normalizeIdArray(body.committees)
  const committeeScopeRaw =
    typeof body.committeeScope === 'string'
      ? body.committeeScope.toLowerCase()
      : typeof body.committee_scope === 'string'
        ? body.committee_scope.toLowerCase()
        : ''
  const committeeScope =
    committeeScopeRaw === 'opportunity' || committeeScopeRaw === 'host'
      ? 'opportunity'
      : 'person'
  const personCommittees = committeeScope === 'person' ? committees : null
  const opportunityCommittees =
    committeeScope === 'opportunity' ? committees : null

  const pageRaw = Number(body.page ?? 1)
  const page = Number.isInteger(pageRaw) && pageRaw > 0 ? pageRaw : 1

  const fetchAllPages = Boolean(body.fetchAllPages)
  const maxPagesRaw = Number(body.maxPages ?? 5)
  const maxPages = Number.isInteger(maxPagesRaw)
    ? Math.min(Math.max(maxPagesRaw, 1), 20)
    : 5
  const includeRaw = Boolean(body.includeRaw)

  const config = useRuntimeConfig()
  const endpoint = config.expaEndpoint || 'https://gis-api.aiesec.org/graphql'
  const token = config.expaAccessToken

  if (!token) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Missing EXPA access token',
    })
  }

  const authHeader =
    typeof config.expaAuthHeader === 'string' && config.expaAuthHeader.trim()
      ? config.expaAuthHeader.trim()
      : 'Authorization'
  const authScheme =
    typeof config.expaAuthScheme === 'string' ? config.expaAuthScheme.trim() : 'Bearer'
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    [authHeader]: authScheme ? `${authScheme} ${token}` : token,
  }

  const variables: AnalyticsVariables = {
    startDate,
    endDate,
    programmes,
    personCommittees,
    opportunityCommittees,
    page,
  }

  const firstPage = await fetchAnalyticsPage(endpoint, headers, variables)
  const combined = firstPage

  const totalPages = maxTotalPages(firstPage)
  const lastPage = fetchAllPages
    ? Math.min(totalPages, page + maxPages - 1)
    : page

  if (fetchAllPages && lastPage > page) {
    for (let current = page + 1; current <= lastPage; current += 1) {
      const nextPage = await fetchAnalyticsPage(endpoint, headers, {
        ...variables,
        page: current,
      })
      mergePages(combined, nextPage)
    }
  }

  const months = buildMonthKeys(startDate, endDate)
  const monthIndex = new Map(months.map((month, index) => [month, index]))
  const series = initSeries(months)

  STATUSES.forEach((status) => {
    const items = combined?.[status]?.data ?? []
    const getDate = STATUS_DATE_FIELD[status]
    items.forEach((item: any) => {
      const key = monthKey(getDate(item))
      if (!key) return
      const index = monthIndex.get(key)
      if (index === undefined) return
      series[status][index] += 1
    })
  })

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
    appliedToAccepted: ratioPct(series.accepted, series.applied),
    acceptedToApproved: ratioPct(series.approved, series.accepted),
    approvedToRealized: ratioPct(series.realized, series.approved),
    realizedToCompleted: ratioPct(series.completed, series.realized),
  }

  const statusSummary = STATUSES.reduce((acc, status) => {
    const paging = combined?.[status]?.paging ?? {}
    const fetchedItems = combined?.[status]?.data?.length ?? 0
    acc[status] = {
      total_items: paging.total_items ?? fetchedItems,
      total_pages: paging.total_pages ?? 1,
      current_page: paging.current_page ?? page,
      fetched_items: fetchedItems,
    }
    return acc
  }, {} as Record<string, unknown>)

  const response = {
    range: { startDate, endDate },
    filters: { programmes, committees, committeeScope },
    pagination: {
      page,
      pagesFetched: lastPage - page + 1,
      perPage: 1000,
      totalPages: totalPages,
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
  } as Record<string, unknown>

  if (includeRaw) {
    response.raw = combined
  }

  return response
})
