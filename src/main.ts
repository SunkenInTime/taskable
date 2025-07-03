// main.ts

import * as readline from 'readline';
import * as dotenv from 'dotenv';
import GeminiLiveAudio from './gemini-live-audio';
// import GeminiLiveAudio from './gemini-live-sdk-ver';

dotenv.config(); // Load environment variables from .env file

const API_KEY: string | undefined = process.env.GEMINI_API_KEY; // Replace with your actual API key

async function main() {
    if (!API_KEY) {
        console.error('Error: GEMINI_API_KEY is not set in your .env file.');
        console.error('Please create a .env file with GEMINI_API_KEY=YOUR_KEY');
        process.exit(1); // Exit the application if the key is missing
    }
    const geminiLive = new GeminiLiveAudio(API_KEY);

    // Handle errors
    geminiLive.on('error', (error) => {
        console.error('Gemini Live error:', error);
    });

    // Set up graceful shutdown
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    console.log('Starting Gemini Live Audio...');
    console.log('Press Enter to stop the session.');

    try {
        await geminiLive.startLiveSession();

        rl.question('', () => {
            console.log('Shutting down...');
            geminiLive.disconnect();
            rl.close();
            process.exit(0);
        });

    } catch (error) {
        console.error('Failed to start session:', error);
        process.exit(1);
    }
}

// Handle process termination
process.on('SIGINT', () => {
    console.log('\nReceived SIGINT, shutting down gracefully...');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\nReceived SIGTERM, shutting down gracefully...');
    process.exit(0);
});

main().catch(console.error);