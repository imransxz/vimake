import { spawn } from 'child_process';

// Wrap the download logic in a function so that `url` and `outputPath` are defined
export function downloadVideo(url: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const ytDlp = spawn('yt-dlp', [
      url,
      '-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best',
      '-S', 'res',
      '-o', outputPath
    ]);

    ytDlp.stdout.on('data', data => console.log(`yt-dlp: ${data}`));
    ytDlp.stderr.on('data', data => console.error(`yt-dlp error: ${data}`));

    ytDlp.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`yt-dlp process exited with code ${code}`));
      }
    });
  });
}