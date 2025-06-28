import Speaker = require('speaker');

class StreamingAudioPlayer {
  private speaker: Speaker | null = null;
  private audioQueue: Buffer[] = [];
  private isPlaying = false;

  constructor() {
    this.initializeSpeaker();
  }

  private initializeSpeaker(): void {
    this.speaker = new Speaker({
      channels: 1,
      bitDepth: 16,
      sampleRate: 24000
    });

    this.speaker.on('error', (error) => {
      console.error('Speaker error:', error);
      this.reinitializeSpeaker();
    });

    this.speaker.on('drain', () => {
      // Speaker is ready for more data
      this.processQueue();
    });
  }

  private reinitializeSpeaker(): void {
    this.speaker = null;
    this.isPlaying = false;
    setTimeout(() => this.initializeSpeaker(), 100);
  }

  private processQueue(): void {
    if (!this.speaker || this.audioQueue.length === 0) {
      this.isPlaying = false;
      return;
    }

    const chunk = this.audioQueue.shift();
    if (chunk) {
      const success = this.speaker.write(chunk);
      if (!success) {
        // Speaker buffer is full, wait for drain event
        this.isPlaying = true;
      } else {
        // Continue processing queue
        setImmediate(() => this.processQueue());
      }
    }
  }

  addAudioChunk(base64AudioData: string): void {
    try {
      const audioBuffer = Buffer.from(base64AudioData, 'base64');
      
      if (audioBuffer.length === 0) {
        console.warn('Audio buffer is empty, skipping');
        return;
      }

      this.audioQueue.push(audioBuffer);
      
      if (!this.isPlaying) {
        this.processQueue();
      }
    } catch (error) {
      console.error('Error adding audio chunk:', error);
    }
  }

  finish(): void {
    // Wait for queue to empty, then end
    const checkQueue = () => {
      if (this.audioQueue.length === 0 && this.speaker) {
        this.speaker.end();
        this.speaker = null;
      } else {
        setTimeout(checkQueue, 50);
      }
    };
    checkQueue();
  }
}

// // Usage
// const streamingPlayer = new StreamingAudioPlayer();

// async function main() {
//   try {
//     // Add chunks as they become available
//     const chunk1 = await getFromFile("data1.txt");
//     streamingPlayer.addAudioChunk(chunk1);
    
//     // Simulate receiving more chunks over time
//     setTimeout(async () => {
//       const chunk2 = await getFromFile("data2.txt");
//       streamingPlayer.addAudioChunk(chunk2);
//     }, 10);
    
//     setTimeout(async () => {
//       const chunk3 = await getFromFile("data3.txt");
//       streamingPlayer.addAudioChunk(chunk3);
//       streamingPlayer.finish();
//     }, 20);
    
//   } catch (error) {
//     console.error('Main error:', error);
//   }
// }