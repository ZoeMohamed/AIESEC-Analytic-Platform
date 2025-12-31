// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  runtimeConfig: {
    expaAccessToken: '',
    expaEndpoint: 'https://gis-api.aiesec.org/graphql',
    expaAuthHeader: 'Authorization',
    expaAuthScheme: 'Bearer',
    expaAnalyticsAccessToken: '',
    expaAnalyticsEndpoint:
      'https://analytics.api.aiesec.org/v2/applications/analyze.json',
    expaAnalyticsDefaultOfficeId: 1539,
    expaConnectTimeoutMs: 30000,
    expaRequestTimeoutMs: 45000,
    expaMaxRetries: 1,
  }
})
