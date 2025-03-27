import type { ReadableSpan, SpanExporter } from '@opentelemetry/sdk-trace-base'
import type { ExportResult } from '@opentelemetry/core'
import type { TeerEdgeExporterOptions } from '~/types'
import { CODE } from '~/const'

/**
 * OpenTelemetry span exporter optimized for Edge environments.
 *
 * - Queue: ordered span queue between exports with size limits to prevent memory issues
 * - Batches: Groups spans into right-sized batches for efficient network usage
 * - Flush on interval: flushes queued spans rather than waiting for export calls
 * - Shutdown: Ensures pending spans are sent before termination
 * - Errors: Failed batches are re-queued while maintaining span order
 * - Concurrency: Prevents overlapping flushes and network race conditions
 */
export class TeerEdgeExporter implements SpanExporter {
  private readonly endpoint: string
  private readonly apiKey?: string
  private readonly debug: boolean
  private readonly batchSize: number
  private readonly flushInterval: number
  private readonly fetchImpl: typeof fetch
  private readonly onExport: (spans: ReadableSpan[]) => void = () => {}

  private spanQueue: ReadableSpan[] = []
  private flushIntervalId: ReturnType<typeof setInterval> | null = null
  private activeFlush: Promise<void> | null = null
  private isShuttingDown = false

  private readonly sdkVersion: string
  private readonly otelVersion: string

  private static readonly MAX_QUEUE_SIZE = 1000
  private static readonly DEFAULT_FLUSH_INTERVAL = 5000
  private static readonly DEFAULT_BATCH_SIZE = 10

  constructor(options: TeerEdgeExporterOptions) {
    this.endpoint = options.endpoint
    this.apiKey = options.apiKey
    this.debug = options.debug ?? false
    this.batchSize = options.batchSize ?? TeerEdgeExporter.DEFAULT_BATCH_SIZE
    this.flushInterval = options.flushInterval ?? TeerEdgeExporter.DEFAULT_FLUSH_INTERVAL
    this.fetchImpl = options.customFetch ?? fetch
    this.onExport = options.onExport ?? (() => {})
    this.sdkVersion = options.sdkVersion
    this.otelVersion = options.otelVersion

    this.startFlushInterval()
    this.logDebug('TeerEdgeExporter initialized:', this.endpoint)
  }

  private startFlushInterval(): void {
    if (this.flushIntervalId === null && !this.isShuttingDown) {
      this.flushIntervalId = setInterval(() => {
        if (this.spanQueue.length > 0 && !this.activeFlush) {
          this.flush().catch((err) => {
            this.logDebug('Error during scheduled flush', err)
          })
        }
      }, this.flushInterval)
    }
  }

  async export(spans: ReadableSpan[], resultCallback: (result: ExportResult) => void): Promise<void> {
    this.logDebug('Queueing spans for export', spans.length)

    try {
      this.onExport(spans)
      this.spanQueue.push(...spans)

      // Trim queue if it exceeds max size
      if (this.spanQueue.length > TeerEdgeExporter.MAX_QUEUE_SIZE) {
        this.spanQueue = this.spanQueue.slice(-TeerEdgeExporter.MAX_QUEUE_SIZE)
        this.logDebug('Queue exceeded max size, trimming older spans')
      }

      resultCallback({ code: CODE.SUCCESS })
    } catch (error) {
      this.logDebug('Export error', error)
      resultCallback({
        code: CODE.ERROR,
        error: error instanceof Error ? error : new Error(String(error)),
      })
    }
  }

  private async flush(): Promise<void> {
    if (this.spanQueue.length === 0 || this.activeFlush) {
      return
    }

    const batchesToProcess = this.createBatches(this.spanQueue, this.batchSize)
    this.spanQueue = []

    try {
      this.activeFlush = this.processBatches(batchesToProcess)
      await this.activeFlush
    } finally {
      this.activeFlush = null
    }
  }

  private async processBatches(batches: ReadableSpan[][]): Promise<void> {
    for (const batch of batches) {
      try {
        await this.sendBatch(batch)
      } catch (error) {
        this.logDebug('Batch export failed, re-queueing spans', error)
        // Re-queue failed spans at the start to maintain order
        this.spanQueue.unshift(...batch)
        throw error
      }
    }
  }

  async shutdown(): Promise<void> {
    this.logDebug('Shutting down exporter')
    this.isShuttingDown = true

    if (this.flushIntervalId) {
      clearInterval(this.flushIntervalId)
      this.flushIntervalId = null
    }

    // Wait for active flush and process remaining spans
    if (this.activeFlush) {
      await this.activeFlush
    }
    await this.flush()
  }

  async forceFlush(): Promise<void> {
    this.logDebug('Force flushing exporter')

    if (this.activeFlush) {
      await this.activeFlush
    }

    await this.flush()
  }

  private async sendBatch(spans: ReadableSpan[]): Promise<void> {
    const payload = this.convertSpansToPayload(spans)
    this.logDebug(`Sending batch to ${this.endpoint}`, spans.length)

    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    }

    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`
    }

    const response = await this.fetchImpl(this.endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({ spans: payload }),
    })

    if (!response.ok) {
      const errorText = await response.json()
      throw new Error(`Failed to export spans: ${response.status} ${JSON.stringify(errorText, null, 2)}`)
    }

    this.logDebug('Successfully exported batch', spans.length)
  }

  private createBatches(spans: ReadableSpan[], batchSize: number): ReadableSpan[][] {
    const batches: ReadableSpan[][] = []
    for (let i = 0; i < spans.length; i += batchSize) {
      batches.push(spans.slice(i, i + batchSize))
    }
    return batches
  }

  private convertSpansToPayload(spans: ReadableSpan[]): any[] {
    return spans.map((span) => {
      const context = span.spanContext()

      return {
        sdkVersion: this.sdkVersion,
        otelVersion: this.otelVersion,
        name: span.name,
        kind: span.kind,
        startTime: span.startTime,
        endTime: span.endTime,
        status: span.status,
        attributes: span.attributes,
        links: span.links,
        events: span.events,
        duration: span.duration,
        ended: span.ended,
        instrumentationScope: span.instrumentationScope,
        droppedAttributesCount: span.droppedAttributesCount,
        droppedEventsCount: span.droppedEventsCount,
        droppedLinksCount: span.droppedLinksCount,
        parentSpanContext: span.parentSpanContext,
        spanContext: {
          spanId: context.spanId,
          traceId: context.traceId,
          traceFlags: context.traceFlags,
        },
      }
    })
  }

  private logDebug(message: string, ...args: any[]): void {
    if (!this.debug) return
    console.log(`[${new Date().toISOString()}] [TeerEdgeExporter v${this.sdkVersion}] ${message}`, ...args)
  }
}
