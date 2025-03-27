# Teer serverless

[@teerai/serverless](https://www.npmjs.com/package/@teerai/serverless)

## Usage

### AI SDK

```javascript
import { TeerEdge } from '@teerai/serverless'
import { generateText } from 'ai'

const anthropic = createAnthropic({
  apiKey: {{ANTHROPIC_API_KEY}},
})
await generateText({
  model: anthropic('claude-3-haiku-20240307'),
  prompt: "What is the capital of Ireland?",
  /**
   * Telemetry config
   * - enable
   * - pass tracer instance
   */
  experimental_telemetry: {
    isEnabled: true,
    tracer: TeerEdge.getTracer({ apiKey: apiKey.key }),
    functionId: 'test',
    recordInputs: false,
    recordOutputs: false,
  }
})

// Shutdown async after request completes
waitUntil(TeerEdge.shutdown())
```
