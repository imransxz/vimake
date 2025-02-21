import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { motion } from "framer-motion";
import Index from "./pages/Index";
import Pricing from "./pages/Pricing";
import NotFound from "./pages/NotFound";
import Settings from "./pages/Settings";
import * as Tooltip from "@radix-ui/react-tooltip";
import { useState } from "react";
import { LanguageProvider } from "@/lib/i18n/LanguageContext";
import Shorts from "./pages/Shorts";
import { Layout } from "@/components/layout/Layout";

const springTransition = {
  type: "spring",
  stiffness: 200,
  damping: 25,
  mass: 0.5,
  duration: 0.3
};

const queryClient = new QueryClient();

const App = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <LanguageProvider>
        <Tooltip.Provider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Layout>
              <div className="min-h-screen bg-background dark:bg-[#06080D]">
                <Routes>
                  <Route path="/" element={<Index />} />
                  <Route path="/shorts" element={<Shorts />} />
                  <Route path="/pricing" element={<Pricing />} />
                  <Route path="/settings" element={<Settings />} />
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </div>
            </Layout>
          </BrowserRouter>
        </Tooltip.Provider>
      </LanguageProvider>
    </QueryClientProvider>
  );
};

export default App;
