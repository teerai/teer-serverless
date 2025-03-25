import { Tracer } from '@opentelemetry/api';

interface TeerTracerEdgeOptions {
    apiKey: string;
    debug?: boolean;
    flushInterval?: number;
}
declare class TeerTracerEdge {
    private static instance;
    private provider;
    private tracer;
    private exporter;
    private constructor();
    static getInstance(options: TeerTracerEdgeOptions): TeerTracerEdge;
    getTracer(): Tracer;
    shutdown(): Promise<void>;
}

export { TeerTracerEdge };
