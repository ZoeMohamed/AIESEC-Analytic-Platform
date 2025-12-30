
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
          <span class="chip">EXPA GraphQL</span>
          <span class="chip">UTC Timeline</span>
          <span class="chip">Updated {{ lastUpdatedLabel }}</span>
          <span v-if="isLoading" class="chip chip--loading">Loading</span>
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
      </div>
    </header>

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
            <span>Committees</span>
            <input
              v-model="committeeSearch"
              type="text"
              placeholder="Search committees (2+ chars)"
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
            <small v-else-if="committeeSearch.trim().length < 2">
              Type at least 2 characters to search.
            </small>
            <small v-else>{{ committeeOptions.length }} results</small>
            <button
              v-if="committeePaging.page < committeePaging.totalPages"
              class="btn btn--ghost btn--inline"
              type="button"
              @click="loadMoreCommittees"
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
                <input v-model="filters.fetchAllPages" type="checkbox" />
                Fetch additional pages
              </label>
              <label class="field">
                <span>Max pages (per status)</span>
                <input v-model.number="filters.maxPages" type="number" min="1" max="20" />
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
        <section class="stats-grid">
          <article
            v-for="status in selectedStatusOptions"
            :key="status.key"
            class="stat-card"
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
  | 'accepted'
  | 'approved'
  | 'realized'
  | 'completed'
  | 'finished'

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
      appliedToAccepted: Array<number | null>
      acceptedToApproved: Array<number | null>
      approvedToRealized: Array<number | null>
      realizedToCompleted: Array<number | null>
    }
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
  { key: 'accepted', label: 'Accepted', color: '#12447a' },
  { key: 'approved', label: 'Approved', color: '#1b65b8' },
  { key: 'realized', label: 'Realized', color: '#2c8ad8' },
  { key: 'completed', label: 'Completed', color: '#4bb2f2' },
  { key: 'finished', label: 'Finished', color: '#76d0ff' },
]

const defaultRange = (() => {
  const end = new Date()
  const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 11, 1))
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  }
})()

const filters = reactive({
  startDate: defaultRange.startDate,
  endDate: defaultRange.endDate,
  programmes: [] as string[],
  committees: [] as string[],
  statuses: ['applied', 'accepted', 'approved', 'realized'] as StatusKey[],
  focusStatus: 'accepted' as StatusKey,
  committeeScope: 'opportunity' as 'person' | 'opportunity',
  movingAverageWindow: 3,
  normalize: false,
  showMovingAverage: true,
  fetchAllPages: false,
  maxPages: 5,
})

const programmeOptions = ref<FilterOption[]>([])
const programmeLoading = ref(false)
const committeeOptions = ref<FilterOption[]>([])
const committeeSearch = ref('')
const committeeLoading = ref(false)
const committeePaging = ref({
  page: 1,
  totalPages: 1,
  totalItems: 0,
})
let committeeSearchTimer: ReturnType<typeof setTimeout> | null = null
const filterError = ref<string | null>(null)

const data = ref<AnalyticsResponse | null>(null)
const error = ref<string | null>(null)
const isLoading = ref(false)
const lastUpdated = ref<Date | null>(null)

const lastUpdatedLabel = computed(() => {
  if (!lastUpdated.value) return 'Not refreshed'
  return lastUpdated.value.toISOString().replace('T', ' ').slice(0, 16) + ' UTC'
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
  return `${formatNumber(summary.total_items)} records`
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

async function loadCommittees(page = 1, append = false) {
  committeeLoading.value = true
  filterError.value = null
  const queryText = committeeSearch.value.trim()
  if (!queryText || queryText.length < 2) {
    if (!filters.committees.length) {
      committeeOptions.value = []
    }
    committeePaging.value = {
      page: 1,
      totalPages: 1,
      totalItems: committeeOptions.value.length,
    }
    committeeLoading.value = false
    return
  }
  try {
    const response = await $fetch<{
      items: FilterOption[]
      paging: { current_page: number; total_pages: number; total_items: number }
    }>('/api/expa/committees', {
      query: {
        q: queryText || undefined,
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

function loadMoreCommittees() {
  if (committeeSearch.value.trim().length < 2) return
  const nextPage = committeePaging.value.page + 1
  if (nextPage <= committeePaging.value.totalPages) {
    loadCommittees(nextPage, true)
  }
}

async function loadData() {
  error.value = null
  isLoading.value = true
  try {
    const response = await $fetch<AnalyticsResponse>('/api/expa/analytics', {
      method: 'POST',
      body: {
        startDate: filters.startDate,
        endDate: filters.endDate,
        programmes: parseIdArray(filters.programmes),
        committees: parseIdArray(filters.committees),
        committeeScope: filters.committeeScope,
        fetchAllPages: filters.fetchAllPages,
        maxPages: filters.maxPages,
      },
    })
    data.value = response
    lastUpdated.value = new Date()
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unable to load analytics.'
    error.value = message
  } finally {
    isLoading.value = false
  }
}

function resetFilters() {
  filters.startDate = defaultRange.startDate
  filters.endDate = defaultRange.endDate
  filters.programmes = []
  filters.committees = []
  filters.statuses = ['applied', 'accepted', 'approved', 'realized'] as StatusKey[]
  filters.focusStatus = 'accepted'
  filters.committeeScope = 'opportunity'
  filters.movingAverageWindow = 3
  filters.normalize = false
  filters.showMovingAverage = true
  filters.fetchAllPages = false
  filters.maxPages = 5
  filterError.value = null
  committeeSearch.value = ''
  committeeOptions.value = []
  committeePaging.value = { page: 1, totalPages: 1, totalItems: 0 }
  loadData()
}

watch(
  () => committeeSearch.value,
  (value) => {
    if (committeeSearchTimer) {
      clearTimeout(committeeSearchTimer)
    }
    committeeSearchTimer = setTimeout(() => {
      const query = value.trim()
      if (!query || query.length >= 2) {
        loadCommittees(1)
      }
    }, 350)
  },
  { flush: 'post' }
)

onMounted(() => {
  loadProgrammes()
  loadCommittees()
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
