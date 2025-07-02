import { GoogleGenAI, LiveServerMessage, Modality, Session } from '@google/genai';
import * as recorder from 'node-record-lpcm16';
import Speaker = require('speaker');
import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import StreamingAudioPlayer from './streaming-speaker';
import { Blob } from 'fetch-blob';

class GeminiLiveAudio extends EventEmitter {
    private apiKey: string;
    private session: Session | null = null;
    private recording: any = null;
    private speaker: Speaker | null = null;
    private isConnected: boolean = false;
    private isRecording: boolean = false;
    private currentAudio: string = "";
    private streamingPlayer = new StreamingAudioPlayer();
    private model: string = "gemini-2.0-flash-live-001";
    private ai = new GoogleGenAI({
        apiKey: "Placeholder",
        apiVersion: "v1alpha",
    })
    constructor(apiKey: string) {
        super();
        this.apiKey = apiKey;
    }

    async startLiveSession(): Promise<void> {

        try {
            this.session = await this.ai.live.connect({
                model: this.model, config: {
                    responseModalities: [Modality.AUDIO],
                },
                callbacks: {
                    onopen: () => {
                        console.log('Connected to Gemini Live API');

                    },
                    onmessage: async (data: LiveServerMessage): Promise<void> => {
                        console.log('Received message:', data.toString());
                        try {
                            await this.handleGeminiResponse(data);
                        } catch (error) {
                            console.error('Error parsing Gemini response:', error);
                        }
                    },
                    onerror: (error: Error) => {
                        console.error('WebSocket error:', error);
                        this.emit('error', error);
                    },
                    onclose: () => {
                        console.log('WebSocket connection closed');
                        this.isConnected = false;
                        this.stopRecording();
                    }
                }
            })

            await this.waitForConnection();

            this.startRecording();
        } catch (e) {

        }

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
    private async handleGeminiResponse(response: LiveServerMessage): Promise<void> {
        if (response.setupComplete) {
            console.log('Setup completed');
            this.isConnected = true; // Set the flag to true
            return;
        }
        if (response.serverContent?.interrupted) {
            this.forceReset();
        }
        // Handle generation complete - finish the current audio stream
        if (response.serverContent?.generationComplete) {
            console.log('Generation complete, finishing audio stream');
            this.streamingPlayer.finish();

            // Create a new streaming player for the next response
            setTimeout(() => {
                this.streamingPlayer = new StreamingAudioPlayer();
            }, 100);
            return;
        }

        if (response.serverContent?.modelTurn) {
            const parts = response.serverContent.modelTurn.parts!;

            parts.forEach(async part => {
                if (part.inlineData?.mimeType === 'audio/pcm;rate=24000') {
                    console.log('Received audio response');
                    this.streamingPlayer.addAudioChunk(part.inlineData.data!);
                    // this.currentAudio += part.inlineData.data;

                }


                if (part.text) {
                    console.log('Gemini text response:', part.text);
                }
            });
        }
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
        if (!this.session) {
            return;
        }

        const base64Audio = audioBuffer.toString('base64');
        this.session.sendRealtimeInput(
            {
                audio: {
                    data: base64Audio,
                    mimeType: 'audio/pcm',
                }
            }
        )
    }
    stopRecording(): void {
        if (this.recording && this.isRecording) {
            console.log('Stopping recording...');
            this.recording.stop();
            this.isRecording = false;
        }
    }

    disconnect(): void {
        this.stopRecording();

        if (this.session) {
            this.session.close();
            this.session = null;
        }

        if (this.speaker) {
            this.speaker.end();
            this.speaker = null;
        }
    }

    public forceReset(): void {
        console.log('Force resetting audio system - creating new player instance');

        // Deactivate the current player
        this.streamingPlayer.deactivate();

        // Create a completely new instance
        this.streamingPlayer = new StreamingAudioPlayer();

        console.log('New audio player instance created');
    }
}
export default GeminiLiveAudio;
