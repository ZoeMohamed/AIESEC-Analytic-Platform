import { createError, defineEventHandler, getQuery } from 'h3'
import { expaFetch } from '../../utils/expaFetch'

const LIST_QUERY = /* GraphQL */ `
  query Committees($page: Int, $perPage: Int, $q: String, $filters: OfficeFilter) {
    committeesListBasic(page: $page, per_page: $perPage, q: $q, filters: $filters) {
      data {
        id
        name
        full_name
      }
      paging {
        total_items
        total_pages
        current_page
      }
    }
  }
`

const AUTOCOMPLETE_QUERY = /* GraphQL */ `
  query CommitteesAutocomplete($q: String, $perPage: Int) {
    committeeAutocomplete(q: $q, per_page: $perPage) {
      id
      name
      full_name
    }
  }
`

function getExpaConfig() {
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

  return {
    endpoint,
    headers: {
      'Content-Type': 'application/json',
      [authHeader]: authScheme ? `${authScheme} ${token}` : token,
    },
  }
}

function parseNumber(value: unknown, fallback: number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback
}

function parseIds(value: unknown): number[] | null {
  if (typeof value === 'string') {
    const list = value
      .split(',')
      .map((entry) => Number(entry.trim()))
      .filter((entry) => Number.isInteger(entry) && entry > 0)
    return list.length ? list : null
  }
  if (Array.isArray(value)) {
    const list = value
      .map((entry) => Number(entry))
      .filter((entry) => Number.isInteger(entry) && entry > 0)
    return list.length ? list : null
  }
  return null
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const page = parseNumber(query.page, 1)
  const perPage = Math.min(parseNumber(query.perPage, 50), 200)
  const q = typeof query.q === 'string' && query.q.trim().length
    ? query.q.trim()
    : null
  const ids = parseIds(query.ids)

  const { endpoint, headers } = getExpaConfig()

  if (!ids && (!q || q.length < 2)) {
    return {
      items: [],
      paging: {
        total_items: 0,
        total_pages: 1,
        current_page: 1,
      },
    }
  }

  if (!ids && q) {
    const response = await expaFetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        query: AUTOCOMPLETE_QUERY,
        variables: {
          q,
          perPage,
        },
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

    const items = (payload?.data?.committeeAutocomplete ?? []).map((item: any) => {
      const id = String(item.id)
      const label = item.full_name || item.name || `Committee ${id}`
      return { id, label }
    })

    return {
      items: items.sort((a: any, b: any) => a.label.localeCompare(b.label)),
      paging: {
        total_items: items.length,
        total_pages: 1,
        current_page: 1,
      },
    }
  }

  const response = await expaFetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      query: LIST_QUERY,
      variables: {
        page,
        perPage,
        q,
        filters: ids ? { ids } : null,
      },
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

  const list = payload?.data?.committeesListBasic ?? {}
  const items = (list.data ?? []).map((item: any) => {
    const id = String(item.id)
    const label = item.full_name || item.name || `Committee ${id}`
    return { id, label }
  })

  return {
    items: items.sort((a: any, b: any) => a.label.localeCompare(b.label)),
    paging: {
      total_items: list?.paging?.total_items ?? items.length,
      total_pages: list?.paging?.total_pages ?? 1,
      current_page: list?.paging?.current_page ?? page,
    },
  }
})
