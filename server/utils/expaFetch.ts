import { createError } from 'h3'

const DEFAULT_CONNECT_TIMEOUT_MS = 30000
const DEFAULT_REQUEST_TIMEOUT_MS = 45000
const DEFAULT_MAX_RETRIES = 1

const RETRYABLE_CODES = new Set([
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_SOCKET',
  'ECONNRESET',
  'ETIMEDOUT',
])

let cachedDispatcher: unknown | null = null
let cachedKey = ''
let undiciUnavailable = false

function toPositiveInt(value: unknown, fallback: number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback
}

function getTimeouts() {
  const config = useRuntimeConfig()
  const connectTimeoutMs = toPositiveInt(
    config.expaConnectTimeoutMs,
    DEFAULT_CONNECT_TIMEOUT_MS
  )
  const requestTimeoutMs = toPositiveInt(
    config.expaRequestTimeoutMs,
    DEFAULT_REQUEST_TIMEOUT_MS
  )
  const maxRetries = toPositiveInt(config.expaMaxRetries, DEFAULT_MAX_RETRIES)
  return { connectTimeoutMs, requestTimeoutMs, maxRetries }
}

async function getDispatcher(connectTimeoutMs: number, requestTimeoutMs: number) {
  const key = `${connectTimeoutMs}:${requestTimeoutMs}`
  if (!cachedDispatcher || cachedKey !== key) {
    if (undiciUnavailable) return null
    try {
      const undici = await import('undici')
      if (!undici?.Agent) {
        undiciUnavailable = true
        return null
      }
      cachedDispatcher = new undici.Agent({
        connectTimeout: connectTimeoutMs,
        headersTimeout: requestTimeoutMs,
        bodyTimeout: requestTimeoutMs,
      })
      cachedKey = key
    } catch {
      undiciUnavailable = true
      return null
    }
  }
  return cachedDispatcher
}

function isRetryableError(error: unknown) {
  if (!error || typeof error !== 'object') return false
  const code = (error as { code?: string }).code
  const name = (error as { name?: string }).name
  if (name === 'AbortError' || name === 'ConnectTimeoutError') return true
  if (code && RETRYABLE_CODES.has(code)) return true
  return false
}

function errorLabel(error: unknown) {
  if (!error || typeof error !== 'object') return 'network error'
  const code = (error as { code?: string }).code
  const name = (error as { name?: string }).name
  return code || name || 'network error'
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function expaFetch(endpoint: string, options: RequestInit) {
  const { connectTimeoutMs, requestTimeoutMs, maxRetries } = getTimeouts()
  const dispatcher = await getDispatcher(connectTimeoutMs, requestTimeoutMs)

  let lastError: unknown
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), requestTimeoutMs)
    try {
      const requestInit = {
        ...options,
        signal: controller.signal,
        ...(dispatcher ? { dispatcher } : {}),
      } as RequestInit
      return await fetch(endpoint, requestInit)
    } catch (error) {
      lastError = error
      if (attempt >= maxRetries || !isRetryableError(error)) {
        break
      }
      await delay(400 * (attempt + 1))
    } finally {
      clearTimeout(timeoutId)
    }
  }

  throw createError({
    statusCode: 504,
    statusMessage: `EXPA request failed (${errorLabel(lastError)}).`,
  })
}
