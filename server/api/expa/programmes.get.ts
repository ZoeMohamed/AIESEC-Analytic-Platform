import { createError, defineEventHandler } from 'h3'
import { expaFetch } from '../../utils/expaFetch'
import { getExpaConfig } from '../../utils/expaConfig'

const QUERY = /* GraphQL */ `
  query Programmes {
    opportunityDurationTypes {
      programme {
        id
        short_name
        short_name_display
      }
    }
  }
`

export default defineEventHandler(async () => {
  const { endpoint, headers } = getExpaConfig()
  const response = await expaFetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query: QUERY }),
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

  const items = payload?.data?.opportunityDurationTypes ?? []
  const programmes = new Map<
    string,
    { id: string; label: string; shortName?: string }
  >()

  items.forEach((item: any) => {
    const programme = item?.programme
    if (!programme?.id) return
    const id = String(programme.id)
    const label =
      programme.short_name_display ||
      programme.short_name ||
      `Programme ${id}`
    programmes.set(id, {
      id,
      label,
      shortName: programme.short_name ?? undefined,
    })
  })

  return {
    programmes: Array.from(programmes.values()).sort((a, b) =>
      a.label.localeCompare(b.label)
    ),
  }
})
