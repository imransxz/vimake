import React from 'react';
import { motion } from 'framer-motion';

interface LoadingPageProps {
  isLoading: boolean;
  steps?: string[];
  currentStep?: number;
  onCancel?: () => void;
}

export const LoadingPage: React.FC<LoadingPageProps> = ({ 
  isLoading, 
  steps = ['Processing video', 'Generating script', 'Creating voiceover', 'Adding subtitles', 'Finalizing'], 
  currentStep = 0,
  onCancel
}) => {
  if (!isLoading) return null;

  return (
    <motion.div 
      className="fixed inset-0 bg-white z-50 flex flex-col"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      {/* Header */}
      <div className="border-b border-gray-100 p-4 flex justify-between items-center">
        <div className="flex items-center">
          <div className="w-8 h-8 rounded-full bg-gradient-to-r from-[#9C92FF] to-[#543CE5] flex items-center justify-center mr-3">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-lg font-semibold text-gray-800">Creating Your Viral Video</h1>
        </div>
        
        {onCancel && (
          <button 
            onClick={onCancel}
            className="text-gray-500 hover:text-gray-700 transition-colors p-2 rounded-full hover:bg-gray-100"
            aria-label="Cancel processing"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
      
      {/* Main content */}
      <div className="flex-1 flex flex-col items-center justify-center p-6">
        {/* Processing animation */}
        <motion.div 
          className="mb-10"
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.5 }}
        >
          <div className="relative w-32 h-32">
            <svg className="w-full h-full" viewBox="0 0 100 100">
              <defs>
                <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#9C92FF" />
                  <stop offset="100%" stopColor="#543CE5" />
                </linearGradient>
              </defs>
              <circle 
                cx="50" 
                cy="50" 
                r="45" 
                fill="none" 
                stroke="#F3F4F6" 
                strokeWidth="8"
              />
              <motion.circle 
                cx="50" 
                cy="50" 
                r="45" 
                fill="none" 
                stroke="url(#gradient)" 
                strokeWidth="8"
                strokeLinecap="round"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: (currentStep + 1) / steps.length }}
                transition={{ duration: 0.5, ease: "easeInOut" }}
                style={{ 
                  rotate: -90,
                  transformOrigin: 'center',
                }}
              />
            </svg>
            
            {/* Pulsing dots in the center */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="flex items-center space-x-2">
                {[0, 1, 2].map((i) => (
                  <motion.div
                    key={i}
                    className="w-3 h-3 rounded-full bg-gradient-to-r from-[#9C92FF] to-[#543CE5]"
                    animate={{ 
                      scale: [0.8, 1.2, 0.8], 
                      opacity: [0.5, 1, 0.5] 
                    }}
                    transition={{
                      duration: 1.5,
                      repeat: Infinity,
                      delay: i * 0.3,
                      ease: "easeInOut"
                    }}
                    style={{ boxShadow: '0 0 10px rgba(84, 60, 229, 0.5)' }}
                  />
                ))}
              </div>
            </div>
          </div>
        </motion.div>
        
        {/* Current step */}
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.3, duration: 0.5 }}
          className="text-center"
        >
          <h2 className="text-xl font-medium text-gray-800 mb-2">
            {steps[currentStep]}
          </h2>
          
          <p className="text-gray-500 mb-8 text-center max-w-md">
            Please wait while we process your video. This may take a few minutes depending on the length of your content.
          </p>
        </motion.div>
        
        {/* Steps progress */}
        <motion.div 
          className="w-full max-w-md"
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.4, duration: 0.5 }}
        >
          {steps.map((step, index) => (
            <div key={index} className="flex items-center mb-4">
              <div 
                className={`w-6 h-6 rounded-full mr-3 flex items-center justify-center flex-shrink-0 ${
                  index < currentStep 
                    ? 'bg-gradient-to-r from-[#9C92FF] to-[#543CE5] text-white' 
                    : index === currentStep 
                      ? 'border-2 border-[#543CE5] text-transparent' 
                      : 'border-2 border-gray-200 text-transparent'
                }`}
                style={index < currentStep ? { boxShadow: '0 0 8px rgba(84, 60, 229, 0.3)' } : {}}
              >
                {index < currentStep && (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                )}
                {index === currentStep && (
                  <motion.div 
                    className="w-2 h-2 bg-[#543CE5] rounded-full"
                    animate={{ scale: [0.8, 1.2, 0.8] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                  />
                )}
              </div>
              <div className="flex-1">
                <p className={`text-sm font-medium ${
                  index <= currentStep ? 'text-gray-800' : 'text-gray-400'
                }`}>
                  {step}
                </p>
                {index === currentStep && (
                  <div className="w-full h-1 bg-gray-100 rounded-full mt-2 overflow-hidden relative">
                    <motion.div
                      className="absolute inset-0 bg-gradient-to-r from-[#9C92FF] via-[#543CE5] to-[#9C92FF]"
                      initial={{ backgroundPosition: "0% 0%" }}
                      animate={{ 
                        backgroundPosition: ["0% 0%", "100% 0%"]
                      }}
                      transition={{ 
                        duration: 2, 
                        repeat: Infinity,
                        ease: "linear" 
                      }}
                      style={{ 
                        boxShadow: '0 0 8px rgba(84, 60, 229, 0.3)',
                        backgroundSize: "200% 100%"
                      }}
                    />
                  </div>
                )}
              </div>
            </div>
          ))}
        </motion.div>
      </div>
      
      {/* Footer */}
      <div className="border-t border-gray-100 p-4 text-center">
        <p className="text-sm text-gray-500">
          Step {currentStep + 1} of {steps.length} • Processing time may vary based on video length
        </p>
        {onCancel && (
          <button 
            onClick={onCancel}
            className="text-[#543CE5] hover:text-[#9C92FF] font-medium mt-2 text-sm"
          >
            Cancel Processing
          </button>
        )}
      </div>
    </motion.div>
  );
}; 