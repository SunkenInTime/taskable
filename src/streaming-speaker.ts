import Speaker = require('speaker');

class StreamingAudioPlayer {
    private speaker: Speaker | null = null;
    private audioQueue: Buffer[] = [];
    private isPlaying = false;
    private isProcessing = false; // Add this to prevent race conditions

    constructor() {
        this.initializeSpeaker();
    }

    private initializeSpeaker(): void {
        this.speaker = new Speaker({
            channels: 1,
            bitDepth: 16,
            sampleRate: 24000,
        });

        this.speaker.on('error', (error) => {
            console.error('Speaker error:', error);
            this.reinitializeSpeaker();
        });

        this.speaker.on('drain', () => {
            // Speaker is ready for more data - continue processing queue
            console.log('Speaker drained, continuing queue processing');
            this.isPlaying = false; // Reset the flag
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
        setTimeout(() => this.initializeSpeaker(), 100);
    }

    private processQueue(): void {
        // Prevent multiple simultaneous processing
        if (this.isProcessing || !this.speaker || this.audioQueue.length === 0) {
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
                    // Speaker buffer is full, wait for drain event
                    console.log('Speaker buffer full, waiting for drain');
                    this.isPlaying = true;
                } else {
                    // Successfully wrote, continue with next chunk
                    this.isPlaying = true;
                    setImmediate(() => {
                        this.isProcessing = false;
                        this.processQueue();
                    });
                    return;
                }
            } catch (error) {
                console.error('Error writing to speaker:', error);
                this.reinitializeSpeaker();
            }
        }

        this.isProcessing = false;
    }

    addAudioChunk(base64AudioData: string): void {
        try {
            const audioBuffer = Buffer.from(base64AudioData, 'base64');

            if (audioBuffer.length === 0) {
                console.warn('Audio buffer is empty, skipping');
                return;
            }

            console.log(`Adding audio chunk of ${audioBuffer.length} bytes to queue`);
            this.audioQueue.push(audioBuffer);

            // Start processing if not already playing
            if (!this.isPlaying && !this.isProcessing) {
                this.processQueue();
            }
        } catch (error) {
            console.error('Error adding audio chunk:', error);
        }
    }

    finish(): void {
        console.log('Finishing audio playback...');

        // Wait for queue to empty, then end
        const checkQueue = () => {
            if (this.audioQueue.length === 0 && this.speaker && !this.isProcessing) {
                console.log('Queue empty, ending speaker');
                this.speaker.end();
                this.speaker = null;
                this.isPlaying = false;
                this.isProcessing = false;
            } else {
                setTimeout(checkQueue, 50);
            }
        };

        checkQueue();
    }

    // Add method to clear queue if needed
    clearQueue(): void {
        this.audioQueue = [];
        this.isPlaying = false;
        this.isProcessing = false;
    }

    // Add method to check current state
    getStatus(): { queueLength: number; isPlaying: boolean; isProcessing: boolean } {
        return {
            queueLength: this.audioQueue.length,
            isPlaying: this.isPlaying,
            isProcessing: this.isProcessing,
        };
    }
}

export default StreamingAudioPlayer;