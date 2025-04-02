# Teer Serverless

[@teerai/serverless](https://www.npmjs.com/package/@teerai/serverless) is an OTEL compliant tracer optimized for edge and serverless environments, which tracks operations in the [AI-SDK](https://www.npmjs.com/package/ai) and forwards them to Teer for tracking and analytics.

## Quick Start

```typescript
import { TeerEdge } from '@teerai/serverless'
import { generateText } from 'ai'

const anthropic = createAnthropic({
  apiKey: {{ANTHROPIC_API_KEY}},
})

await generateText({
  model: anthropic('claude-3-haiku-20240307'),
  prompt: 'What is the capital of Ireland?',
  experimental_telemetry: {
    isEnabled: true,
    tracer: TeerEdge.getTracer({ apiKey: {{TEER_SECRET_API_KEY}} }),
    // Unique ID for operation
    functionId: 'test',
    // Opt out / in to tracking the inputs and outputs of your AI-SDK traces
    recordInputs: false,
    recordOutputs: false,
  },
})

// Ensure telemetry is sent before request ends
waitUntil(TeerEdge.forceFlush())
```

## Configuration Options

| Option          | Type                              | Default                 | Description                                          |
| --------------- | --------------------------------- | ----------------------- | ---------------------------------------------------- |
| `apiKey`        | `string`                          | Required                | Authentication key for Teer backend                  |
| `baseURL`       | `string`                          | `https://track.teer.ai` | Custom endpoint for telemetry data                   |
| `debug`         | `boolean`                         | `false`                 | Enables detailed debug logging                       |
| `flushInterval` | `number`                          | `5000`                  | Milliseconds between automatic flush attempts        |
| `customFetch`   | `typeof fetch`                    | `fetch`                 | Custom fetch implementation for special environments |
| `onExport`      | `(spans: ReadableSpan[]) => void` | `undefined`             | Hook called before spans are exported                |

## Flush vs Shutdown

The library provides two methods for ensuring telemetry data is sent:

- `TeerEdge.forceFlush()`: Immediately sends pending spans while keeping the tracer active. Use this when you want to ensure data is sent but expect more telemetry in the future.
- `TeerEdge.shutdown()`: Sends pending spans and closes the tracer. Use this at the end of your application lifecycle when no more telemetry will be generated.

For serverless environments, `forceFlush()` is typically sufficient as the runtime will handle cleanup.

## Best Practices

1. Set appropriate `flushInterval` based on your workload:

- Lower values (1-2s) for burst workloads
- Higher values (5-10s) for steady workloads

2. Enable debug logging during development:

```typescript
TeerEdge.getTracer({
  apiKey: 'your-api-key',
  debug: true,
})
```

3. Use `waitUntil` in edge functions to ensure telemetry is sent:

- [Vercel](https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package#waituntil)

```typescript
export function GET(request: Request) {
  // ... your code ...
  waitUntil(TeerEdge.forceFlush())
  return new Response(`Hello from ${request.url}, I'm a Vercel Function!`)
}
```

- [Cloudflare Workers](https://developers.cloudflare.com/workers/runtime-apis/context/#waituntil)

```typescript
export default {
  async fetch(request, env, ctx) {
    // ... your code ...
    ctx.waitUntil(TeerEdge.forceFlush())

    return res
  },
}
```
