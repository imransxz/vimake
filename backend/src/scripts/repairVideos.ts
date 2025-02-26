import { scanAndRepairVideos } from '../utils/verifyVideo';
import path from 'path';

// Path to the output directory
const outputDir = path.join(__dirname, '../../output');

console.log(`Starting video repair process for directory: ${outputDir}`);

// Run the scan and repair process
scanAndRepairVideos(outputDir)
  .then(() => {
    console.log('Video repair process completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Error during video repair process:', error);
    process.exit(1);
  }); 