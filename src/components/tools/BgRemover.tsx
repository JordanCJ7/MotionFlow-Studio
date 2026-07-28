"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { Wand2, Sparkles, Upload, Download, Loader2, Trash2, Layers, Pipette, ShieldCheck, Image as ImageIcon, Play, Pause } from "lucide-react";
import { Button } from "@/components/ui/button";
import { generateGif } from "@/lib/api";

type RemovalMode = "ai" | "chroma";

interface FrameData {
  canvas: HTMLCanvasElement;
  durationMs: number;
}

export const BgRemover: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [isGif, setIsGif] = useState<boolean>(false);
  const [frames, setFrames] = useState<FrameData[]>([]);
  const [processedFrames, setProcessedFrames] = useState<HTMLCanvasElement[]>([]);
  const [currentFrameIndex, setCurrentFrameIndex] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);

  // Background Removal Controls
  const [mode, setMode] = useState<RemovalMode>("ai");
  const [keyColor, setKeyColor] = useState<string>("#ffffff");
  const [tolerance, setTolerance] = useState<number>(30);

  // Sticker Effects Controls
  const [enableOutline, setEnableOutline] = useState<boolean>(false);
  const [outlineColor, setOutlineColor] = useState<string>("#ffffff");
  const [outlineWidth, setOutlineWidth] = useState<number>(6);

  // Processing State
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const [statusText, setStatusText] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    return () => {
      if (fileUrl) URL.revokeObjectURL(fileUrl);
    };
  }, [fileUrl]);

  // Decode GIF or Image into base frames
  const loadMedia = async (selectedFile: File) => {
    setError(null);
    setFile(selectedFile);
    const animated = selectedFile.type === "image/gif";
    setIsGif(animated);
    const url = URL.createObjectURL(selectedFile);
    setFileUrl(url);

    if (animated && "ImageDecoder" in window) {
      try {
        setStatusText("Decoding GIF frames...");
        const stream = selectedFile.stream();
        // @ts-ignore
        const decoder = new ImageDecoder({ data: stream, type: "image/gif" });
        await decoder.tracks.ready;

        const track = decoder.tracks.selectedTrack;
        const count = track?.frameCount || 1;
        const decoded: FrameData[] = [];

        for (let i = 0; i < count; i++) {
          const result = await decoder.decode({ frameIndex: i });
          const frame = result.image;
          const c = document.createElement("canvas");
          c.width = frame.displayWidth;
          c.height = frame.displayHeight;
          const ctx = c.getContext("2d")!;
          ctx.drawImage(frame, 0, 0);

          const durationMs = frame.duration ? frame.duration / 1000 : 100;
          decoded.push({ canvas: c, durationMs });
          frame.close();
        }

        if (decoded.length > 0) {
          setFrames(decoded);
          setProcessedFrames(decoded.map((f) => f.canvas));
          setCurrentFrameIndex(0);
          setStatusText("");
          return;
        }
      } catch (err) {
        console.warn("ImageDecoder failed, using fallback static canvas:", err);
      }
    }

    // Static Image fallback
    const img = new Image();
    img.src = url;
    await new Promise((res) => { img.onload = res; });
    const c = document.createElement("canvas");
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(img, 0, 0);

    setFrames([{ canvas: c, durationMs: 1000 }]);
    setProcessedFrames([c]);
    setCurrentFrameIndex(0);
    setStatusText("");
  };

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected && selected.type.startsWith("image/")) {
      loadMedia(selected);
    } else if (selected) {
      setError("Please select a valid image or animated GIF file.");
    }
  };

  const handleRemove = () => {
    if (fileUrl) URL.revokeObjectURL(fileUrl);
    setFile(null);
    setFileUrl(null);
    setFrames([]);
    setProcessedFrames([]);
    setCurrentFrameIndex(0);
    setIsPlaying(false);
    setError(null);
  };

  // Chroma Key / Color Threshold Algorithm (100% Offline)
  const applyChromaKey = (srcCanvas: HTMLCanvasElement): HTMLCanvasElement => {
    const outCanvas = document.createElement("canvas");
    outCanvas.width = srcCanvas.width;
    outCanvas.height = srcCanvas.height;
    const ctx = outCanvas.getContext("2d")!;
    ctx.drawImage(srcCanvas, 0, 0);

    const imgData = ctx.getImageData(0, 0, outCanvas.width, outCanvas.height);
    const data = imgData.data;

    // Convert hex keyColor to RGB
    const hex = keyColor.replace("#", "");
    const rKey = parseInt(hex.substring(0, 2), 16) || 255;
    const gKey = parseInt(hex.substring(2, 4), 16) || 255;
    const bKey = parseInt(hex.substring(4, 6), 16) || 255;

    const maxDist = (tolerance / 100) * 441.67; // max Euclidean color distance (sqrt(255^2*3))

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      const dist = Math.sqrt(
        (r - rKey) ** 2 + (g - gKey) ** 2 + (b - bKey) ** 2
      );

      if (dist <= maxDist) {
        data[i + 3] = 0; // Make transparent
      }
    }

    ctx.putImageData(imgData, 0, 0);
    return outCanvas;
  };

  // Sticker Stroke Outline Algorithm
  const applyStickerOutline = (srcCanvas: HTMLCanvasElement): HTMLCanvasElement => {
    if (!enableOutline || outlineWidth <= 0) return srcCanvas;

    const outCanvas = document.createElement("canvas");
    outCanvas.width = srcCanvas.width;
    outCanvas.height = srcCanvas.height;
    const ctx = outCanvas.getContext("2d")!;

    const w = outCanvas.width;
    const h = outCanvas.height;

    // Draw outline by rendering offset silhouettes of the alpha mask
    const d = outlineWidth;
    const steps = 16;
    ctx.save();

    // Create silhouette on temp canvas
    const silCanvas = document.createElement("canvas");
    silCanvas.width = w;
    silCanvas.height = h;
    const sCtx = silCanvas.getContext("2d")!;
    sCtx.drawImage(srcCanvas, 0, 0);
    sCtx.globalCompositeOperation = "source-in";
    sCtx.fillStyle = outlineColor;
    sCtx.fillRect(0, 0, w, h);

    for (let i = 0; i < steps; i++) {
      const angle = (i / steps) * 2 * Math.PI;
      const dx = Math.round(Math.cos(angle) * d);
      const dy = Math.round(Math.sin(angle) * d);
      ctx.drawImage(silCanvas, dx, dy);
    }
    ctx.restore();

    // Draw original subject on top
    ctx.drawImage(srcCanvas, 0, 0);
    return outCanvas;
  };

  // Process Background Removal (AI or Chroma)
  const handleRemoveBackground = async () => {
    if (frames.length === 0) return;
    setError(null);
    setIsProcessing(true);
    setProgress(0);

    try {
      const newProcessed: HTMLCanvasElement[] = [];

      if (mode === "ai") {
        setStatusText("Loading AI segmentation model...");
        const { removeBackground } = await import("@imgly/background-removal");

        for (let i = 0; i < frames.length; i++) {
          setStatusText(`AI processing frame ${i + 1} of ${frames.length}...`);
          setProgress(Math.round(((i + 1) / frames.length) * 100));

          // Convert canvas to Blob
          const frameBlob = await new Promise<Blob>((res) =>
            frames[i].canvas.toBlob((b) => res(b!), "image/png")
          );

          const cutoutBlob = await removeBackground(frameBlob, {
            progress: (key, current, total) => {
              if (total > 0) {
                const pct = Math.round((current / total) * 100);
                setStatusText(`AI ${key}: ${pct}%`);
              }
            },
          });

          const img = new Image();
          img.src = URL.createObjectURL(cutoutBlob);
          await new Promise((res) => { img.onload = res; });

          const c = document.createElement("canvas");
          c.width = frames[i].canvas.width;
          c.height = frames[i].canvas.height;
          const ctx = c.getContext("2d")!;
          ctx.drawImage(img, 0, 0, c.width, c.height);

          const finalCanvas = applyStickerOutline(c);
          newProcessed.push(finalCanvas);
          URL.revokeObjectURL(img.src);
        }
      } else {
        // Chroma Key Mode (Instant)
        setStatusText("Applying color key cutout...");
        for (let i = 0; i < frames.length; i++) {
          const keyed = applyChromaKey(frames[i].canvas);
          const finalCanvas = applyStickerOutline(keyed);
          newProcessed.push(finalCanvas);
        }
      }

      setProcessedFrames(newProcessed);
      setStatusText("Background removal complete!");
    } catch (err: any) {
      setError(err.message || "Failed to remove background.");
    } finally {
      setIsProcessing(false);
      setProgress(0);
    }
  };

  // Re-apply outline live if toggle or color changes
  useEffect(() => {
    if (processedFrames.length > 0 && mode === "chroma") {
      const updated = frames.map((f) => {
        const keyed = applyChromaKey(f.canvas);
        return applyStickerOutline(keyed);
      });
      setProcessedFrames(updated);
    }
  }, [enableOutline, outlineColor, outlineWidth, keyColor, tolerance]);

  // Update Preview Canvas
  useEffect(() => {
    if (processedFrames.length > 0 && previewCanvasRef.current) {
      const targetCanvas = previewCanvasRef.current;
      const current = processedFrames[currentFrameIndex] || processedFrames[0];
      targetCanvas.width = current.width;
      targetCanvas.height = current.height;
      const ctx = targetCanvas.getContext("2d");
      if (ctx) {
        ctx.clearRect(0, 0, targetCanvas.width, targetCanvas.height);
        ctx.drawImage(current, 0, 0);
      }
    }
  }, [processedFrames, currentFrameIndex]);

  // GIF Playback Loop
  useEffect(() => {
    if (isPlaying && processedFrames.length > 1) {
      const interval = setTimeout(() => {
        setCurrentFrameIndex((prev) => (prev + 1) % processedFrames.length);
      }, frames[currentFrameIndex]?.durationMs || 100);
      return () => clearTimeout(interval);
    }
  }, [isPlaying, currentFrameIndex, processedFrames, frames]);

  // Export Cutout / Sticker
  const handleExport = async () => {
    if (processedFrames.length === 0 || !previewCanvasRef.current) return;
    setError(null);
    setIsProcessing(true);

    try {
      if (!isGif || processedFrames.length === 1) {
        // Single PNG export with full alpha transparency
        const dataUrl = previewCanvasRef.current.toDataURL("image/png");
        const a = document.createElement("a");
        a.href = dataUrl;
        a.download = `cutout_${file?.name.replace(/\.[^/.]+$/, "") || "sticker"}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } else {
        // Animated Transparent GIF Export
        setStatusText("Compiling transparent GIF in backend...");
        const files: File[] = [];
        const perFrameDelays: number[] = [];

        for (let i = 0; i < processedFrames.length; i++) {
          const blob = await new Promise<Blob>((res) =>
            processedFrames[i].toBlob((b) => res(b!), "image/png")
          );
          files.push(new File([blob], `frame_${i}.png`, { type: "image/png" }));
          perFrameDelays.push(frames[i].durationMs);
        }

        const targetW = processedFrames[0].width;
        const targetH = processedFrames[0].height;
        const gifBlob = await generateGif(files, 100, targetW, targetH, perFrameDelays);

        const url = URL.createObjectURL(gifBlob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `transparent_sticker_${file?.name.replace(/\.gif$/i, "") || "animation"}.gif`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch (err: any) {
      setError(err.message || "Failed to export transparent sticker.");
    } finally {
      setIsProcessing(false);
      setStatusText("");
    }
  };

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Settings Side Panel */}
      <section className="w-80 md:w-96 border-r border-border bg-card/20 flex flex-col h-full overflow-y-auto p-6 gap-6 shrink-0">
        <div className="flex items-center gap-2 text-zinc-300">
          <Wand2 className="w-4 h-4 text-accent-blue" />
          <h2 className="text-sm font-semibold">AI Background Remover</h2>
        </div>

        {/* Mode Selector */}
        <div className="flex flex-col gap-4 bg-card/40 border border-border p-5 rounded-2xl">
          <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">
            Cutout Mode
          </h3>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setMode("ai")}
              className={`py-2 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                mode === "ai"
                  ? "border-accent-blue bg-accent-blue/10 text-white"
                  : "border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" /> AI Auto Cutout
            </button>
            <button
              type="button"
              onClick={() => setMode("chroma")}
              className={`py-2 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                mode === "chroma"
                  ? "border-accent-blue bg-accent-blue/10 text-white"
                  : "border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
              }`}
            >
              <Pipette className="w-3.5 h-3.5" /> Color Key
            </button>
          </div>

          {mode === "ai" ? (
            <p className="text-[10px] text-zinc-500 leading-relaxed">
              Uses neural network AI to automatically isolate subjects and produce transparent PNG cutouts.
            </p>
          ) : (
            <div className="flex flex-col gap-3 pt-1">
              <div className="flex items-center justify-between">
                <label className="text-xs text-zinc-400">Target Color</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={keyColor}
                    onChange={(e) => setKeyColor(e.target.value)}
                    className="w-7 h-7 rounded cursor-pointer border-0 bg-transparent"
                  />
                  <span className="text-xs font-mono text-zinc-400">{keyColor}</span>
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-medium text-zinc-400">Color Tolerance ({tolerance}%)</label>
                <input
                  type="range"
                  min={5}
                  max={80}
                  value={tolerance}
                  onChange={(e) => setTolerance(Number(e.target.value))}
                  className="accent-accent-blue cursor-pointer"
                />
              </div>
            </div>
          )}
        </div>

        {/* Sticker Stroke Outline Panel */}
        <div className="flex flex-col gap-4 bg-card/40 border border-border p-5 rounded-2xl">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">
              Sticker Outline
            </h3>
            <label className="text-xs text-zinc-400 cursor-pointer flex items-center gap-2">
              <input
                type="checkbox"
                checked={enableOutline}
                onChange={(e) => setEnableOutline(e.target.checked)}
                className="rounded border-zinc-800 bg-zinc-950 text-accent-blue focus:ring-accent-blue"
              />
              Enable
            </label>
          </div>

          {enableOutline && (
            <div className="flex flex-col gap-3 pt-1">
              <div className="flex items-center justify-between">
                <label className="text-xs text-zinc-400">Outline Color</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={outlineColor}
                    onChange={(e) => setOutlineColor(e.target.value)}
                    className="w-7 h-7 rounded cursor-pointer border-0 bg-transparent"
                  />
                  <span className="text-xs font-mono text-zinc-400">{outlineColor}</span>
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-medium text-zinc-400">Width ({outlineWidth}px)</label>
                <input
                  type="range"
                  min={1}
                  max={20}
                  value={outlineWidth}
                  onChange={(e) => setOutlineWidth(Number(e.target.value))}
                  className="accent-accent-blue cursor-pointer"
                />
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="mt-auto pt-6 border-t border-border flex flex-col gap-3">
          {error && (
            <div className="text-xs text-accent-red bg-accent-red/10 border border-accent-red/20 px-3.5 py-2.5 rounded-lg">
              {error}
            </div>
          )}
          {statusText && (
            <div className="text-xs text-accent-blue bg-accent-blue/10 border border-accent-blue/20 px-3.5 py-2.5 rounded-lg animate-pulse">
              {statusText}
            </div>
          )}

          <Button
            variant="primary"
            disabled={!file || isProcessing}
            onClick={handleRemoveBackground}
            className="w-full py-3 text-sm font-semibold rounded-xl flex items-center gap-2 justify-center"
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-white" />
                Removing Background...
              </>
            ) : (
              <>
                <Wand2 className="w-4 h-4 text-white" />
                Remove Background ({mode.toUpperCase()})
              </>
            )}
          </Button>

          <Button
            variant="secondary"
            disabled={!file || processedFrames.length === 0 || isProcessing}
            onClick={handleExport}
            className="w-full py-2.5 text-xs rounded-xl flex items-center gap-2 justify-center"
          >
            <Download className="w-3.5 h-3.5" />
            Download Transparent {isGif ? "GIF" : "PNG"}
          </Button>
        </div>
      </section>

      {/* Main Canvas Workstation */}
      <section className="flex-1 flex flex-col h-full overflow-hidden p-6 gap-4 bg-zinc-950/20">
        <div className="flex items-center justify-between text-zinc-300 shrink-0">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-accent-blue" />
            <h2 className="text-sm font-semibold">Background Remover Workstation</h2>
            {isGif && (
              <span className="text-[10px] text-accent-blue bg-accent-blue/10 border border-accent-blue/20 px-2 py-0.5 rounded-full font-mono">
                Animated GIF ({frames.length} frames)
              </span>
            )}
          </div>
          {file && (
            <div className="flex items-center gap-2">
              {isGif && processedFrames.length > 1 && (
                <button
                  onClick={() => setIsPlaying(!isPlaying)}
                  className="px-3 py-1.5 rounded-xl border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-xs text-zinc-200 flex items-center gap-1.5 transition-colors"
                >
                  {isPlaying ? <Pause className="w-3.5 h-3.5 text-accent-blue" /> : <Play className="w-3.5 h-3.5 text-accent-blue" />}
                  {isPlaying ? "Pause Preview" : "Play Preview"}
                </button>
              )}
              <Button variant="danger" onClick={handleRemove} className="p-2">
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          )}
        </div>

        {file && fileUrl ? (
          <div className="flex-1 bg-zinc-950 border border-border rounded-2xl flex items-center justify-center p-6 overflow-hidden relative shadow-inner bg-[radial-gradient(#27272a_1px,transparent_1px)] [background-size:16px_16px]">
            <canvas
              ref={previewCanvasRef}
              className="max-h-full max-w-full object-contain rounded-lg shadow-2xl border border-zinc-800"
            />
          </div>
        ) : (
          <div
            onClick={() => fileInputRef.current?.click()}
            className="flex-1 border-2 border-dashed border-border hover:border-zinc-700 bg-card/40 rounded-2xl flex flex-col items-center justify-center text-center p-6 cursor-pointer transition-colors duration-300"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              onChange={handleFileSelected}
              className="hidden"
            />
            <div className="mb-4 p-3 rounded-full bg-zinc-900 border border-border">
              <Upload className="w-8 h-8 text-zinc-400" />
            </div>
            <p className="mb-2 text-sm text-zinc-300">
              <span className="font-semibold text-accent-blue">Click to upload image or GIF</span> or drag and drop
            </p>
            <p className="text-xs text-zinc-500">Supports PNG, JPG, WebP, and Animated GIF files</p>
          </div>
        )}
      </section>
    </div>
  );
};
