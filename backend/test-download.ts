import { downloadVideo } from './src/utils/youtubeDl';
import path from 'path';
import fs from 'fs';

// Create a temp directory if it doesn't exist
const tempDir = path.join(process.cwd(), 'temp');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

const testUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'; // A well-known video that should be available
const outputPath = path.join(tempDir, `test-video-${Date.now()}`);

console.log('Starting test download...');
console.log('Output path:', outputPath);

downloadVideo(testUrl, {
  output: outputPath,
  format: 'mp4',
  downloadOptions: {
    start_time: 30,
    duration: 10
  }
})
.then(() => {
  console.log('Download completed successfully!');
  console.log('Output file exists:', fs.existsSync(`${outputPath}.mp4`));
})
.catch((error) => {
  console.error('Download failed:', error);
})
.finally(() => {
  console.log('Test completed');
}); 