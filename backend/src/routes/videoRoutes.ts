import { Router } from 'express';
import { convertVideo, getVideoDuration, getShortsHistory, getProgress, streamVideo, downloadVideo } from '../controllers/videoController';
import { ScriptProcessorService } from '../services/scriptProcessor';
import { Request, Response } from 'express';

const router = Router();

router.post('/convert', convertVideo);
router.post('/duration', getVideoDuration);
router.get('/shorts/history', getShortsHistory);
router.get('/progress', getProgress);
router.get('/stream', streamVideo);
router.get('/download', downloadVideo);

router.get('/voices', async (req: Request, res: Response) => {
  try {
    const scriptProcessor = new ScriptProcessorService();
    const voices = await scriptProcessor.getAvailableVoices();
    res.json(voices);
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to fetch voices' 
    });
  }
});

export default router; 