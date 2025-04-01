import type { ReadableSpan } from '@opentelemetry/sdk-trace-base'

export interface TeerEdgeOptions {
  /** API key for authentication with Teer backend */
  apiKey: string
  baseURL?: string
  /** Enable debug logging */
  debug?: boolean
  /** Flush interval in ms (default: 5000) */
  flushInterval?: number
  /** Custom fetch implementation */
  customFetch?: typeof fetch
  /** Custom onExport implementation */
  onExport?: (spans: ReadableSpan[]) => void
}

export interface TeerEdgeExporterOptions extends TeerEdgeOptions {
  sdkVersion: string
  otelVersion: string
  endpoint: string
  batchSize?: number
}
