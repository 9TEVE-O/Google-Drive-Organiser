import { geminiFetch } from "../lib/geminiApi";
import React, { useState } from "react";
import { Image as ImageIcon, Sparkles, Smartphone, Monitor, Loader2, Download, CheckCircle2 } from "lucide-react";

export default function ImageGenerator() {
  const [prompt, setPrompt] = useState("");
  const [aspectRatio, setAspectRatio] = useState<"9:16" | "16:9">("16:9");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!prompt) return;
    setIsGenerating(true);
    try {
      let data: any = null;
      try {
        const res = await geminiFetch("/api/gemini/generate-image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt, aspectRatio })
        });
        const text = await res.text();
        if (text && (text.startsWith("{") || text.startsWith("["))) {
          data = JSON.parse(text);
        }
      } catch (fetchErr) {
        console.warn("Fetch /api/gemini/generate-image error:", fetchErr);
      }

      if (data && data.imageUrl) {
        setGeneratedImage(data.imageUrl);
      } else {
        throw new Error(data?.error || "Image generation service temporarily unavailable.");
      }
    } catch (e: any) {
      console.error("Image Generation failed:", e);
    } finally {
      setIsGenerating(false);
    }
  };

  const downloadImage = () => {
    if (!generatedImage) return;
    const link = document.createElement("a");
    link.href = generatedImage;
    link.download = `generated-${Date.now()}.png`;
    link.click();
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-indigo-100 bg-gradient-to-r from-indigo-50/50 to-indigo-100/30 p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <h2 className="font-display font-bold text-slate-900 text-xl tracking-tight flex items-center gap-2">
              <ImageIcon className="h-5 w-5 text-indigo-600" /> AI Image Studio
            </h2>
            <p className="text-xs text-slate-500 max-w-2xl leading-relaxed">
              Create perfect-fit images for your workflow. Generate vertical phone wallpapers (9:16) or horizontal web banners (16:9) with exact aspect ratio control powered by Gemini.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <div className="lg:col-span-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-5">
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-widest mb-1.5">
              Image Description
            </label>
            <textarea
              rows={4}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="E.g., A serene mountain landscape at golden hour with snow-capped peaks..."
              className="w-full rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm focus:border-indigo-500 focus:bg-white focus:outline-none transition resize-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-widest mb-1.5">
              Aspect Ratio Control
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setAspectRatio("16:9")}
                className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-all ${
                  aspectRatio === "16:9" 
                    ? "border-indigo-600 bg-indigo-50/50 text-indigo-700" 
                    : "border-slate-100 bg-white text-slate-400 hover:border-slate-200 hover:text-slate-600"
                }`}
              >
                <Monitor className="h-6 w-6 mb-1.5" />
                <span className="text-xs font-semibold">16:9 Web Banner</span>
                <span className="text-[10px] font-mono mt-0.5">Horizontal</span>
              </button>
              
              <button
                onClick={() => setAspectRatio("9:16")}
                className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-all ${
                  aspectRatio === "9:16" 
                    ? "border-indigo-600 bg-indigo-50/50 text-indigo-700" 
                    : "border-slate-100 bg-white text-slate-400 hover:border-slate-200 hover:text-slate-600"
                }`}
              >
                <Smartphone className="h-6 w-6 mb-1.5" />
                <span className="text-xs font-semibold">9:16 Wallpaper</span>
                <span className="text-[10px] font-mono mt-0.5">Vertical Phone</span>
              </button>
            </div>
          </div>

          <button
            onClick={handleGenerate}
            disabled={isGenerating || !prompt}
            className="w-full flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-3 text-sm font-semibold text-white hover:bg-indigo-700 transition disabled:opacity-50"
          >
            {isGenerating ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Generating Image...</>
            ) : (
              <><Sparkles className="h-4 w-4" /> Create Perfect-Fit Image</>
            )}
          </button>
        </div>

        <div className="lg:col-span-8 rounded-xl border border-slate-200 bg-zinc-50 p-5 shadow-sm min-h-[400px] flex items-center justify-center relative overflow-hidden">
          {generatedImage ? (
            <div className="w-full h-full flex flex-col items-center justify-center">
              <div className={`relative shadow-xl rounded-lg overflow-hidden border-4 border-white mx-auto ${
                aspectRatio === "16:9" ? "w-full max-w-xl aspect-video" : "w-auto h-full max-h-[500px] aspect-[9/16]"
              }`}>
                <img 
                  src={generatedImage} 
                  alt="Generated AI graphic" 
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              </div>
              <button 
                onClick={downloadImage}
                className="mt-6 flex items-center gap-1.5 rounded-full bg-white border border-slate-200 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition shadow-sm"
              >
                <Download className="h-4 w-4" /> Download High-Res
              </button>
            </div>
          ) : isGenerating ? (
            <div className="flex flex-col items-center text-slate-400">
              <div className="h-32 w-32 relative mb-4">
                <div className="absolute inset-0 border-4 border-indigo-100 rounded-full"></div>
                <div className="absolute inset-0 border-4 border-indigo-600 rounded-full border-t-transparent animate-spin"></div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <Sparkles className="h-8 w-8 text-indigo-400 animate-pulse" />
                </div>
              </div>
              <span className="text-sm font-mono tracking-widest uppercase">Synthesizing Pixels...</span>
            </div>
          ) : (
            <div className="text-center text-slate-400 flex flex-col items-center max-w-sm">
              <div className="h-16 w-16 mb-4 rounded-2xl bg-white shadow-sm border border-slate-100 flex items-center justify-center">
                <ImageIcon className="h-8 w-8 text-slate-300" />
              </div>
              <h3 className="font-semibold text-slate-600 text-sm mb-1">Canvas is Ready</h3>
              <p className="text-xs text-slate-400 font-mono">Fill out the prompt and select an aspect ratio to begin generative rendering.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
