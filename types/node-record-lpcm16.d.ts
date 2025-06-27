declare module 'node-record-lpcm16' {
    interface RecordingOptions {
        sampleRateHertz?: number;
        threshold?: number;
        verbose?: boolean;
        recordProgram?: string;
        silence?: string;
        device?: string | null;
    }

    interface Recording {
        stream(): NodeJS.ReadableStream;
        stop(): void;
    }

    export function record(options?: RecordingOptions): Recording;
}