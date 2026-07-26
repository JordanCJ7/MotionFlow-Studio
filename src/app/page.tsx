"use client";

import React, { useState, useCallback } from "react";
import { Sparkles, Film, FileArchive, Shuffle, Monitor, Layers, FileVideo, Stamp, FolderArchive } from "lucide-react";

// Tool Components
import { GifCreator } from "@/components/tools/GifCreator";
import { VideoToGif } from "@/components/tools/VideoToGif";
import { GifToVideo } from "@/components/tools/GifToVideo";
import { MemeStudio } from "@/components/tools/MemeStudio";
import { FrameExtractor } from "@/components/tools/FrameExtractor";
import { GifCompressor } from "@/components/tools/GifCompressor";
import { ImageConverter } from "@/components/tools/ImageConverter";
import { ScreenRecorder } from "@/components/tools/ScreenRecorder";

interface ToolItem {
  id: string;
  name: string;
  description: string;
  icon: React.ComponentType<any>;
}

export default function Home() {
  const [selectedTool, setSelectedTool] = useState<string>("gif-creator");
  const [isScreenRecording, setIsScreenRecording] = useState(false);

  const handleRecordingChange = useCallback((isRecording: boolean) => {
    setIsScreenRecording(isRecording);
  }, []);

  const tools: ToolItem[] = [
    { id: "gif-creator", name: "GIF Creator", description: "Create animated GIFs from static images", icon: Layers },
    { id: "video-to-gif", name: "Video to GIF", description: "Convert video clips to high-quality GIFs", icon: Film },
    { id: "gif-to-video", name: "GIF to Video", description: "Convert animated GIFs to MP4 or WebM video", icon: FileVideo },
    { id: "meme-studio", name: "Meme Studio", description: "Add captions, watermarks & sticker stamps", icon: Stamp },
    { id: "frame-extractor", name: "Frame Extractor", description: "Decompose GIFs into frames & export ZIP", icon: FolderArchive },
    { id: "gif-compressor", name: "GIF Compressor", description: "Reduce size of animated GIF files", icon: FileArchive },
    { id: "image-converter", name: "Image Converter", description: "Format and resize static images", icon: Shuffle },
    { id: "screen-recorder", name: "Screen Recorder", description: "Record display output straight to GIF", icon: Monitor },
  ];

  return (
    <main className="h-screen w-screen bg-background flex flex-col overflow-hidden">
      {/* Top Header */}
      <header className="px-6 py-4 border-b border-border flex items-center justify-between bg-card/25 backdrop-blur-md z-10 shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-accent-blue/10 border border-accent-blue/20 rounded-xl">
            <Sparkles className="w-5 h-5 text-accent-blue" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-white flex items-center gap-1.5">
              GIF Creator Studio
            </h1>
            <p className="text-[10px] text-zinc-500 uppercase tracking-widest">
              High Performance Media Toolkit
            </p>
          </div>
        </div>
      </header>

      {/* Main Workspace Frame */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Side Global Navigation Panel */}
        <aside className="w-64 border-r border-border bg-card/10 flex flex-col p-4 gap-2 shrink-0">
          <div className="px-3 mb-2">
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
              Media Tools
            </span>
          </div>

          <nav className="flex flex-col gap-1.5">
            {tools.map((tool) => {
              const Icon = tool.icon;
              const isActive = selectedTool === tool.id;
              const showRecordingDot = tool.id === "screen-recorder" && isScreenRecording && !isActive;
              return (
                <button
                  key={tool.id}
                  onClick={() => setSelectedTool(tool.id)}
                  className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left transition-all duration-200 focus:outline-none ${
                    isActive
                      ? "bg-accent-blue/10 border border-accent-blue/25 text-white font-medium shadow-[0_0_12px_rgba(59,130,246,0.05)]"
                      : "text-zinc-400 hover:bg-card/50 hover:text-zinc-200 border border-transparent"
                  }`}
                >
                  <div className="relative shrink-0">
                    <Icon className={`w-4 h-4 ${isActive ? "text-accent-blue" : "text-zinc-400"}`} />
                    {showRecordingDot && (
                      <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-zinc-950 animate-pulse" />
                    )}
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-xs truncate">{tool.name}</span>
                  </div>
                  {tool.id === "screen-recorder" && isScreenRecording && isActive && (
                    <span className="ml-auto text-[9px] font-bold text-red-400 bg-red-500/10 border border-red-500/20 px-1.5 py-0.5 rounded-full uppercase tracking-wider animate-pulse">
                      REC
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </aside>

        {/* Dynamic Tool Workspace — All tools stay mounted, visibility toggled via CSS */}
        <div className="flex-1 flex overflow-hidden relative">
          <div className={`absolute inset-0 flex ${selectedTool === "gif-creator" ? "" : "invisible pointer-events-none"}`}>
            <GifCreator />
          </div>
          <div className={`absolute inset-0 flex ${selectedTool === "video-to-gif" ? "" : "invisible pointer-events-none"}`}>
            <VideoToGif />
          </div>
          <div className={`absolute inset-0 flex ${selectedTool === "gif-to-video" ? "" : "invisible pointer-events-none"}`}>
            <GifToVideo />
          </div>
          <div className={`absolute inset-0 flex ${selectedTool === "meme-studio" ? "" : "invisible pointer-events-none"}`}>
            <MemeStudio />
          </div>
          <div className={`absolute inset-0 flex ${selectedTool === "frame-extractor" ? "" : "invisible pointer-events-none"}`}>
            <FrameExtractor />
          </div>
          <div className={`absolute inset-0 flex ${selectedTool === "gif-compressor" ? "" : "invisible pointer-events-none"}`}>
            <GifCompressor />
          </div>
          <div className={`absolute inset-0 flex ${selectedTool === "image-converter" ? "" : "invisible pointer-events-none"}`}>
            <ImageConverter />
          </div>
          <div className={`absolute inset-0 flex ${selectedTool === "screen-recorder" ? "" : "invisible pointer-events-none"}`}>
            <ScreenRecorder onRecordingChange={handleRecordingChange} />
          </div>
        </div>
      </div>
    </main>
  );
}
