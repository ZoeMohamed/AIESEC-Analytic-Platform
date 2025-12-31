import { createError, defineEventHandler, getQuery } from 'h3'
import { expaFetch } from '../../utils/expaFetch'

interface FilterOption {
  id: string
  label: string
}

interface CommitteeResponseItem {
  id?: string | number
  name?: string
  full_name?: string
}

const CACHE_TTL_MS = 10 * 60 * 1000

const COMMITTEE_QUERY = `
  query GetSubOfficesViaParent($id: ID!) {
    committee(id: $id) {
      id
      name
      full_name
      suboffices {
        id
        name
        full_name
      }
    }
  }
`

const MC_COMMITTEES: FilterOption[] = [
  { id: '4', label: 'Myanmar' },
  { id: '29', label: 'Cabo Verde' },
  { id: '30', label: 'Barbados' },
  { id: '55', label: 'Laos' },
  { id: '56', label: 'Kuwait' },
  { id: '57', label: 'Montenegro' },
  { id: '78', label: 'Namibia' },
  { id: '79', label: 'Belarus' },
  { id: '112', label: 'Nepal' },
  { id: '133', label: 'Albania' },
  { id: '177', label: 'Paraguay' },
  { id: '178', label: 'Nicaragua' },
  { id: '180', label: 'Burkina Faso' },
  { id: '182', label: 'Lebanon' },
  { id: '219', label: 'Liberia' },
  { id: '305', label: 'Cambodia' },
  { id: '409', label: 'Mongolia' },
  { id: '457', label: 'Algeria' },
  { id: '459', label: 'Benin' },
  { id: '476', label: 'Ethiopia' },
  { id: '477', label: 'Sultanate of Oman' },
  { id: '489', label: 'Mauritius' },
  { id: '494', label: 'Kazakhstan' },
  { id: '495', label: 'Iran' },
  { id: '499', label: 'Gabon' },
  { id: '504', label: 'Vietnam' },
  { id: '506', label: 'Rwanda' },
  { id: '518', label: 'Bahrain' },
  { id: '529', label: 'Qatar' },
  { id: '530', label: 'Jordan' },
  { id: '531', label: 'Georgia' },
  { id: '536', label: 'Moldova' },
  { id: '537', label: 'Tajikistan' },
  { id: '539', label: 'Azerbaijan' },
  { id: '543', label: 'Kyrgyzstan' },
  { id: '567', label: 'Tanzania' },
  { id: '572', label: 'Afghanistan' },
  { id: '577', label: 'Costa Rica' },
  { id: '1535', label: 'Argentina' },
  { id: '1536', label: 'Slovakia' },
  { id: '1537', label: "Cote D'Ivoire" },
  { id: '1538', label: 'Puerto Rico' },
  { id: '1539', label: 'Indonesia' },
  { id: '1540', label: 'Ireland' },
  { id: '1541', label: 'Armenia' },
  { id: '1542', label: 'Italy' },
  { id: '1543', label: 'Togo' },
  { id: '1544', label: 'Portugal' },
  { id: '1545', label: 'South Africa' },
  { id: '1547', label: 'Serbia' },
  { id: '1548', label: 'Macedonia' },
  { id: '1549', label: 'Hungary' },
  { id: '1550', label: 'Iceland' },
  { id: '1551', label: 'Colombia' },
  { id: '1552', label: 'Morocco' },
  { id: '1553', label: 'Peru' },
  { id: '1554', label: 'Canada' },
  { id: '1555', label: 'Greece' },
  { id: '1556', label: 'Guatemala' },
  { id: '1557', label: 'Venezuela' },
  { id: '1558', label: 'Switzerland' },
  { id: '1559', label: 'Tunisia' },
  { id: '1560', label: 'Romania' },
  { id: '1561', label: 'Taiwan' },
  { id: '1562', label: 'Korea' },
  { id: '1563', label: 'United Kingdom' },
  { id: '1564', label: 'Poland' },
  { id: '1565', label: 'Estonia' },
  { id: '1566', label: 'Chile' },
  { id: '1567', label: 'Ecuador' },
  { id: '1568', label: 'Ghana' },
  { id: '1570', label: 'Czech Republic' },
  { id: '1572', label: 'El Salvador' },
  { id: '1573', label: 'Norway' },
  { id: '1574', label: 'Mozambique' },
  { id: '1575', label: 'Singapore' },
  { id: '1577', label: 'Denmark' },
  { id: '1578', label: 'Nigeria' },
  { id: '1579', label: 'Latvia' },
  { id: '1580', label: 'Lithuania' },
  { id: '1581', label: 'Cameroon' },
  { id: '1582', label: 'Panama' },
  { id: '1584', label: 'Botswana' },
  { id: '1585', label: 'India' },
  { id: '1587', label: 'Slovenia' },
  { id: '1588', label: 'Bulgaria' },
  { id: '1589', label: 'Mexico' },
  { id: '1590', label: 'Bosnia and Herzegovina' },
  { id: '1591', label: 'Australia' },
  { id: '1592', label: 'Austria' },
  { id: '1593', label: 'Bolivia' },
  { id: '1594', label: 'Hong Kong' },
  { id: '1595', label: 'Croatia' },
  { id: '1596', label: 'Germany' },
  { id: '1597', label: 'France' },
  { id: '1598', label: 'The Netherlands' },
  { id: '1599', label: 'Dominican Republic' },
  { id: '1601', label: 'Sweden' },
  { id: '1602', label: 'Uganda' },
  { id: '1603', label: 'Pakistan' },
  { id: '1604', label: 'Philippines' },
  { id: '1605', label: 'Senegal' },
  { id: '1606', label: 'Brazil' },
  { id: '1607', label: 'Thailand' },
  { id: '1609', label: 'Egypt' },
  { id: '1610', label: 'Ukraine' },
  { id: '1611', label: 'Malaysia' },
  { id: '1612', label: 'Malta' },
  { id: '1613', label: 'Mainland of China' },
  { id: '1614', label: 'Uruguay' },
  { id: '1615', label: 'Japan' },
  { id: '1616', label: 'New Zealand' },
  { id: '1617', label: 'Kenya' },
  { id: '1618', label: 'Russia' },
  { id: '1619', label: 'Spain' },
  { id: '1620', label: 'Finland' },
  { id: '1621', label: 'United States' },
  { id: '1622', label: 'Turkey' },
  { id: '1623', label: 'Sri Lanka' },
  { id: '1624', label: 'Belgium' },
  { id: '1625', label: 'United Arab Emirates' },
  { id: '1709', label: 'Malawi' },
  { id: '1840', label: 'Seychelles' },
  { id: '2010', label: 'Bangladesh' },
  { id: '2103', label: 'Monaco' },
  { id: '2104', label: 'Bhutan' },
  { id: '2105', label: 'Maldives' },
  { id: '2106', label: 'Kingdom of Saudi Arabia' },
  { id: '2107', label: 'Global Teams' },
  { id: '2108', label: 'Honduras' },
  { id: '2109', label: 'Cyprus' },
  { id: '2115', label: 'Uzbekistan' },
  { id: '2117', label: 'Niger' },
  { id: '2121', label: 'Liechtenstein' },
  { id: '2122', label: 'Zambia' },
  { id: '2240', label: 'Fiji' },
  { id: '2249', label: 'Andorra' },
  { id: '2339', label: 'Haiti' },
  { id: '2417', label: 'Zimbabwe' },
  { id: '2418', label: 'Swaziland' },
  { id: '2420', label: 'Sierra Leone' },
  { id: '2427', label: 'Jamaica' },
  { id: '2428', label: 'Madagascar' },
  { id: '2442', label: 'Mali' },
]

const cache = new Map<
  number,
  { items: FilterOption[]; fetchedAt: number; inflight?: Promise<FilterOption[]> }
>()

function toPositiveInt(value: unknown, fallback: number) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

function buildAuthHeader(token: string, scheme: string) {
  const trimmed = token.trim()
  const normalizedScheme = scheme.trim()
  return normalizedScheme.length > 0 ? `${normalizedScheme} ${trimmed}` : trimmed
}

function filterAndPage(
  items: FilterOption[],
  search: string,
  page: number,
  perPage: number
) {
  const filtered = search
    ? items.filter((item) => {
        const label = item.label.toLowerCase()
        return label.includes(search) || item.id.includes(search)
      })
    : items

  const totalItems = filtered.length
  const totalPages = Math.max(1, Math.ceil(totalItems / perPage))
  const safePage = Math.min(Math.max(page, 1), totalPages)
  const startIndex = (safePage - 1) * perPage
  const pageItems = filtered.slice(startIndex, startIndex + perPage)

  return {
    items: pageItems,
    paging: {
      total_items: totalItems,
      total_pages: totalPages,
      current_page: safePage,
    },
  }
}

async function fetchSubOffices(params: {
  parentId: number
  token: string
  endpoint: string
  scheme: string
}) {
  const { parentId, token, endpoint, scheme } = params
  const now = Date.now()
  const cached = cache.get(parentId)
  if (cached && cached.items.length && now - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.items
  }
  if (cached?.inflight) {
    return cached.inflight
  }

  const inflight = (async () => {
    const response = await expaFetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: buildAuthHeader(token, scheme),
      },
      body: JSON.stringify({
        query: COMMITTEE_QUERY,
        variables: { id: String(parentId) },
      }),
    })

    const payload = await response.json().catch(() => null)

    if (!response.ok) {
      const message =
        payload?.errors?.map((err: { message?: string }) => err.message).join('; ') ||
        payload?.message ||
        `Committees request failed with ${response.status}`
      throw createError({ statusCode: response.status, statusMessage: message })
    }

    if (payload?.errors?.length) {
      throw createError({
        statusCode: 502,
        statusMessage: payload.errors
          .map((err: { message?: string }) => err.message)
          .join('; '),
      })
    }

    const suboffices = payload?.data?.committee?.suboffices
    if (!Array.isArray(suboffices)) {
      throw createError({
        statusCode: 502,
        statusMessage: 'Committees response missing suboffices',
      })
    }

    const items = suboffices
      .map((item: CommitteeResponseItem) => {
        const id = item.id ? String(item.id) : ''
        const label = item.full_name || item.name || id
        return id && label ? { id, label } : null
      })
      .filter((item): item is FilterOption => Boolean(item))
      .sort((a, b) => a.label.localeCompare(b.label))

    cache.set(parentId, { items, fetchedAt: Date.now() })
    return items
  })()

  cache.set(parentId, {
    items: cached?.items ?? [],
    fetchedAt: cached?.fetchedAt ?? 0,
    inflight,
  })

  try {
    return await inflight
  } finally {
    const latest = cache.get(parentId)
    if (latest?.inflight === inflight) {
      cache.set(parentId, { items: latest.items, fetchedAt: latest.fetchedAt })
    }
  }
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const search =
    typeof query.q === 'string' && query.q.trim().length
      ? query.q.trim().toLowerCase()
      : ''
  const page = toPositiveInt(query.page ?? query.current_page, 1)
  const perPage = toPositiveInt(query.perPage ?? query.per_page, 50)
  const parentIdRaw =
    query.parentId ??
    query.parent_id ??
    query.officeId ??
    query.office_id ??
    query.committeeId ??
    query.committee_id
  const hasParentId =
    parentIdRaw !== undefined &&
    parentIdRaw !== null &&
    String(parentIdRaw).trim().length > 0
  const parentId = hasParentId ? toPositiveInt(parentIdRaw, 0) : 0

  if (!hasParentId) {
    return filterAndPage(MC_COMMITTEES, search, page, perPage)
  }

  if (!parentId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'parentId is required',
    })
  }

  const config = useRuntimeConfig()
  const endpoint = config.expaEndpoint || 'https://gis-api.aiesec.org/graphql'
  const token = config.expaAccessToken || config.expaAnalyticsAccessToken || ''
  if (!token || token.trim().length === 0) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Missing EXPA access token',
    })
  }
  const scheme =
    typeof config.expaAuthScheme === 'string' ? config.expaAuthScheme.trim() : ''

  const committees = await fetchSubOffices({
    parentId,
    token,
    endpoint,
    scheme,
  })

  return filterAndPage(committees, search, page, perPage)
})
