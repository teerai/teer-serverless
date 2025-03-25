import type { ReadableSpan, SpanExporter } from '@opentelemetry/sdk-trace-base'
import type { ExportResult } from '@opentelemetry/core'
import { getTeerEndpoint } from './const'

interface TelemetryOptions {
  apiKey?: string
  endpoint?: string
  debug?: boolean
  flushInterval?: number
  sdkIntegration?: string
}

type SerializableSpan = Omit<ReadableSpan, 'spanContext' | 'resource'> & {
  spanContext: {
    spanId: string
    traceId: string
    traceFlags: number
  }
}

function reduceSpansUsage(spans: SerializableSpan[]) {
  return spans.reduce(
    (memo, span) => {
      memo.input += Number(span.attributes['gen_ai.usage.input_tokens']) || 0
      memo.output += Number(span.attributes['gen_ai.usage.output_tokens']) || 0

      return memo
    },
    {
      input: 0,
      output: 0,
      total: 0,
    }
  )
}

export class TeerExporter implements SpanExporter {
  private static instance: TeerExporter | null = null
  private readonly debug: boolean = false
  private readonly apiKey?: string
  private readonly endpoint: string = getTeerEndpoint()

  private readonly flushInterval: number = 5000
  private readonly MAX_QUEUE_SIZE = 1000

  private spanQueue: SerializableSpan[] = []
  private flushIntervalId: ReturnType<typeof setInterval> | null = null
  private isShuttingDown = false
  private activeFlush: Promise<void> | null = null

  constructor(options: TelemetryOptions = {}) {
    if (TeerExporter.instance) {
      return TeerExporter.instance
    }

    this.debug = options.debug ?? false
    this.apiKey = options.apiKey
    this.flushInterval = options.flushInterval ?? 5000

    this.startFlushInterval()
    TeerExporter.instance = this

    this.logDebug('TeerExporter initialized')
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

  private async flush(): Promise<void> {
    if (this.spanQueue.length === 0 || this.activeFlush) {
      return
    }

    const spans = this.spanQueue.slice(0, this.MAX_QUEUE_SIZE)
    this.spanQueue = this.spanQueue.slice(spans.length)

    this.logDebug(`Flushing ${spans.length} spans`)

    try {
      this.activeFlush = this.sendSpans(spans)
      await this.activeFlush
    } finally {
      this.activeFlush = null
    }
  }

  private async sendSpans(spans: SerializableSpan[]): Promise<void> {
    if (!this.apiKey) {
      throw new Error('API key is required')
    }

    if (this.debug) {
      const usage = reduceSpansUsage(spans)
      this.logDebug(`📊 Model usage stats: ${usage.input} input + ${usage.output} output = ${usage.total} total tokens`)
    }

    try {
      this.logDebug(`Spans: ${JSON.stringify(spans, null, 2)}`)

      console.info(
        'spans.request',
        JSON.stringify(
          {
            url: this.endpoint,
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${this.apiKey}`,
            },
            spans: spans.length,
          },
          null,
          2
        )
      )

      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({ spans }),
      })

      console.log('response.ok?', response.ok)
      if (!response.ok) {
        const errorResponse = await response.json()
        this.logDebug(`Error flushing spans`, JSON.stringify(errorResponse, null, 2))

        throw new Error(`HTTP error: ${response.status} ${errorResponse.message}`)
      }

      this.logDebug(`Successfully flushed ${spans.length} spans`)
    } catch (error) {
      this.logDebug('Error flushing spans, will retry in next flush cycle', error)
      // Put spans back in the queue
      this.spanQueue = [...spans, ...this.spanQueue]
      throw error
    }
  }

  private enqueueSerializableSpans(spans: ReadableSpan[]): void {
    for (const span of spans) {
      const context = span.spanContext()

      this.spanQueue.push({
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
        // Note: resource has some subkeys which are not serializable but we could prune them and use the string values?
        // resource: span.resource,
        instrumentationScope: span.instrumentationScope,
        droppedAttributesCount: span.droppedAttributesCount,
        droppedEventsCount: span.droppedEventsCount,
        droppedLinksCount: span.droppedLinksCount,
        // Context add-ons
        parentSpanContext: span.parentSpanContext,
        spanContext: {
          spanId: context.spanId,
          traceId: context.traceId,
          traceFlags: context.traceFlags,
        },
      })
    }
  }

  async export(spans: ReadableSpan[], resultCallback: (result: ExportResult) => void): Promise<void> {
    this.logDebug(`Exporting ${spans.length} spans`)

    try {
      this.enqueueSerializableSpans(spans)

      resultCallback({ code: 0 })
    } catch (error) {
      this.logDebug('Error exporting spans', error)
      resultCallback({
        code: 1,
        error: error instanceof Error ? error : new Error('Unknown error exporting spans'),
      })
    }
  }

  async shutdown(): Promise<void> {
    this.logDebug('Shutting down')
    this.isShuttingDown = true

    if (this.flushIntervalId) {
      clearInterval(this.flushIntervalId)
      this.flushIntervalId = null
    }

    // Wait for any active flush to complete and flush remaining spans
    if (this.activeFlush) {
      await this.activeFlush
    }
    await this.flush()

    TeerExporter.instance = null
  }

  async forceFlush(): Promise<void> {
    this.logDebug('Force flushing spans')

    if (this.activeFlush) {
      await this.activeFlush
    }

    await this.flush()
  }

  private logDebug(message: string, ...args: any[]): void {
    if (!this.debug) return
    console.log(`[${new Date().toISOString()}] [TeerExporter] ${message}`, ...args)
  }
}
