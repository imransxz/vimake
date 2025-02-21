import { useState } from "react";
import { FileVideo, Calendar, Eye, Download, Share2 } from "lucide-react";
import { useLanguage } from "@/lib/i18n/LanguageContext";

interface Short {
  id: string;
  title: string;
  thumbnail: string;
  duration: string;
  createdAt: string;
  views: number;
  downloadUrl: string;
}

export default function Shorts() {
  const { t } = useLanguage();
  const [shorts, setShorts] = useState<Short[]>([]);

  return (
    <div className="container max-w-6xl mx-auto p-6">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <FileVideo className="w-6 h-6" />
          My Shorts
        </h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {shorts.map((short) => (
          <div
            key={short.id}
            className="group rounded-xl overflow-hidden border border-gray-200 dark:border-gray-800 bg-background transition-all duration-200 hover:shadow-lg hover:border-primary/30"
          >
            <div className="aspect-video relative overflow-hidden bg-gray-100 dark:bg-gray-800">
              <img
                src={short.thumbnail}
                alt={short.title}
                className="object-cover w-full h-full"
              />
              <span className="absolute bottom-2 right-2 px-2 py-1 text-xs font-medium bg-black/60 text-white rounded">
                {short.duration}
              </span>
            </div>
            
            <div className="p-4">
              <h3 className="font-medium mb-2 line-clamp-2">{short.title}</h3>
              
              <div className="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400">
                <div className="flex items-center gap-4">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-4 h-4" />
                    {short.createdAt}
                  </span>
                  <span className="flex items-center gap-1">
                    <Eye className="w-4 h-4" />
                    {short.views}
                  </span>
                </div>
                
                <div className="flex items-center gap-2">
                  <button className="p-2 hover:text-primary transition-colors">
                    <Download className="w-4 h-4" />
                  </button>
                  <button className="p-2 hover:text-primary transition-colors">
                    <Share2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
} 