declare module 'ffprobe' {
  interface FFprobeStream {
    codec_type: string;
    width?: number;
    height?: number;
    channels?: number;
    sample_rate?: number;
    [key: string]: any;
  }

  interface FFprobeResult {
    streams: FFprobeStream[];
    format?: {
      duration?: string;
      [key: string]: any;
    };
    [key: string]: any;
  }

  function ffprobe(path: string, options?: { path: string }): Promise<FFprobeResult>;
  export = ffprobe;
} 