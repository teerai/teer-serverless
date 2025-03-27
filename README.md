# Teer serverless

[@teerai/serverless](https://www.npmjs.com/package/@teerai/serverless)

## Usage

### Tracer OTel V2

```javascript
const tracer = TeerEdge.getTracer({ apiKey: apiKey.key })
```

```javascript
const tracer = TeerEdge.getTracer({
  apiKey: apiKey.key,
  debug: true,
  customFetch: props.context.cloudflare.env.TEER_TRACK.fetch.bind(props.context.cloudflare.env.TEER_TRACK),
  onExport: (spans) => writeOutSpans(spans, directory, loadContext),
})
```

### Tracer OTel V1

```javascript
const exporter = new CloudflareWorkerExporter({
  endpoint: 'https://internal/v1/spans/bulk',
  apiKey: apiKey.key,
  debug: true,
  customFetch: props.context.cloudflare.env.TEER_TRACK.fetch.bind(props.context.cloudflare.env.TEER_TRACK),
  onExport: (spans) => writeOutSpans(spans, directory, loadContext),
})

const provider = new WebTracerProvider({
  spanProcessors: [new SimpleSpanProcessor(exporter)],
})

// Register the provider
provider.register()

// Get the tracer
const instrumentationScopeName = 'ai-sdk'
const tracer = provider.getTracer(instrumentationScopeName)
```
