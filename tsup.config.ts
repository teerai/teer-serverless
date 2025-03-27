import { defineConfig } from 'tsup'

export default defineConfig((options) => {
  const isProd = process.env.NODE_ENV === 'production'
  const nodeEnv = process.env.NODE_ENV || 'development'

  return {
    entry: ['src/index.ts'],
    format: ['cjs', 'esm'],
    dts: true,
    splitting: false,
    sourcemap: !isProd,
    clean: true,
    target: 'node14',
    minify: isProd,
    treeshake: isProd,
    define: {
      'process.env.NODE_ENV': JSON.stringify(nodeEnv),
    },
    external: [
      '@opentelemetry/api',
      '@opentelemetry/instrumentation',
      '@opentelemetry/sdk-trace-base',
      '@opentelemetry/sdk-trace-node',
      '@opentelemetry/sdk-trace-web',
    ],
  }
})
