
<template>
  <div class="page">
    <header class="hero">
      <div class="hero__content">
        <p class="eyebrow">AIESEC Exchange Intelligence</p>
        <h1>Exchange Pulse</h1>
        <p class="subtitle">
          Time series insights across the exchange funnel with a focus on
          monthly volume and trends.
        </p>
        <div class="hero__meta">
          <span class="chip">AIESEC Analytics API</span>
          <span class="chip">UTC Timeline</span>
          <span class="chip">Updated {{ lastUpdatedLabel }}</span>
          <span v-if="responseMeta?.cached" class="chip chip--accent">
            Cached {{ cacheAgeLabel }}
          </span>
          <span v-else-if="responseMeta?.fetchMs" class="chip chip--accent">
            Fetched in {{ fetchDurationLabel }}
          </span>
          <span v-if="responseMeta?.mode" class="chip">
            Mode {{ responseMeta.mode }}
          </span>
          <span v-if="isLoading" class="chip chip--loading">
            Loading {{ loadingElapsedLabel }}
          </span>
          <span v-if="cachePreviewNote" class="chip chip--muted">
            {{ cachePreviewNote }}
          </span>
        </div>
      </div>
      <div class="hero__actions">
        <button
          class="btn btn--primary"
          type="button"
          :disabled="isLoading"
          @click="loadData"
        >
          Refresh data
        </button>
        <button
          class="btn btn--ghost"
          type="button"
          :disabled="isLoading"
          @click="resetFilters"
        >
          Reset filters
        </button>
        <button
          v-if="isLoading"
          class="btn btn--ghost btn--danger"
          type="button"
          @click="cancelLoad"
        >
          Cancel
        </button>
      </div>
    </header>

    <section v-if="isLoading" class="loading-banner">
      <div>
        <strong>Fetching analytics</strong>
        <p>{{ loadingMessage }}</p>
        <small v-if="loadingWarning">{{ loadingWarning }}</small>
      </div>
      <div class="loading-banner__meta">
        <span>{{ loadingElapsedLabel }}</span>
        <span>{{ loadingProgress }}%</span>
      </div>
      <div class="loading-bar">
        <span :style="{ width: `${loadingProgress}%` }" />
      </div>
    </section>

    <div class="layout">
      <aside class="panel">
        <div class="panel__header">
          <h2>Filters</h2>
          <p>Target programme, committee, and timeline slices.</p>
        </div>

        <form class="panel__form" @submit.prevent="loadData">
          <label class="field">
            <span>Start date</span>
            <input v-model="filters.startDate" type="date" required />
          </label>
          <label class="field">
            <span>End date</span>
            <input v-model="filters.endDate" type="date" required />
          </label>
          <label class="field">
            <span>Programmes</span>
            <select v-model="filters.programmes" multiple size="3">
              <option
                v-for="programme in programmeOptions"
                :key="programme.id"
                :value="programme.id"
              >
                {{ programme.label }}
              </option>
            </select>
            <small v-if="programmeLoading">Loading programmes...</small>
            <small v-else-if="!programmeOptions.length">No programmes available.</small>
            <small v-else>{{ filters.programmes.length }} selected</small>
          </label>
          <label class="field">
            <span>Country MC</span>
            <input
              v-model="countrySearch"
              type="text"
              placeholder="Search country MC"
            />
            <select v-model="selectedCountryId" size="6">
              <option
                v-for="country in countryOptions"
                :key="country.id"
                :value="country.id"
              >
                {{ country.label }}
              </option>
            </select>
            <small v-if="countryLoading">Loading countries...</small>
            <small v-else>{{ countryPaging.totalItems }} countries</small>
            <button
              v-if="countryPaging.page < countryPaging.totalPages"
              class="btn btn--ghost btn--inline"
              type="button"
              @click="loadMoreCountries"
            >
              Load more
            </button>
          </label>
          <label class="field">
            <span>Local committees</span>
            <input
              v-model="committeeSearch"
              type="text"
              placeholder="Search local committees"
            />
            <select v-model="filters.committees" multiple size="6">
              <option
                v-for="committee in committeeOptions"
                :key="committee.id"
                :value="committee.id"
              >
                {{ committee.label }}
              </option>
            </select>
            <small v-if="committeeLoading">Loading committees...</small>
            <small v-else-if="!selectedCountryId">
              Select a country to load suboffices.
            </small>
            <small v-else-if="committeeSearch.trim().length === 0">
              Showing {{ committeeOptions.length }} committees.
            </small>
            <small v-else>{{ committeeOptions.length }} results</small>
            <button
              v-if="committeePaging.page < committeePaging.totalPages"
              class="btn btn--ghost btn--inline"
              type="button"
              @click="loadMoreSuboffices"
            >
              Load more
            </button>
          </label>
          <p v-if="filterError" class="field-error">{{ filterError }}</p>

          <div class="field">
            <span>Statuses</span>
            <div class="status-grid">
              <label
                v-for="status in statusOptions"
                :key="status.key"
                class="status-pill"
              >
                <input
                  v-model="filters.statuses"
                  type="checkbox"
                  :value="status.key"
                />
                <span :style="{ backgroundColor: status.color }" />
                {{ status.label }}
              </label>
            </div>
          </div>

          <details class="advanced">
            <summary>Advanced filters</summary>
            <div class="advanced__content">
              <label class="field">
                <span>Metric</span>
                <select v-model="filters.metric">
                  <option value="applications">Applications (doc_count)</option>
                  <option value="applicants">Unique applicants</option>
                </select>
              </label>
              <label class="field">
                <span>Direction</span>
                <select v-model="filters.direction">
                  <option value="o">Outgoing (o)</option>
                  <option value="i">Incoming (i)</option>
                </select>
              </label>
              <label class="field">
                <span>Focus status</span>
                <select v-model="filters.focusStatus">
                  <option
                    v-for="status in statusOptions"
                    :key="status.key"
                    :value="status.key"
                  >
                    {{ status.label }}
                  </option>
                </select>
              </label>
              <label class="field">
                <span>Committee scope</span>
                <select v-model="filters.committeeScope">
                  <option value="opportunity">Host LC (opportunity)</option>
                  <option value="person">Home LC (person)</option>
                </select>
              </label>
              <label class="field">
                <span>Moving average window</span>
                <input
                  v-model.number="filters.movingAverageWindow"
                  type="range"
                  min="2"
                  max="6"
                />
                <small>{{ filters.movingAverageWindow }} months</small>
              </label>
              <label class="toggle">
                <input v-model="filters.normalize" type="checkbox" />
                Normalize to monthly % share
              </label>
              <label class="toggle">
                <input v-model="filters.showMovingAverage" type="checkbox" />
                Overlay moving average
              </label>
              <label class="toggle">
                <input v-model="filters.fastMode" type="checkbox" />
                Fast mode (single request)
              </label>
              <label class="field">
                <span>Max months to fetch</span>
                <input v-model.number="filters.maxMonths" type="number" min="1" max="24" />
                <small>Leave empty to fetch the full range.</small>
              </label>
            </div>
          </details>

          <button
            class="btn btn--primary btn--full"
            type="submit"
            :disabled="isLoading"
          >
            Apply filters
          </button>
        </form>
      </aside>

      <main class="content">
        <p v-if="isLoading && data" class="refresh-note">
          Refreshing data, showing last results.
        </p>
        <section class="stats-grid">
          <article
            v-for="status in selectedStatusOptions"
            :key="status.key"
            class="stat-card"
            :class="{ 'stat-card--loading': isLoading && !data }"
            :style="{ '--accent-color': status.color }"
          >
            <div class="stat-card__accent" />
            <div class="stat-card__content">
              <div class="stat-card__head">
                <p class="stat-card__label">{{ status.label }}</p>
                <span class="stat-card__dot" />
              </div>
              <p class="stat-card__value">
                {{ formatNumber(totals[status.key] ?? 0) }}
              </p>
              <p class="stat-card__meta">
                {{ statusSummaryLabel(status.key) }}
              </p>
            </div>
          </article>
        </section>

        <section class="chart-card">
          <header class="chart-card__header">
            <div>
              <h3>Exchange trends</h3>
              <p>
                Monthly volume for selected statuses.
                <span v-if="filters.normalize">Normalized to % share.</span>
              </p>
            </div>
            <div class="legend">
              <span
                v-for="status in selectedStatusOptions"
                :key="status.key"
                class="legend__item"
              >
                <span class="legend__swatch" :style="{ background: status.color }" />
                {{ status.label }}
              </span>
            </div>
          </header>

          <div class="chart-wrap">
            <svg
              v-if="chartMonths.length"
              :viewBox="`0 0 ${chartWidth} ${chartHeight}`"
              class="chart"
              role="img"
            >
              <defs>
                <linearGradient id="gridFade" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stop-color="#4e72c9" stop-opacity="0.35" />
                  <stop offset="100%" stop-color="#4e72c9" stop-opacity="0" />
                </linearGradient>
              </defs>
              <rect
                x="0"
                y="0"
                :width="chartWidth"
                :height="chartHeight"
                fill="url(#gridFade)"
                opacity="0.15"
              />

              <g class="grid">
                <line
                  v-for="tick in yTicks"
                  :key="`y-${tick.value}`"
                  :x1="chartPadding.left"
                  :x2="chartWidth - chartPadding.right"
                  :y1="tick.y"
                  :y2="tick.y"
                />
              </g>

              <g class="axis">
                <text
                  v-for="tick in yTicks"
                  :key="`ylabel-${tick.value}`"
                  :x="chartPadding.left - 12"
                  :y="tick.y + 4"
                  text-anchor="end"
                >
                  {{ tick.label }}
                </text>
              </g>

              <g class="axis">
                <text
                  v-for="label in xLabels"
                  :key="`xlabel-${label.index}`"
                  :x="label.x"
                  :y="chartHeight - 12"
                  text-anchor="middle"
                >
                  {{ label.label }}
                </text>
              </g>

              <g class="lines">
                <path
                  v-for="line in trendLines"
                  :key="line.key"
                  :d="line.path"
                  :stroke="line.color"
                />
                <path
                  v-for="avg in movingAverageLines"
                  :key="avg.key"
                  :d="avg.path"
                  :stroke="avg.color"
                  stroke-dasharray="6 6"
                  opacity="0.6"
                />
              </g>
            </svg>
            <div v-else class="empty">
              No data yet. Apply filters to load activity.
            </div>
            <div v-if="isLoading" class="chart-overlay">
              <div class="chart-overlay__content">
                <div class="spinner" />
                <div>
                  <p>Loading analytics</p>
                  <small>{{ loadingMessage }}</small>
                </div>
              </div>
              <div class="loading-bar loading-bar--overlay">
                <span :style="{ width: `${loadingProgress}%` }" />
              </div>
            </div>
          </div>

          <footer class="chart-card__footer">
            <div class="insight">
              <strong>Peak month:</strong>
              <span>{{ peakMonthLabel }}</span>
            </div>
            <div class="insight">
              <strong>Avg window:</strong>
              <span>{{ filters.movingAverageWindow }} months</span>
            </div>
            <div v-if="effectiveRangeLabel" class="insight">
              <strong>Range used:</strong>
              <span>{{ effectiveRangeLabel }}</span>
            </div>
          </footer>
        </section>

        <section v-if="error" class="error-card">
          <strong>Request error</strong>
          <p>{{ error }}</p>
        </section>
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'

type StatusKey =
  | 'applied'
  | 'matched'
  | 'accepted'
  | 'approved'
  | 'realized'
  | 'completed'
  | 'finished'

type MetricKey = 'applications' | 'applicants'

interface AnalyticsResponse {
  months: string[]
  series: Record<StatusKey, number[]>
  totals: Record<StatusKey, number>
  statusSummary: Record<
    StatusKey,
    {
      total_items: number
      total_pages: number
      current_page: number
      fetched_items: number
    }
  >
  inference: {
    movingAverage?: {
      window: number
      series: Record<StatusKey, Array<number | null>>
    }
    momChangePct?: {
      series: Record<StatusKey, Array<number | null>>
    }
    conversionRatePct?: {
      appliedToMatched?: Array<number | null>
      matchedToAccepted?: Array<number | null>
      acceptedToApproved?: Array<number | null>
      approvedToRealized?: Array<number | null>
      realizedToCompleted?: Array<number | null>
    }
  }
  meta?: {
    cached?: boolean
    cacheAgeSeconds?: number
    fetchMs?: number
    mode?: string
    months?: number
    requestedMonths?: number
    effectiveRange?: { startDate?: string; endDate?: string }
    trimmed?: boolean
  }
}

interface StatusOption {
  key: StatusKey
  label: string
  color: string
}

interface FilterOption {
  id: string
  label: string
  shortName?: string
}

const chartWidth = 1000
const chartHeight = 360
const chartPadding = { top: 24, right: 40, bottom: 48, left: 60 }

const statusOptions: StatusOption[] = [
  { key: 'applied', label: 'Applied', color: '#0b2d5b' },
  { key: 'matched', label: 'Matched', color: '#0f3b6f' },
  { key: 'accepted', label: 'Accepted', color: '#12447a' },
  { key: 'approved', label: 'Approved', color: '#1b65b8' },
  { key: 'realized', label: 'Realized', color: '#2c8ad8' },
  { key: 'completed', label: 'Completed', color: '#4bb2f2' },
  { key: 'finished', label: 'Finished', color: '#76d0ff' },
]

const defaultRange = (() => {
  const end = new Date()
  const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 2, 1))
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  }
})()

const filters = reactive({
  startDate: defaultRange.startDate,
  endDate: defaultRange.endDate,
  programmes: ['7'] as string[],
  committees: [] as string[],
  metric: 'applications' as MetricKey,
  direction: 'o' as 'o' | 'i',
  statuses: ['applied', 'matched', 'accepted', 'approved', 'realized'] as StatusKey[],
  focusStatus: 'accepted' as StatusKey,
  committeeScope: 'opportunity' as 'person' | 'opportunity',
  movingAverageWindow: 3,
  normalize: false,
  showMovingAverage: true,
  fastMode: true,
  maxMonths: 3,
})

const programmeOptions = ref<FilterOption[]>([])
const programmeLoading = ref(false)
const countryOptions = ref<FilterOption[]>([])
const countrySearch = ref('')
const countryLoading = ref(false)
const countryPaging = ref({
  page: 1,
  totalPages: 1,
  totalItems: 0,
})
const selectedCountryId = ref('1539')
const committeeOptions = ref<FilterOption[]>([])
const committeeSearch = ref('')
const committeeLoading = ref(false)
const committeePaging = ref({
  page: 1,
  totalPages: 1,
  totalItems: 0,
})
let committeeSearchTimer: ReturnType<typeof setTimeout> | null = null
let countrySearchTimer: ReturnType<typeof setTimeout> | null = null
const filterError = ref<string | null>(null)

const data = ref<AnalyticsResponse | null>(null)
const error = ref<string | null>(null)
const isLoading = ref(false)
const lastUpdated = ref<Date | null>(null)
const loadingElapsed = ref(0)
const cachePreviewNote = ref('')
let loadingTimer: ReturnType<typeof setInterval> | null = null
let activeController: AbortController | null = null

const lastUpdatedLabel = computed(() => {
  if (!lastUpdated.value) return 'Not refreshed'
  return lastUpdated.value.toISOString().replace('T', ' ').slice(0, 16) + ' UTC'
})

const responseMeta = computed(() => data.value?.meta)

const cacheAgeLabel = computed(() => {
  const seconds = responseMeta.value?.cacheAgeSeconds
  if (!seconds && seconds !== 0) return ''
  const minutes = Math.floor(seconds / 60)
  if (minutes > 0) return `${minutes}m ago`
  return `${seconds}s ago`
})

const fetchDurationLabel = computed(() => {
  const fetchMs = responseMeta.value?.fetchMs
  if (!fetchMs && fetchMs !== 0) return ''
  return `${Math.max(1, Math.round(fetchMs / 1000))}s`
})

const loadingElapsedLabel = computed(() => {
  const minutes = Math.floor(loadingElapsed.value / 60)
  const seconds = loadingElapsed.value % 60
  return minutes > 0
    ? `${minutes}m ${String(seconds).padStart(2, '0')}s`
    : `${seconds}s`
})

const monthCount = computed(() => {
  const start = new Date(filters.startDate)
  const end = new Date(filters.endDate)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0
  const months =
    (end.getUTCFullYear() - start.getUTCFullYear()) * 12 +
    (end.getUTCMonth() - start.getUTCMonth()) +
    1
  return Math.max(1, months)
})

const loadingMessage = computed(() => {
  if (!isLoading.value) return ''
  const months = monthCount.value
  const modeLabel = filters.fastMode ? 'single request' : 'monthly requests'
  const suffix = filters.maxMonths ? ` (max ${filters.maxMonths} months)` : ''
  return `Fetching ${months} month${months === 1 ? '' : 's'} via ${modeLabel}${suffix}.`
})

const loadingWarning = computed(() => {
  if (!isLoading.value) return ''
  if (loadingElapsed.value < 20) return ''
  return 'The analytics API can be slow. Thanks for waiting.'
})

const loadingProgress = computed(() => {
  if (!isLoading.value) return 0
  const estimate = Math.max(15, monthCount.value * (filters.fastMode ? 6 : 20))
  const ratio = Math.min(0.95, loadingElapsed.value / estimate)
  return Math.round(ratio * 100)
})

const effectiveRangeLabel = computed(() => {
  const start = responseMeta.value?.effectiveRange?.startDate
  const end = responseMeta.value?.effectiveRange?.endDate
  if (!start || !end) return ''
  return `${start} to ${end}`
})

const selectedStatusOptions = computed(() =>
  statusOptions.filter((status) => filters.statuses.includes(status.key))
)

const chartMonths = computed(() => data.value?.months ?? [])
const rawSeries = computed(() => data.value?.series ?? ({} as Record<StatusKey, number[]>))
const totals = computed(() => data.value?.totals ?? ({} as Record<StatusKey, number>))

const normalizedSeries = computed(() => {
  if (!filters.normalize) return rawSeries.value
  const months = chartMonths.value
  const totalsByMonth = months.map((_, index) =>
    selectedStatusOptions.value.reduce((sum, status) => {
      return sum + (rawSeries.value[status.key]?.[index] ?? 0)
    }, 0)
  )
  return statusOptions.reduce((acc, status) => {
    const series = rawSeries.value[status.key] ?? []
    acc[status.key] = series.map((value, index) => {
      const total = totalsByMonth[index] ?? 0
      if (total === 0) return 0
      return Math.round((value / total) * 10000) / 100
    })
    return acc
  }, {} as Record<StatusKey, number[]>)
})

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

const movingAverageSeries = computed(() => {
  if (!filters.showMovingAverage) return {} as Record<StatusKey, Array<number | null>>
  return statusOptions.reduce((acc, status) => {
    const values = normalizedSeries.value[status.key] ?? []
    acc[status.key] = movingAverage(values, filters.movingAverageWindow)
    return acc
  }, {} as Record<StatusKey, Array<number | null>>)
})

const yMax = computed(() => {
  const values = selectedStatusOptions.value.flatMap((status) => {
    return normalizedSeries.value[status.key] ?? []
  })
  const maxValue = values.length ? Math.max(...values) : 0
  if (filters.normalize) return Math.max(100, maxValue)
  return maxValue === 0 ? 10 : Math.ceil(maxValue * 1.1)
})

const yTicks = computed(() => {
  const ticks = 4
  const maxValue = yMax.value
  const step = maxValue / ticks
  return Array.from({ length: ticks + 1 }, (_, index) => {
    const value = Math.round(step * index * 100) / 100
    const y =
      chartPadding.top +
      ((ticks - index) / ticks) *
        (chartHeight - chartPadding.top - chartPadding.bottom)
    const label = filters.normalize ? `${value}%` : formatNumber(value)
    return { value, y, label }
  })
})

const xLabels = computed(() => {
  const months = chartMonths.value
  if (!months.length) return []
  const labelCount = Math.min(6, months.length)
  const step = Math.ceil(months.length / labelCount)
  return months
    .map((month, index) => ({ month, index }))
    .filter((entry) => entry.index % step === 0 || entry.index === months.length - 1)
    .map((entry) => {
      const x =
        chartPadding.left +
        (entry.index / Math.max(months.length - 1, 1)) *
          (chartWidth - chartPadding.left - chartPadding.right)
      return { index: entry.index, x, label: formatMonth(entry.month) }
    })
})

function buildLinePath(
  values: Array<number | null>,
  min: number,
  max: number,
  height = chartHeight
) {
  const months = chartMonths.value
  if (!months.length) return ''
  const width = chartWidth - chartPadding.left - chartPadding.right
  const heightInner = height - chartPadding.top - chartPadding.bottom
  const range = Math.max(max - min, 1)
  return values
    .map((value, index) => {
      if (value === null || Number.isNaN(value)) return null
      const x = chartPadding.left + (index / Math.max(months.length - 1, 1)) * width
      const y = chartPadding.top + (1 - (value - min) / range) * heightInner
      return `${index === 0 ? 'M' : 'L'}${x},${y}`
    })
    .filter(Boolean)
    .join(' ')
}

const trendLines = computed(() => {
  const maxValue = yMax.value
  return selectedStatusOptions.value.map((status) => {
    const values = normalizedSeries.value[status.key] ?? []
    return {
      key: status.key,
      color: status.color,
      path: buildLinePath(values, 0, maxValue),
    }
  })
})

const movingAverageLines = computed(() => {
  if (!filters.showMovingAverage) return []
  const maxValue = yMax.value
  return selectedStatusOptions.value.map((status) => {
    const values = movingAverageSeries.value[status.key] ?? []
    return {
      key: `${status.key}-avg`,
      color: status.color,
      path: buildLinePath(values, 0, maxValue),
    }
  })
})

const peakMonthLabel = computed(() => {
  const series = rawSeries.value[filters.focusStatus] ?? []
  const months = chartMonths.value
  if (!months.length || !series.length) {
    return 'No data yet'
  }
  const maxValue = Math.max(...series)
  const peakIndex = series.indexOf(maxValue)
  return months[peakIndex] ? formatMonth(months[peakIndex]) : 'Unknown'
})

function parseIdArray(values: string[]): number[] | null {
  const numbers = values
    .map((entry) => Number(entry))
    .filter((entry) => Number.isInteger(entry) && entry > 0)
  return numbers.length ? numbers : null
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(
    value
  )
}

function formatMonth(month: string) {
  const [year, monthPart] = month.split('-')
  if (!year || !monthPart) return month
  const date = new Date(Date.UTC(Number(year), Number(monthPart) - 1, 1))
  return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
}

function statusSummaryLabel(status: StatusKey) {
  const summary = data.value?.statusSummary?.[status]
  if (!summary) return 'No records'
  const label = filters.metric === 'applicants' ? 'people' : 'applications'
  return `${formatNumber(summary.total_items)} ${label}`
}

function buildCacheKey(payload: {
  startDate: string
  endDate: string
  programmes: number[] | null
  officeIds: number[] | null
  metric: string
  direction: string
  fastMode: boolean
  maxMonths: number | null
}) {
  const programmesKey = payload.programmes?.slice().sort().join(',') || 'all'
  const officesKey = payload.officeIds?.slice().sort().join(',') || 'default'
  const maxMonthsKey = payload.maxMonths ? String(payload.maxMonths) : 'all'
  return [
    'analytics',
    payload.startDate,
    payload.endDate,
    programmesKey,
    officesKey,
    payload.metric,
    payload.direction,
    payload.fastMode ? 'single' : 'monthly',
    maxMonthsKey,
  ].join('|')
}

function readCachedResponse(cacheKey: string) {
  if (typeof window === 'undefined') return null
  const raw = window.localStorage.getItem(cacheKey)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as {
      fetchedAt: number
      data: AnalyticsResponse
    }
    if (!parsed?.data) return null
    return parsed
  } catch {
    return null
  }
}

function writeCachedResponse(cacheKey: string, response: AnalyticsResponse) {
  if (typeof window === 'undefined') return
  const payload = JSON.stringify({ fetchedAt: Date.now(), data: response })
  window.localStorage.setItem(cacheKey, payload)
}

function startLoadingTimer() {
  loadingElapsed.value = 0
  if (loadingTimer) clearInterval(loadingTimer)
  loadingTimer = setInterval(() => {
    loadingElapsed.value += 1
  }, 1000)
}

function stopLoadingTimer() {
  if (loadingTimer) clearInterval(loadingTimer)
  loadingTimer = null
  loadingElapsed.value = 0
}

async function loadProgrammes() {
  programmeLoading.value = true
  filterError.value = null
  try {
    const response = await $fetch<{ programmes: FilterOption[] }>(
      '/api/expa/programmes'
    )
    programmeOptions.value = response.programmes ?? []
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Unable to load programmes.'
    filterError.value = message
  } finally {
    programmeLoading.value = false
  }
}

async function loadCountries(page = 1, append = false) {
  countryLoading.value = true
  filterError.value = null
  const queryText = countrySearch.value.trim()
  const shouldFilter = queryText.length > 0
  try {
    const response = await $fetch<{
      items: FilterOption[]
      paging: { current_page: number; total_pages: number; total_items: number }
    }>('/api/expa/committees', {
      query: {
        q: shouldFilter ? queryText : undefined,
        page,
        perPage: 50,
      },
    })
    const items = response.items ?? []
    if (append) {
      const merged = new Map(countryOptions.value.map((item) => [item.id, item]))
      items.forEach((item) => merged.set(item.id, item))
      countryOptions.value = Array.from(merged.values())
    } else {
      countryOptions.value = items
    }
    countryPaging.value = {
      page: response.paging?.current_page ?? page,
      totalPages: response.paging?.total_pages ?? 1,
      totalItems: response.paging?.total_items ?? items.length,
    }
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Unable to load countries.'
    filterError.value = message
  } finally {
    countryLoading.value = false
  }
}

async function loadSuboffices(page = 1, append = false) {
  if (!selectedCountryId.value) {
    committeeOptions.value = []
    committeePaging.value = { page: 1, totalPages: 1, totalItems: 0 }
    return
  }
  committeeLoading.value = true
  filterError.value = null
  const queryText = committeeSearch.value.trim()
  const shouldFilter = queryText.length > 0
  try {
    const response = await $fetch<{
      items: FilterOption[]
      paging: { current_page: number; total_pages: number; total_items: number }
    }>('/api/expa/committees', {
      query: {
        parentId: selectedCountryId.value,
        q: shouldFilter ? queryText : undefined,
        page,
        perPage: 50,
      },
    })
    const items = response.items ?? []
    if (append) {
      const merged = new Map(committeeOptions.value.map((item) => [item.id, item]))
      items.forEach((item) => merged.set(item.id, item))
      committeeOptions.value = Array.from(merged.values())
    } else {
      committeeOptions.value = items
    }
    committeePaging.value = {
      page: response.paging?.current_page ?? page,
      totalPages: response.paging?.total_pages ?? 1,
      totalItems: response.paging?.total_items ?? items.length,
    }
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Unable to load committees.'
    filterError.value = message
  } finally {
    committeeLoading.value = false
  }
}

function loadMoreCountries() {
  const nextPage = countryPaging.value.page + 1
  if (nextPage <= countryPaging.value.totalPages) {
    loadCountries(nextPage, true)
  }
}

function loadMoreSuboffices() {
  const nextPage = committeePaging.value.page + 1
  if (nextPage <= committeePaging.value.totalPages) {
    loadSuboffices(nextPage, true)
  }
}

async function loadData() {
  error.value = null
  isLoading.value = true
  cachePreviewNote.value = ''
  startLoadingTimer()
  if (activeController) {
    activeController.abort()
  }
  activeController = new AbortController()
  try {
    const officeIds =
      parseIdArray(filters.committees) ??
      (selectedCountryId.value ? [Number(selectedCountryId.value)] : null)
    const maxMonths = Number.isFinite(filters.maxMonths)
      ? Math.max(1, Math.floor(filters.maxMonths))
      : null
    const cacheKey = buildCacheKey({
      startDate: filters.startDate,
      endDate: filters.endDate,
      programmes: parseIdArray(filters.programmes),
      officeIds,
      metric: filters.metric,
      direction: filters.direction,
      fastMode: filters.fastMode,
      maxMonths,
    })
    const cached = readCachedResponse(cacheKey)
    if (cached?.data) {
      data.value = cached.data
      lastUpdated.value = new Date(cached.fetchedAt)
      cachePreviewNote.value = 'Showing cached results'
    }
    const response = await $fetch<AnalyticsResponse>('/api/expa/analytics', {
      method: 'POST',
      signal: activeController.signal,
      body: {
        startDate: filters.startDate,
        endDate: filters.endDate,
        programmes: parseIdArray(filters.programmes),
        officeIds,
        metric: filters.metric,
        direction: filters.direction,
        committeeScope: filters.committeeScope,
        singleRequest: filters.fastMode,
        maxMonths,
      },
    })
    data.value = response
    lastUpdated.value = new Date()
    writeCachedResponse(cacheKey, response)
    cachePreviewNote.value = ''
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      error.value = 'Request cancelled.'
    } else {
      const message =
        err instanceof Error ? err.message : 'Unable to load analytics.'
      error.value = message
    }
  } finally {
    isLoading.value = false
    stopLoadingTimer()
    activeController = null
  }
}

function cancelLoad() {
  if (activeController) {
    activeController.abort()
  }
}

function resetFilters() {
  filters.startDate = defaultRange.startDate
  filters.endDate = defaultRange.endDate
  filters.programmes = ['7']
  filters.committees = []
  filters.metric = 'applications'
  filters.direction = 'o'
  filters.statuses = ['applied', 'matched', 'accepted', 'approved', 'realized'] as StatusKey[]
  filters.focusStatus = 'accepted'
  filters.committeeScope = 'opportunity'
  filters.movingAverageWindow = 3
  filters.normalize = false
  filters.showMovingAverage = true
  filters.fastMode = true
  filters.maxMonths = 3
  filterError.value = null
  selectedCountryId.value = '1539'
  countrySearch.value = ''
  countryOptions.value = []
  countryPaging.value = { page: 1, totalPages: 1, totalItems: 0 }
  committeeSearch.value = ''
  committeeOptions.value = []
  committeePaging.value = { page: 1, totalPages: 1, totalItems: 0 }
  loadCountries()
  loadSuboffices()
  loadData()
}

watch(
  () => countrySearch.value,
  () => {
    if (countrySearchTimer) {
      clearTimeout(countrySearchTimer)
    }
    countrySearchTimer = setTimeout(() => {
      loadCountries(1)
    }, 350)
  },
  { flush: 'post' }
)

watch(
  () => committeeSearch.value,
  () => {
    if (committeeSearchTimer) {
      clearTimeout(committeeSearchTimer)
    }
    committeeSearchTimer = setTimeout(() => {
      loadSuboffices(1)
    }, 350)
  },
  { flush: 'post' }
)

watch(
  () => selectedCountryId.value,
  () => {
    filters.committees = []
    committeeSearch.value = ''
    committeeOptions.value = []
    committeePaging.value = { page: 1, totalPages: 1, totalItems: 0 }
    loadSuboffices(1)
  }
)

onMounted(() => {
  loadProgrammes()
  loadCountries()
  loadSuboffices()
  loadData()
})
</script>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&family=Space+Grotesk:wght@300;400;500;600;700&display=swap');

:global(body) {
  margin: 0;
  background: radial-gradient(circle at top left, #eff5ff 0%, #dfe9fb 35%, #f5f8ff 100%);
  color: #0b1526;
  font-family: 'Space Grotesk', sans-serif;
}

:global(*) {
  box-sizing: border-box;
}

.page {
  min-height: 100vh;
  padding: 32px clamp(20px, 4vw, 64px) 64px;
}

.hero {
  display: flex;
  justify-content: space-between;
  gap: 32px;
  align-items: flex-end;
  padding: 32px 32px 40px;
  border-radius: 28px;
  background: linear-gradient(135deg, #0c2347 0%, #123a6b 55%, #1f63b1 100%);
  color: #f5f8ff;
  box-shadow: 0 24px 60px rgba(12, 35, 71, 0.32);
  position: relative;
  overflow: hidden;
}

.hero::after {
  content: '';
  position: absolute;
  right: -120px;
  top: -120px;
  width: 280px;
  height: 280px;
  background: radial-gradient(circle, rgba(255, 255, 255, 0.28) 0%, rgba(255, 255, 255, 0) 70%);
}

.hero__content h1 {
  font-family: 'Playfair Display', serif;
  font-size: clamp(2.4rem, 4vw, 3.6rem);
  margin: 12px 0 12px;
  letter-spacing: 0.5px;
}

.subtitle {
  margin: 0;
  max-width: 520px;
  font-size: 1.05rem;
  line-height: 1.6;
  color: rgba(245, 248, 255, 0.85);
}

.eyebrow {
  margin: 0;
  font-size: 0.9rem;
  letter-spacing: 3px;
  text-transform: uppercase;
  color: rgba(245, 248, 255, 0.7);
}

.hero__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 20px;
}

.chip {
  display: inline-flex;
  align-items: center;
  padding: 6px 12px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.15);
  font-size: 0.85rem;
}

.chip--accent {
  background: rgba(75, 178, 242, 0.2);
  color: #0b1e39;
}

.chip--muted {
  background: rgba(255, 255, 255, 0.2);
  color: rgba(255, 255, 255, 0.8);
}

.chip--loading {
  background: rgba(255, 255, 255, 0.3);
  color: #0b1526;
}

.hero__actions {
  display: flex;
  flex-direction: column;
  gap: 12px;
  z-index: 1;
}

.btn {
  border: none;
  border-radius: 14px;
  padding: 12px 18px;
  font-weight: 600;
  font-size: 0.95rem;
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.btn--primary {
  background: #4bb2f2;
  color: #071225;
  box-shadow: 0 12px 30px rgba(75, 178, 242, 0.35);
}

.btn--ghost {
  background: transparent;
  color: #f5f8ff;
  border: 1px solid rgba(255, 255, 255, 0.3);
}

.btn--danger {
  border-color: rgba(255, 148, 148, 0.7);
  color: #ffe2e2;
}

.btn--inline {
  align-self: flex-start;
  padding: 6px 10px;
  font-size: 0.8rem;
  border-radius: 10px;
  border: 1px solid #c6d5ef;
  color: #1b365d;
}

.btn--full {
  width: 100%;
}

.btn:hover {
  transform: translateY(-2px);
}

.btn:disabled {
  cursor: not-allowed;
  opacity: 0.7;
  transform: none;
}

.layout {
  display: grid;
  grid-template-columns: minmax(240px, 300px) minmax(0, 1fr);
  gap: 28px;
  margin-top: 32px;
  align-items: start;
}

.loading-banner {
  margin-top: 20px;
  padding: 16px 20px;
  border-radius: 18px;
  background: #ffffff;
  box-shadow: 0 12px 32px rgba(12, 35, 71, 0.12);
  display: grid;
  gap: 10px;
}

.loading-banner p {
  margin: 6px 0 4px;
  color: #3e5675;
}

.loading-banner small {
  color: #6a7f9c;
}

.loading-banner__meta {
  display: flex;
  justify-content: space-between;
  color: #1b365d;
  font-weight: 600;
}

.loading-bar {
  height: 8px;
  border-radius: 999px;
  background: #e3ebf8;
  overflow: hidden;
}

.loading-bar span {
  display: block;
  height: 100%;
  width: 0%;
  background: linear-gradient(90deg, #4bb2f2 0%, #1b65b8 100%);
  transition: width 0.4s ease;
}

.panel {
  background: #f9fbff;
  border-radius: 24px;
  padding: 24px;
  box-shadow: 0 12px 40px rgba(15, 42, 85, 0.12);
  position: sticky;
  top: 24px;
  align-self: flex-start;
}

.panel__header h2 {
  margin: 0 0 6px;
  font-family: 'Playfair Display', serif;
}

.panel__header p {
  margin: 0;
  color: #415674;
  font-size: 0.9rem;
}

.panel__form {
  margin-top: 20px;
  display: grid;
  gap: 16px;
}

.field {
  display: grid;
  gap: 8px;
  font-size: 0.9rem;
  color: #2b3d55;
}

.field input,
.field select {
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid #c6d5ef;
  background: #fff;
  font-family: inherit;
  font-size: 0.95rem;
}

.field select[multiple] {
  min-height: 120px;
}

.field small {
  color: #5a6f8b;
}

.field-error {
  margin: 0;
  padding: 10px 12px;
  border-radius: 12px;
  background: #ffeded;
  border: 1px solid #f3b6b6;
  color: #8b2b2b;
  font-size: 0.85rem;
}

.status-grid {
  display: grid;
  gap: 8px;
}

.status-pill {
  display: grid;
  grid-template-columns: 18px 1fr;
  gap: 10px;
  align-items: center;
  font-size: 0.9rem;
  background: #eef4ff;
  padding: 8px 10px;
  border-radius: 12px;
}

.status-pill span {
  width: 14px;
  height: 14px;
  border-radius: 999px;
  display: inline-block;
}

.advanced {
  border-top: 1px solid #d6e3f7;
  padding-top: 12px;
}

.advanced summary {
  cursor: pointer;
  font-weight: 600;
  color: #1b365d;
}

.advanced__content {
  margin-top: 12px;
  display: grid;
  gap: 12px;
}

.toggle {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 0.9rem;
}

.content {
  display: grid;
  gap: 16px;
  align-content: start;
}

.refresh-note {
  margin: 0;
  padding: 12px 16px;
  border-radius: 14px;
  background: #eef4ff;
  color: #304767;
  font-size: 0.9rem;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 16px;
}

.stat-card {
  position: relative;
  overflow: hidden;
  background: linear-gradient(135deg, #ffffff 0%, #f2f6ff 100%);
  border-radius: 20px;
  padding: 16px 18px;
  display: grid;
  grid-template-columns: 10px 1fr;
  gap: 16px;
  aspect-ratio: 2 / 1;
  border: 1px solid rgba(12, 35, 71, 0.06);
  box-shadow: 0 12px 32px rgba(12, 35, 71, 0.1);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.stat-card__accent {
  width: 8px;
  border-radius: 999px;
  background: linear-gradient(180deg, var(--accent-color) 0%, rgba(255, 255, 255, 0.35) 100%);
  box-shadow: 0 0 18px rgba(12, 35, 71, 0.16);
}

.stat-card__content {
  display: grid;
  gap: 8px;
  align-content: center;
}

.stat-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.stat-card__label {
  margin: 0;
  font-size: 0.85rem;
  color: #4f6583;
  text-transform: uppercase;
  letter-spacing: 1.6px;
  font-weight: 600;
}

.stat-card__dot {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  background: var(--accent-color);
  box-shadow: 0 0 0 4px rgba(12, 35, 71, 0.08);
}

.stat-card__value {
  margin: 4px 0;
  font-size: 2rem;
  font-weight: 700;
  color: #0b2d5b;
}

.stat-card__meta {
  margin: 0;
  font-size: 0.82rem;
  color: #2b3d55;
  background: rgba(12, 35, 71, 0.06);
  padding: 6px 10px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  width: fit-content;
}

.stat-card::after {
  content: '';
  position: absolute;
  top: -60px;
  right: -60px;
  width: 160px;
  height: 160px;
  background: radial-gradient(circle, var(--accent-color) 0%, transparent 70%);
  opacity: 0.12;
  pointer-events: none;
}

.stat-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 18px 40px rgba(12, 35, 71, 0.16);
}

.stat-card--loading {
  opacity: 0.65;
}

.chart-card {
  background: #fff;
  border-radius: 24px;
  padding: 24px;
  box-shadow: 0 16px 40px rgba(12, 35, 71, 0.12);
}

.chart-card__header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
}

.chart-card__header h3 {
  margin: 0 0 6px;
  font-family: 'Playfair Display', serif;
}

.chart-card__header p {
  margin: 0;
  color: #4f6583;
  font-size: 0.9rem;
}

.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 16px;
  font-size: 0.85rem;
}

.legend__item {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.legend__swatch {
  width: 10px;
  height: 10px;
  border-radius: 999px;
}

.chart-wrap {
  margin-top: 18px;
  background: linear-gradient(180deg, #f4f8ff 0%, #ffffff 100%);
  border-radius: 18px;
  padding: 16px;
  position: relative;
}

.chart {
  width: 100%;
  height: auto;
}

.grid line {
  stroke: rgba(90, 118, 160, 0.25);
  stroke-width: 1;
}

.axis text {
  fill: #4f6583;
  font-size: 0.8rem;
}

.lines path {
  fill: none;
  stroke-width: 3;
}


.chart-card__footer {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  margin-top: 18px;
  font-size: 0.9rem;
  color: #2b3d55;
}

.insight {
  display: flex;
  gap: 8px;
  align-items: center;
  background: #eef4ff;
  padding: 8px 12px;
  border-radius: 999px;
}


.error-card {
  background: #ffeded;
  border: 1px solid #f3b6b6;
  color: #8b2b2b;
  padding: 16px;
  border-radius: 16px;
}

.empty {
  padding: 24px;
  text-align: center;
  color: #5a6f8b;
}

.chart-overlay {
  position: absolute;
  inset: 16px;
  border-radius: 14px;
  background: rgba(245, 248, 255, 0.92);
  display: grid;
  align-content: center;
  gap: 16px;
  padding: 20px;
  text-align: left;
}

.chart-overlay__content {
  display: flex;
  align-items: center;
  gap: 12px;
  color: #1b365d;
}

.chart-overlay__content p {
  margin: 0;
  font-weight: 600;
}

.chart-overlay__content small {
  color: #5a6f8b;
}

.loading-bar--overlay {
  margin-top: 8px;
}

.spinner {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 2px solid rgba(27, 101, 184, 0.2);
  border-top-color: #1b65b8;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 980px) {
  .layout {
    grid-template-columns: 1fr;
  }

  .panel {
    position: static;
  }

  .hero {
    flex-direction: column;
    align-items: flex-start;
  }

  .hero__actions {
    width: 100%;
    flex-direction: row;
    flex-wrap: wrap;
  }
}

@media (max-width: 640px) {
  .page {
    padding: 20px;
  }

  .hero {
    padding: 24px;
  }

  .hero__actions {
    flex-direction: column;
  }

  .chart-card__header {
    flex-direction: column;
  }
}
</style>
