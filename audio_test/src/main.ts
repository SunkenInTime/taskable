import * as readline from 'readline';
import Speaker = require('speaker');
import * as fs from 'fs/promises';

async function playAudioResponse(base64AudioData: string): Promise<void> {
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

async function main() {
    try {
        const text = await getFromFile("data.txt");
        await playAudioResponse(text);
        console.log('Audio playback complete');
    } catch (error) {
        console.error('Main error:', error);
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
async function getFromFile(filePath: string): Promise<string> {
    try {
        const fileContent: string = await fs.readFile(filePath, { encoding: 'utf8' });
        return fileContent;
    } catch (error) {
        console.error(`Failed to read file "${filePath}":`, error);
        throw error; // Re-throw to propagate the error
    }
}
main().catch(console.error);
