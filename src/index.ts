import type { ReadableSpan } from '@opentelemetry/sdk-trace-base'
import type { Tracer } from '@opentelemetry/api'
import type { TeerEdgeOptions } from '~/types'

import { WebTracerProvider } from '@opentelemetry/sdk-trace-web'
import { SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base'
import { TeerEdgeExporter } from './exporter'
import { removeTrailingSlash } from './utils'
import { version } from '../package.json'

export class TeerEdge {
  private static instance: TeerEdge | null = null
  private readonly provider: WebTracerProvider
  private readonly tracer: Tracer
  private readonly exporter: TeerEdgeExporter
  private readonly debug: boolean
  private readonly endpoint: string
  private isShuttingDown = false

  public static readonly sdkVersion: string = version
  public static readonly otelVersion: string = '2.0.0'
  public static readonly apiVersion: string = 'v1'
  public static readonly baseURL: string = 'https://track.teer.ai'

  public static readonly instrumentationScopeName: string = 'teer-sdk'

  private constructor(options: TeerEdgeOptions) {
    this.debug = options.debug ?? false
    const baseURL = options.baseURL || TeerEdge.baseURL
    const sanitizedBaseURL = removeTrailingSlash(baseURL)
    const url = new URL(`${sanitizedBaseURL}/${TeerEdge.apiVersion}/spans/bulk`)
    this.endpoint = url.toString()

    this.exporter = new TeerEdgeExporter({
      endpoint: this.endpoint,
      sdkVersion: TeerEdge.sdkVersion,
      otelVersion: TeerEdge.otelVersion,
      apiKey: options.apiKey,
      debug: this.debug,
      flushInterval: options.flushInterval,
      customFetch: options.customFetch,
      onExport: options.onExport,
    })

    this.provider = new WebTracerProvider({
      spanProcessors: [new SimpleSpanProcessor(this.exporter)],
    })

    this.provider.register()

    this.tracer = this.provider.getTracer(TeerEdge.instrumentationScopeName)
  }

  public static getInstance(options: TeerEdgeOptions): TeerEdge {
    if (!TeerEdge.instance) {
      TeerEdge.instance = new TeerEdge(options)
    }
    return TeerEdge.instance
  }

  public static getTracer(options: TeerEdgeOptions): Tracer {
    return TeerEdge.getInstance(options).getTracer()
  }

  public static async forceFlush(): Promise<void> {
    if (!TeerEdge.instance) return
    await TeerEdge.instance.exporter.forceFlush()
  }

  public static async shutdown(): Promise<void> {
    if (!TeerEdge.instance) return

    // Flush any pending spans
    await TeerEdge.forceFlush()

    // Shutdown tracer provider
    await TeerEdge.instance.shutdownProvider()
  }

  public getTracer(): Tracer {
    return this.tracer
  }

  public async shutdownProvider(): Promise<void> {
    if (this.isShuttingDown) {
      this.logDebug('Shutdown already in progress')
      return
    }

    this.isShuttingDown = true

    try {
      await this.provider.shutdown()
      TeerEdge.instance = null
    } finally {
      this.isShuttingDown = false
    }
  }

  private logDebug(message: string, ...args: any[]): void {
    if (!this.debug) return
    console.log(`[${new Date().toISOString()}] [TeerEdge v${TeerEdge.sdkVersion}] ${message}`, ...args)
  }
}

export type { TeerEdgeOptions, ReadableSpan }
