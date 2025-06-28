// gemini-live-audio.ts
import WebSocket from 'ws';
import * as recorder from 'node-record-lpcm16';
import Speaker = require('speaker');
import { EventEmitter } from 'events';
import { PassThrough } from 'stream';
import * as fs from 'fs/promises';

interface GeminiSetupMessage {
    setup: {
        model: string;
        generation_config: {
            responseModalities: string[];
        };
    };
}

interface GeminiAudioInput {
    realtime_input: {
        media_chunks: Array<{
            mimeType: string;
            data: string;
        }>;
    };
}

interface GeminiResponse {
    serverContent?: {
        generationComplete?: boolean;

        modelTurn?: {
            parts: Array<{
                inlineData?: {
                    mimeType: string;
                    data: string;
                };
                text?: string;
            }>;
        };
    };
    setupComplete?: boolean;
}

class GeminiLiveAudio extends EventEmitter {
    private apiKey: string;
    private websocket: WebSocket | null = null;
    private recording: any = null;
    private speaker: Speaker | null = null;
    private isConnected: boolean = false;
    private isRecording: boolean = false;
    private currentAudio: string = "";


    constructor(apiKey: string) {
        super();
        this.apiKey = apiKey;
    }

    async startLiveSession(): Promise<void> {
        try {
            console.log('Starting Gemini Live session...');

            // Connect to Gemini Live API
            await this.connectToGemini();

            // Wait for connection to be established
            await this.waitForConnection();

            // Start recording audio
            this.startRecording();

            console.log('Live session started successfully!');
        } catch (error) {
            console.error('Failed to start live session:', error);
            throw error;
        }
    }
    private async connectToGemini(): Promise<void> {
        const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${this.apiKey}`;

        console.log(`Connecting to WebSocket at: ${wsUrl}`);
        this.websocket = new WebSocket(wsUrl);

        this.websocket.on('open', () => {
            console.log('Connected to Gemini Live API');
            this.sendSetupMessage();
        });

        this.websocket.on('message', (data: WebSocket.Data) => {
            console.log('Received message:', data.toString());
            try {
                const response: GeminiResponse = JSON.parse(data.toString());
                this.handleGeminiResponse(response);
            } catch (error) {
                console.error('Error parsing Gemini response:', error);
            }
        });

        this.websocket.on('error', (error) => {
            console.error('WebSocket error:', error);
            this.emit('error', error);
        });

        this.websocket.on('close', () => {
            console.log('WebSocket connection closed');
            this.isConnected = false;
            this.stopRecording();
        });
    }
    private sendSetupMessage(): void {
        if (!this.websocket) return;

        const setupMessage: GeminiSetupMessage = {
            setup: {
                model: 'models/gemini-2.0-flash-live-001',
                generation_config: {
                    responseModalities: ['AUDIO']
                }
            }
        };

        this.websocket.send(JSON.stringify(setupMessage));
    }

    private async waitForConnection(): Promise<void> {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Connection timeout'));
            }, 30000);

            const checkConnection = () => {
                if (this.isConnected) {
                    clearTimeout(timeout);
                    resolve();
                } else {
                    setTimeout(checkConnection, 100);
                }
            };

            checkConnection();
        });
    }

    private startRecording(): void {
        if (this.isRecording) return;

        console.log('Starting audio recording...');

        // Configure recording settings for Raspberry Pi compatibility
        const recordingOptions = {
            sampleRateHertz: 16000,
            threshold: 0.5,
            verbose: false,
            recordProgram: 'sox', // Use arecord for better Raspberry Pi support
            silence: '1.0',
            device: null // Let it auto-detect the microphone
        };

        this.recording = recorder.record(recordingOptions);
        this.isRecording = true;

        this.recording.stream().on('data', (chunk: Buffer) => {
            this.sendAudioChunk(chunk);
        });

        this.recording.stream().on('error', (error: Error) => {
            console.error('Recording error:', error);
            this.emit('error', error);
        });
    }

    private sendAudioChunk(audioBuffer: Buffer): void {
        if (!this.websocket || this.websocket.readyState !== WebSocket.OPEN) {
            return;
        }

        const base64Audio = audioBuffer.toString('base64');

        const audioMessage: GeminiAudioInput = {
            realtime_input: {
                media_chunks: [{
                    mimeType: 'audio/pcm',
                    data: base64Audio
                }]
            }
        };

        this.websocket.send(JSON.stringify(audioMessage));
    }

    private async handleGeminiResponse(response: GeminiResponse): Promise<void> {
        if (response.setupComplete) {
            console.log('Setup completed');
            this.isConnected = true; // Set the flag to true
            return;
        }

        if (response.serverContent?.generationComplete) {
            await this.playAudioResponse(this.currentAudio);
        }
        if (response.serverContent?.modelTurn) {
            const parts = response.serverContent.modelTurn.parts;

            parts.forEach(async part => {
                if (part.inlineData?.mimeType === 'audio/pcm;rate=24000') {
                    console.log('Received audio response');

                    this.currentAudio += part.inlineData.data;

                }


                if (part.text) {
                    console.log('Gemini text response:', part.text);
                }
            });
        }
    }

    private async playAudioResponse(base64AudioData: string): Promise<void> {
        return new Promise((resolve, reject) => {
            try {
                const audioBuffer = Buffer.from(base64AudioData, 'base64');
                console.log(`Playing audio chunk of length: ${audioBuffer.length}`);

                if (audioBuffer.length === 0) {
                    console.error('Audio buffer is empty!');
                    resolve();
                    return;
                }

                const speaker = new Speaker({
                    channels: 1,
                    bitDepth: 16,
                    sampleRate: 24000
                });

                speaker.on('close', () => {
                    console.log('Audio playback finished');
                    this.currentAudio = "";
                    resolve();
                });

                speaker.on('error', (error) => {
                    console.error('Speaker error:', error);
                    reject(error);
                });

                speaker.write(audioBuffer);
                speaker.end();

            } catch (error) {
                console.error('Error playing audio response:', error);
                reject(error);
            }
        });
    }


    private async saveOutputText(text: string): Promise<void> {

        const timestamp = Date.now();
        const content = text;
        const filePath = `output-${timestamp}.txt`;
        try {

            await fs.appendFile(filePath, content, 'utf8');
            console.log('Output text saved to', filePath);
        } catch (err) {
            console.error('Error saving output text:', err);
        }
    }
    // private async playAudioResponse(base64AudioData: string): Promise<void> {
    //     return new Promise((resolve, reject) => {
    //         try {
    //             const audioBuffer = Buffer.from(base64AudioData, 'base64');
    //             console.log(`Playing audio chunk of length: ${audioBuffer.length}`);

    //             const passThrough = new PassThrough();
    //             if (!this.speaker) {
    //                 this.speaker = new Speaker({
    //                     channels: 1,
    //                     bitDepth: 16,
    //                     sampleRate: 24000,
    //                 });
    //             }

    //             // Pipe the PassThrough stream into the speaker.
    //             passThrough.pipe(this.speaker, { end: false });

    //             // Write the buffer to the stream and end it.
    //             passThrough.end(audioBuffer, () => {
    //                 // Optionally, wait a little bit for playback 
    //                 // by listening to the speaker's close or other events.
    //                 resolve();
    //             });

    //             passThrough.on('error', (err) => {
    //                 reject(err);
    //             });
    //         } catch (error) {
    //             console.error('Error playing audio response:', error);
    //             reject(error);
    //         }
    //     });
    // }
    // private playAudioResponse(base64AudioData: string): void {
    //     try {
    //         const audioBuffer = Buffer.from(base64AudioData, 'base64');
    //         console.log(`Received audio chunk of length: ${audioBuffer.length}`);

    //         // If there is no audioStream, create one and pipe it to the speaker.
    //         if (!this.audioStream) {
    //             this.audioStream = new PassThrough();

    //             // Create speaker instance if it doesn't exist
    //             if (!this.speaker) {
    //                 this.speaker = new Speaker({
    //                     channels: 1,
    //                     bitDepth: 16,
    //                     sampleRate: 24000,
    //                 });

    //                 // Pipe the audio stream into the speaker for continuous playback.
    //                 this.audioStream.pipe(this.speaker);
    //             }
    //         }

    //         // Push incoming chunk into the PassThrough stream.
    //         this.audioStream.write(audioBuffer);
    //     } catch (error) {
    //         console.error('Error playing audio response:', error);
    //     }
    // }

    stopRecording(): void {
        if (this.recording && this.isRecording) {
            console.log('Stopping recording...');
            this.recording.stop();
            this.isRecording = false;
        }
    }

    disconnect(): void {
        this.stopRecording();

        if (this.websocket) {
            this.websocket.close();
            this.websocket = null;
        }

        if (this.speaker) {
            this.speaker.end();
            this.speaker = null;
        }
    }
}

export default GeminiLiveAudio;