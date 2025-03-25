// src/index.ts
import { BasicTracerProvider, BatchSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { trace } from "@opentelemetry/api";

// src/const.ts
var getTeerEndpoint = () => {
  return `http://track.teer.ai${process.env.NODE_ENV === "development" ? ":5171" : ""}/v1/spans/bulk`;
};

// src/exporter.ts
function reduceSpansUsage(spans) {
  return spans.reduce(
    (memo, span) => {
      memo.input += Number(span.attributes["gen_ai.usage.input_tokens"]) || 0;
      memo.output += Number(span.attributes["gen_ai.usage.output_tokens"]) || 0;
      return memo;
    },
    {
      input: 0,
      output: 0,
      total: 0
    }
  );
}
var _TeerExporter = class _TeerExporter {
  constructor(options = {}) {
    this.debug = false;
    this.endpoint = getTeerEndpoint();
    this.flushInterval = 5e3;
    this.MAX_QUEUE_SIZE = 1e3;
    this.spanQueue = [];
    this.flushIntervalId = null;
    this.isShuttingDown = false;
    this.activeFlush = null;
    if (_TeerExporter.instance) {
      return _TeerExporter.instance;
    }
    this.debug = options.debug ?? false;
    this.apiKey = options.apiKey;
    this.flushInterval = options.flushInterval ?? 5e3;
    this.startFlushInterval();
    _TeerExporter.instance = this;
    this.logDebug("TeerExporter initialized");
  }
  startFlushInterval() {
    if (this.flushIntervalId === null && !this.isShuttingDown) {
      this.flushIntervalId = setInterval(() => {
        if (this.spanQueue.length > 0 && !this.activeFlush) {
          this.flush().catch((err) => {
            this.logDebug("Error during scheduled flush", err);
          });
        }
      }, this.flushInterval);
    }
  }
  async flush() {
    if (this.spanQueue.length === 0 || this.activeFlush) {
      return;
    }
    const spans = this.spanQueue.slice(0, this.MAX_QUEUE_SIZE);
    this.spanQueue = this.spanQueue.slice(spans.length);
    this.logDebug(`Flushing ${spans.length} spans`);
    try {
      this.activeFlush = this.sendSpans(spans);
      await this.activeFlush;
    } finally {
      this.activeFlush = null;
    }
  }
  async sendSpans(spans) {
    if (!this.apiKey) {
      throw new Error("API key is required");
    }
    const usage = reduceSpansUsage(spans);
    this.logDebug(`\u{1F4CA} Model usage stats: ${usage.input} input + ${usage.output} output = ${usage.total} total tokens`);
    try {
      this.logDebug(`Spans: ${JSON.stringify(spans, null, 2)}`);
      console.info(
        "spans.request",
        JSON.stringify(
          {
            url: this.endpoint,
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${this.apiKey}`
            },
            spans: spans.length
          },
          null,
          2
        )
      );
      const response = await fetch(this.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({ spans })
      });
      console.log("response.ok?", response.ok);
      if (!response.ok) {
        const errorResponse = await response.json();
        this.logDebug(`Error flushing spans`, JSON.stringify(errorResponse, null, 2));
        throw new Error(`HTTP error: ${response.status} ${errorResponse.message}`);
      }
      this.logDebug(`Successfully flushed ${spans.length} spans`);
    } catch (error) {
      this.logDebug("Error flushing spans, will retry in next flush cycle", error);
      this.spanQueue = [...spans, ...this.spanQueue];
      throw error;
    }
  }
  enqueueSerializableSpans(spans) {
    for (const span of spans) {
      const context = span.spanContext();
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
          traceFlags: context.traceFlags
        }
      });
    }
  }
  async export(spans, resultCallback) {
    this.logDebug(`Exporting ${spans.length} spans`);
    try {
      this.enqueueSerializableSpans(spans);
      resultCallback({ code: 0 });
    } catch (error) {
      this.logDebug("Error exporting spans", error);
      resultCallback({
        code: 1,
        error: error instanceof Error ? error : new Error("Unknown error exporting spans")
      });
    }
  }
  async shutdown() {
    this.logDebug("Shutting down");
    this.isShuttingDown = true;
    if (this.flushIntervalId) {
      clearInterval(this.flushIntervalId);
      this.flushIntervalId = null;
    }
    if (this.activeFlush) {
      await this.activeFlush;
    }
    await this.flush();
    _TeerExporter.instance = null;
  }
  async forceFlush() {
    this.logDebug("Force flushing spans");
    if (this.activeFlush) {
      await this.activeFlush;
    }
    await this.flush();
  }
  logDebug(message, ...args) {
    if (!this.debug) return;
    console.log(`[${(/* @__PURE__ */ new Date()).toISOString()}] [TeerExporter] ${message}`, ...args);
  }
};
_TeerExporter.instance = null;
var TeerExporter = _TeerExporter;

// src/index.ts
var _TeerTracerEdge = class _TeerTracerEdge {
  constructor(options) {
    const exporter = new TeerExporter({
      apiKey: options.apiKey,
      debug: options.debug
    });
    this.exporter = exporter;
    this.provider = new BasicTracerProvider({
      spanProcessors: [new BatchSpanProcessor(exporter)],
      forceFlushTimeoutMillis: options.flushInterval
    });
    trace.setGlobalTracerProvider(this.provider);
    this.tracer = this.provider.getTracer("ai");
  }
  static getInstance(options) {
    if (!_TeerTracerEdge.instance) {
      _TeerTracerEdge.instance = new _TeerTracerEdge(options);
    }
    return _TeerTracerEdge.instance;
  }
  getTracer() {
    return this.tracer;
  }
  async shutdown() {
    await this.provider.shutdown();
    _TeerTracerEdge.instance = null;
  }
};
_TeerTracerEdge.instance = null;
var TeerTracerEdge = _TeerTracerEdge;
export {
  TeerTracerEdge
};
//# sourceMappingURL=index.mjs.map