import { defineConfig } from 'tsup'

export default defineConfig((options) => {
  const isProd = options.env?.NODE_ENV === 'production'

  return {
    entry: ['src/index.ts'],
    format: ['cjs', 'esm'],
    dts: true,
    splitting: false,
    sourcemap: !isProd, // Sourcemaps in dev only
    clean: true,
    target: 'node14',
    minify: isProd, // Minify in prod
    treeshake: isProd, // Treeshake in prod
    external: [
      '@opentelemetry/api',
      '@opentelemetry/instrumentation',
      '@opentelemetry/sdk-trace-base',
      '@opentelemetry/sdk-trace-node',
      '@opentelemetry/sdk-trace-web',
    ],
  }
})
