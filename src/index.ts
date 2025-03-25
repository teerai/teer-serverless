import { BasicTracerProvider, BatchSpanProcessor } from '@opentelemetry/sdk-trace-base'
import { Tracer, trace } from '@opentelemetry/api'
import { TeerExporter } from './exporter'
import { version } from '../package.json'

interface TeerTracerEdgeOptions {
  apiKey: string
  debug?: boolean
  flushInterval?: number
}

export class TeerTracerEdge {
  private static instance: TeerTracerEdge | null = null
  private provider: BasicTracerProvider
  private tracer: Tracer
  private exporter: TeerExporter
  // Add version as a static property
  public static readonly version: string = version

  private constructor(options: TeerTracerEdgeOptions) {
    // Create and configure the exporter
    const exporter = new TeerExporter({
      apiKey: options.apiKey,
      debug: options.debug,
      sdkVersion: TeerTracerEdge.version,
    })
    this.exporter = exporter

    // Add the exporter to the provider
    this.provider = new BasicTracerProvider({
      spanProcessors: [new BatchSpanProcessor(exporter)],
      forceFlushTimeoutMillis: options.flushInterval,
    })

    // Register the provider
    trace.setGlobalTracerProvider(this.provider)

    // Get the tracer
    this.tracer = this.provider.getTracer('ai')
  }

  public static getInstance(options: TeerTracerEdgeOptions): TeerTracerEdge {
    if (!TeerTracerEdge.instance) {
      TeerTracerEdge.instance = new TeerTracerEdge(options)
    }
    return TeerTracerEdge.instance
  }

  public getTracer(): Tracer {
    return this.tracer
  }

  public async shutdown(): Promise<void> {
    await this.provider.shutdown()
    TeerTracerEdge.instance = null
  }
}
