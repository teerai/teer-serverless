import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node'
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base'
import { Tracer, trace } from '@opentelemetry/api'
import { TeerExporter } from './exporter'

interface TeerTracerNodeOptions {
  apiKey: string
  debug?: boolean
  flushInterval?: number
}

export class TeerTracerNode {
  private static instance: TeerTracerNode | null = null
  private provider: NodeTracerProvider
  private tracer: Tracer
  private exporter: TeerExporter

  private constructor(options: TeerTracerNodeOptions) {
    const exporter = new TeerExporter({
      apiKey: options.apiKey,
      debug: options.debug,
    })

    this.exporter = exporter

    this.provider = new NodeTracerProvider({
      spanProcessors: [new BatchSpanProcessor(exporter)],
      forceFlushTimeoutMillis: options.flushInterval,
    })
    // Register the provider
    trace.setGlobalTracerProvider(this.provider)

    // this.provider.register();

    this.tracer = this.provider.getTracer('ai')
  }

  public static getInstance(options: TeerTracerNodeOptions): TeerTracerNode {
    if (!TeerTracerNode.instance) {
      TeerTracerNode.instance = new TeerTracerNode(options)
    }
    return TeerTracerNode.instance
  }

  public getTracer(): Tracer {
    return this.tracer
  }

  // TODO: Implement some upsert logic for spans which takes in an ai sdk response
  // public upsertAiSdkResponse(response: any): void {
  //   const spansArray = Array.isArray(spans) ? spans : [spans];
  //   this.exporter.export(spansArray, (result) => {});
  // }

  public async shutdown(): Promise<void> {
    await this.provider.shutdown()
    TeerTracerNode.instance = null
  }
}
