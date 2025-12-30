import { createError } from 'h3'

const RAW_SCHEME_ALIASES = new Set(['', 'raw', 'none', 'no', 'false', '0'])

function normalizeScheme(value: unknown) {
  if (typeof value !== 'string') return 'Bearer'
  const trimmed = value.trim()
  if (!trimmed) return ''
  const lower = trimmed.toLowerCase()
  if (RAW_SCHEME_ALIASES.has(lower)) return ''
  return trimmed
}

function stripKnownScheme(token: string) {
  const lower = token.toLowerCase()
  if (lower.startsWith('bearer ')) return token.slice(7).trim()
  if (lower.startsWith('token ')) return token.slice(6).trim()
  return token
}

function buildAuthValue(token: string, schemeValue: unknown) {
  const trimmedToken = token.trim()
  const scheme = normalizeScheme(schemeValue)

  if (!scheme) {
    const rawToken = stripKnownScheme(trimmedToken)
    if (!rawToken) {
      throw createError({
        statusCode: 500,
        statusMessage: 'EXPA access token is empty after normalization',
      })
    }
    return rawToken
  }

  const lowerToken = trimmedToken.toLowerCase()
  if (lowerToken.startsWith('bearer ') || lowerToken.startsWith('token ')) {
    return trimmedToken
  }

  return `${scheme} ${trimmedToken}`
}

export function getExpaConfig() {
  const config = useRuntimeConfig()
  const endpoint = config.expaEndpoint || 'https://gis-api.aiesec.org/graphql'
  const token = config.expaAccessToken

  if (!token || typeof token !== 'string' || token.trim().length === 0) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Missing EXPA access token',
    })
  }

  const authHeader =
    typeof config.expaAuthHeader === 'string' && config.expaAuthHeader.trim()
      ? config.expaAuthHeader.trim()
      : 'Authorization'

  return {
    endpoint,
    headers: {
      'Content-Type': 'application/json',
      [authHeader]: buildAuthValue(token, config.expaAuthScheme),
    },
  }
}
