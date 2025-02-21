import { motion } from 'framer-motion';
import { useEffect, useRef } from 'react';
import gsap from 'gsap';

interface SubtitleProps {
  text: string;
  style: 'modern' | 'classic' | 'creative';
  isVisible: boolean;
}

export const Subtitles = ({ text, style, isVisible }: SubtitleProps) => {
  const creativeRef = useRef(null);

  useEffect(() => {
    if (style === 'creative' && isVisible) {
      gsap.to(creativeRef.current, {
        y: 0,
        opacity: 1,
        duration: 0.5,
        ease: "power2.out"
      });
    }
  }, [text, style, isVisible]);

  if (!isVisible) return null;

  switch (style) {
    case 'modern':
      return (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          className="absolute bottom-10 left-0 right-0 flex justify-center"
        >
          <div className="bg-black/80 px-6 py-3 rounded-lg max-w-[80%]">
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-white text-xl font-bold text-center"
            >
              {text}
            </motion.p>
          </div>
        </motion.div>
      );

    case 'classic':
      return (
        <div className="absolute bottom-8 left-0 right-0 flex justify-center">
          <div className="text-center">
            <p className="text-white text-lg px-4 py-1" style={{
              textShadow: '2px 2px 0 #000, -2px 2px 0 #000, 2px -2px 0 #000, -2px -2px 0 #000'
            }}>
              {text}
            </p>
          </div>
        </div>
      );

    case 'creative':
      return (
        <div 
          ref={creativeRef}
          className="absolute bottom-12 left-0 right-0 flex justify-center"
          style={{ perspective: '1000px' }}
        >
          <div className="relative">
            {text.split(' ').map((word, i) => (
              <motion.span
                key={i}
                initial={{ opacity: 0, y: 20, rotateX: 90 }}
                animate={{ 
                  opacity: 1, 
                  y: 0, 
                  rotateX: 0,
                  transition: { delay: i * 0.1 }
                }}
                className="inline-block mx-1 px-2 py-1 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-bold rounded"
              >
                {word}
              </motion.span>
            ))}
          </div>
        </div>
      );
  }
}; 