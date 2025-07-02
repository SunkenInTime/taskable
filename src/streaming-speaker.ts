import Speaker = require('speaker');

class StreamingAudioPlayer {
    private speaker: Speaker | null = null;
    private audioQueue: Buffer[] = [];
    private isPlaying = false;
    private isProcessing = false;
    private finishCheckInterval: NodeJS.Timeout | null = null;
    private isActive = true; // Flag to indicate if this instance should play audio

    constructor() {
        this.initializeSpeaker();
    }

    private initializeSpeaker(): void {
        if (!this.isActive) return; // Don't initialize if this instance is inactive

        this.speaker = new Speaker({
            channels: 1,
            bitDepth: 16,
            sampleRate: 24000,
        });

        this.speaker.on('error', (error) => {
            console.error('Speaker error:', error);
            if (this.isActive) {
                this.reinitializeSpeaker();
            }
        });

        this.speaker.on('drain', () => {
            if (!this.isActive) return; // Ignore if inactive
            console.log('Speaker drained, continuing queue processing');
            this.isPlaying = false;
            this.processQueue();
        });

        this.speaker.on('close', () => {
            console.log('Speaker closed');
            this.isPlaying = false;
            this.isProcessing = false;
        });
    }

    private reinitializeSpeaker(): void {
        if (this.speaker) {
            this.speaker.removeAllListeners();
        }
        this.speaker = null;
        this.isPlaying = false;
        this.isProcessing = false;
        if (this.isActive) {
            setTimeout(() => this.initializeSpeaker(), 100);
        }
    }

    private processQueue(): void {
        if (!this.isActive || this.isProcessing || !this.speaker || this.audioQueue.length === 0) {
            if (this.audioQueue.length === 0) {
                this.isPlaying = false;
            }
            return;
        }

        this.isProcessing = true;

        const chunk = this.audioQueue.shift();
        if (chunk) {
            console.log(`Processing audio chunk of ${chunk.length} bytes`);

            try {
                const success = this.speaker.write(chunk);

                if (!success) {
                    console.log('Speaker buffer full, waiting for drain');
                    this.isPlaying = true;
                } else {
                    this.isPlaying = true;
                    setImmediate(() => {
                        this.isProcessing = false;
                        this.processQueue();
                    });
                    return;
                }
            } catch (error) {
                console.error('Error writing to speaker:', error);
                if (this.isActive) {
                    this.reinitializeSpeaker();
                }
            }
        }

        this.isProcessing = false;
    }

    addAudioChunk(base64AudioData: string): void {
        if (!this.isActive) {
            console.log('Ignoring audio chunk - player is inactive');
            return;
        }

        try {
            const audioBuffer = Buffer.from(base64AudioData, 'base64');

            if (audioBuffer.length === 0) {
                console.warn('Audio buffer is empty, skipping');
                return;
            }

            console.log(`Adding audio chunk of ${audioBuffer.length} bytes to queue`);
            this.audioQueue.push(audioBuffer);

            if (!this.isPlaying && !this.isProcessing) {
                this.processQueue();
            }
        } catch (error) {
            console.error('Error adding audio chunk:', error);
        }
    }

    // Deactivate this instance - it will ignore all future audio
    deactivate(): void {
        console.log('Deactivating audio player instance');
        this.isActive = false;
        this.clearQueue();

        if (this.finishCheckInterval) {
            clearTimeout(this.finishCheckInterval);
            this.finishCheckInterval = null;
        }

        if (this.speaker) {
            try {
                this.speaker.removeAllListeners();
                this.speaker.end();
            } catch (error) {
                console.warn('Error ending speaker during deactivation:', error);
            }
            this.speaker = null;
        }
    }

    clearQueue(): void {
        console.log('Clearing audio queue');
        this.audioQueue = [];
        this.isPlaying = false;
        this.isProcessing = false;
    }

    finish(): void {
        if (!this.isActive) return;

        console.log('Finishing audio playback...');

        if (this.finishCheckInterval) {
            clearTimeout(this.finishCheckInterval);
        }

        const checkQueue = () => {
            if (!this.isActive) return; // Stop checking if deactivated

            if (this.audioQueue.length === 0 && this.speaker && !this.isProcessing) {
                console.log('Queue empty, ending speaker');
                try {
                    this.speaker.end();
                } catch (error) {
                    console.warn('Error ending speaker in finish:', error);
                }
                this.speaker = null;
                this.isPlaying = false;
                this.isProcessing = false;
                this.finishCheckInterval = null;
            } else {
                this.finishCheckInterval = setTimeout(checkQueue, 50);
            }
        };

        this.finishCheckInterval = setTimeout(checkQueue, 50);
    }

    isFinishing(): boolean {
        return this.finishCheckInterval !== null;
    }

    getStatus(): {
        queueLength: number;
        isPlaying: boolean;
        isProcessing: boolean;
        isFinishing: boolean;
        isActive: boolean;
    } {
        return {
            queueLength: this.audioQueue.length,
            isPlaying: this.isPlaying,
            isProcessing: this.isProcessing,
            isFinishing: this.isFinishing(),
            isActive: this.isActive,
        };
    }
}

export default StreamingAudioPlayer;