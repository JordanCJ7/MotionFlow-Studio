"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { Type, Sparkles, Upload, Image as ImageIcon, Loader2, Trash2, CheckCircle, Stamp, Layers, Play, Pause } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { generateGif } from "@/lib/api";

type WatermarkPosition = "top-left" | "top-right" | "bottom-left" | "bottom-right" | "center";
type BadgePreset = "none" | "APPROVED" | "CONFIDENTIAL" | "VIRAL" | "TOP SECRET" | "HOT";

interface FrameData {
  canvas: HTMLCanvasElement;
  duration: number;
}

export const MemeStudio: React.FC = () => {
  // Input File & Frames State
  const [file, setFile] = useState<File | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [isGif, setIsGif] = useState<boolean>(false);
  const [frames, setFrames] = useState<FrameData[]>([]);
  const [currentFrameIndex, setCurrentFrameIndex] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);

  // Meme Text Controls
  const [topText, setTopText] = useState<string>("WHEN CODE COMPILES");
  const [bottomText, setBottomText] = useState<string>("FIRST TRY WITHOUT ERRORS");
  const [autoUppercase, setAutoUppercase] = useState<boolean>(true);
  const [fontFamily, setFontFamily] = useState<string>("Impact");
  const [fontSize, setFontSize] = useState<number>(42);
  const [textColor, setTextColor] = useState<string>("#ffffff");
  const [strokeColor, setStrokeColor] = useState<string>("#000000");
  const [strokeWidth, setStrokeWidth] = useState<number>(4);

  // Watermark Logo Controls
  const [watermarkFile, setWatermarkFile] = useState<File | null>(null);
  const [watermarkImg, setWatermarkImg] = useState<HTMLImageElement | null>(null);
  const [watermarkPos, setWatermarkPos] = useState<WatermarkPosition>("bottom-right");
  const [watermarkOpacity, setWatermarkOpacity] = useState<number>(80);
  const [watermarkScale, setWatermarkScale] = useState<number>(25);

  // Badge / Stamp Controls
  const [selectedBadge, setSelectedBadge] = useState<BadgePreset>("none");

  // Export State
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportProgress, setExportProgress] = useState<number>(0);
  const [statusText, setStatusText] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const watermarkInputRef = useRef<HTMLInputElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const playAnimationRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (fileUrl) URL.revokeObjectURL(fileUrl);
      if (playAnimationRef.current) cancelAnimationFrame(playAnimationRef.current);
    };
  }, [fileUrl]);

  // Handle Watermark Image Upload
  const handleWatermarkSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) {
      setWatermarkFile(selected);
      const url = URL.createObjectURL(selected);
      const img = new Image();
      img.src = url;
      img.onload = () => {
        setWatermarkImg(img);
      };
    }
  };

  const handleRemoveWatermark = () => {
    setWatermarkFile(null);
    setWatermarkImg(null);
  };

  // Decode GIF or Static Image into Frames
  const loadMedia = async (selectedFile: File) => {
    setError(null);
    setFile(selectedFile);
    const isAnimatedGif = selectedFile.type === "image/gif";
    setIsGif(isAnimatedGif);
    const url = URL.createObjectURL(selectedFile);
    setFileUrl(url);

    if (isAnimatedGif && "ImageDecoder" in window) {
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
          decoded.push({ canvas: c, duration: durationMs });
          frame.close();
        }

        if (decoded.length > 0) {
          setFrames(decoded);
          setCurrentFrameIndex(0);
          setStatusText("");
          return;
        }
      } catch (err) {
        console.warn("ImageDecoder failed, falling back to static canvas:", err);
      }
    }

    // Single Frame fallback
    const img = new Image();
    img.src = url;
    await new Promise((resolve) => { img.onload = resolve; });
    const c = document.createElement("canvas");
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(img, 0, 0);

    setFrames([{ canvas: c, duration: 1000 }]);
    setCurrentFrameIndex(0);
    setStatusText("");
  };

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected && selected.type.startsWith("image/")) {
      loadMedia(selected);
    } else if (selected) {
      setError("Please select a valid image or GIF file.");
    }
  };

  const handleRemove = () => {
    if (fileUrl) URL.revokeObjectURL(fileUrl);
    setFile(null);
    setFileUrl(null);
    setFrames([]);
    setCurrentFrameIndex(0);
    setIsPlaying(false);
    setError(null);
  };

  // Canvas Compositing Engine
  const renderCompositedFrame = useCallback((baseCanvas: HTMLCanvasElement, targetCanvas: HTMLCanvasElement) => {
    targetCanvas.width = baseCanvas.width;
    targetCanvas.height = baseCanvas.height;
    const ctx = targetCanvas.getContext("2d");
    if (!ctx) return;

    const w = targetCanvas.width;
    const h = targetCanvas.height;

    // 1. Draw Base Image
    ctx.drawImage(baseCanvas, 0, 0);

    // 2. Draw Watermark Logo
    if (watermarkImg) {
      ctx.save();
      ctx.globalAlpha = watermarkOpacity / 100;
      const wmWidth = (w * watermarkScale) / 100;
      const wmHeight = (watermarkImg.naturalHeight / watermarkImg.naturalWidth) * wmWidth;
      const margin = 15;

      let x = margin;
      let y = margin;

      if (watermarkPos === "top-right") {
        x = w - wmWidth - margin;
      } else if (watermarkPos === "bottom-left") {
        y = h - wmHeight - margin;
      } else if (watermarkPos === "bottom-right") {
        x = w - wmWidth - margin;
        y = h - wmHeight - margin;
      } else if (watermarkPos === "center") {
        x = (w - wmWidth) / 2;
        y = (h - wmHeight) / 2;
      }

      ctx.drawImage(watermarkImg, x, y, wmWidth, wmHeight);
      ctx.restore();
    }

    // 3. Draw Stamp / Badge Preset
    if (selectedBadge !== "none") {
      ctx.save();
      ctx.translate(w - 70, 45);
      ctx.rotate((12 * Math.PI) / 180); // 12 deg tilt

      ctx.font = "900 18px sans-serif";
      ctx.fillStyle = "#ef4444";
      ctx.strokeStyle = "#ef4444";
      ctx.lineWidth = 3;

      const textMetrics = ctx.measureText(selectedBadge);
      const bw = textMetrics.width + 16;
      const bh = 30;

      ctx.strokeRect(-bw / 2, -bh / 2, bw, bh);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(selectedBadge, 0, 1);
      ctx.restore();
    }

    // 4. Draw Meme Text (Top & Bottom)
    ctx.save();
    const formattedTop = autoUppercase ? topText.toUpperCase() : topText;
    const formattedBottom = autoUppercase ? bottomText.toUpperCase() : bottomText;

    ctx.font = `900 ${fontSize}px ${fontFamily}, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillStyle = textColor;
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = strokeWidth;
    ctx.lineJoin = "round";

    // Top Text
    if (formattedTop.trim()) {
      const topY = fontSize + 12;
      ctx.strokeText(formattedTop, w / 2, topY);
      ctx.fillText(formattedTop, w / 2, topY);
    }

    // Bottom Text
    if (formattedBottom.trim()) {
      const bottomY = h - 20;
      ctx.strokeText(formattedBottom, w / 2, bottomY);
      ctx.fillText(formattedBottom, w / 2, bottomY);
    }

    ctx.restore();
  }, [topText, bottomText, autoUppercase, fontFamily, fontSize, textColor, strokeColor, strokeWidth, watermarkImg, watermarkPos, watermarkOpacity, watermarkScale, selectedBadge]);

  // Update Preview Canvas
  useEffect(() => {
    if (frames.length > 0 && previewCanvasRef.current) {
      const currentCanvas = frames[currentFrameIndex]?.canvas || frames[0].canvas;
      renderCompositedFrame(currentCanvas, previewCanvasRef.current);
    }
  }, [frames, currentFrameIndex, renderCompositedFrame]);

  // GIF Playback Loop for Preview
  useEffect(() => {
    if (isPlaying && frames.length > 1) {
      const interval = setTimeout(() => {
        setCurrentFrameIndex((prev) => (prev + 1) % frames.length);
      }, frames[currentFrameIndex]?.duration || 100);
      return () => clearTimeout(interval);
    }
  }, [isPlaying, currentFrameIndex, frames]);

  // Export Meme (Static PNG or Animated GIF)
  const handleExport = async () => {
    if (frames.length === 0 || !previewCanvasRef.current) return;
    setError(null);
    setIsExporting(true);

    try {
      if (!isGif || frames.length === 1) {
        // Static Image Export
        const dataUrl = previewCanvasRef.current.toDataURL("image/png");
        const a = document.createElement("a");
        a.href = dataUrl;
        a.download = `meme_${file?.name.replace(/\.[^/.]+$/, "") || "output"}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } else {
        // Animated GIF Export via Backend / Client Canvas
        setStatusText("Compositing animated GIF frames...");
        const compositedFiles: File[] = [];
        const perFrameDelays: number[] = [];

        for (let i = 0; i < frames.length; i++) {
          setExportProgress(Math.round(((i + 1) / frames.length) * 50));
          const c = document.createElement("canvas");
          renderCompositedFrame(frames[i].canvas, c);

          const blob = await new Promise<Blob | null>((resolve) => {
            c.toBlob((b) => resolve(b), "image/png");
          });

          if (blob) {
            compositedFiles.push(new File([blob], `frame_${i}.png`, { type: "image/png" }));
            perFrameDelays.push(frames[i].duration);
          }
        }

        setStatusText("Compiling animated GIF in backend...");
        const targetWidth = frames[0].canvas.width;
        const targetHeight = frames[0].canvas.height;
        const gifBlob = await generateGif(compositedFiles, 100, targetWidth, targetHeight, perFrameDelays);

        const url = URL.createObjectURL(gifBlob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `meme_${file?.name.replace(/\.gif$/i, "") || "animation"}.gif`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch (err: any) {
      setError(err.message || "Failed to export meme.");
    } finally {
      setIsExporting(false);
      setStatusText("");
      setExportProgress(0);
    }
  };

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Control Panel Side Bar */}
      <section className="w-80 md:w-96 border-r border-border bg-card/20 flex flex-col h-full overflow-y-auto p-6 gap-6 shrink-0">
        <div className="flex items-center gap-2 text-zinc-300">
          <Type className="w-4 h-4 text-accent-blue" />
          <h2 className="text-sm font-semibold">Meme & Watermark Studio</h2>
        </div>

        {/* Meme Captions Panel */}
        <div className="flex flex-col gap-4 bg-card/40 border border-border p-5 rounded-2xl">
          <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">
            Text Captions
          </h3>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-zinc-400">Top Text</label>
            <Input
              type="text"
              value={topText}
              onChange={(e) => setTopText(e.target.value)}
              placeholder="TOP TEXT..."
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-zinc-400">Bottom Text</label>
            <Input
              type="text"
              value={bottomText}
              onChange={(e) => setBottomText(e.target.value)}
              placeholder="BOTTOM TEXT..."
            />
          </div>

          <div className="flex items-center justify-between pt-1">
            <label className="text-xs text-zinc-400 cursor-pointer flex items-center gap-2">
              <input
                type="checkbox"
                checked={autoUppercase}
                onChange={(e) => setAutoUppercase(e.target.checked)}
                className="rounded border-zinc-800 bg-zinc-950 text-accent-blue focus:ring-accent-blue"
              />
              Auto Uppercase
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-medium text-zinc-400">Font</label>
              <select
                value={fontFamily}
                onChange={(e) => setFontFamily(e.target.value)}
                className="bg-zinc-950 border border-border rounded-lg px-2.5 py-1.5 text-xs text-zinc-100 focus:outline-none focus:ring-1 focus:ring-accent-blue"
              >
                <option value="Impact">Impact (Classic)</option>
                <option value="Arial">Arial</option>
                <option value="Montserrat">Montserrat</option>
                <option value="Comic Sans MS">Comic Sans</option>
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-medium text-zinc-400">Font Size ({fontSize}px)</label>
              <input
                type="range"
                min={20}
                max={90}
                value={fontSize}
                onChange={(e) => setFontSize(Number(e.target.value))}
                className="accent-accent-blue cursor-pointer"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-medium text-zinc-400">Text Color</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={textColor}
                  onChange={(e) => setTextColor(e.target.value)}
                  className="w-8 h-8 rounded cursor-pointer border-0 bg-transparent"
                />
                <span className="text-xs font-mono text-zinc-400">{textColor}</span>
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-medium text-zinc-400">Stroke Color</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={strokeColor}
                  onChange={(e) => setStrokeColor(e.target.value)}
                  className="w-8 h-8 rounded cursor-pointer border-0 bg-transparent"
                />
                <span className="text-xs font-mono text-zinc-400">{strokeColor}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Watermark Logo Panel */}
        <div className="flex flex-col gap-4 bg-card/40 border border-border p-5 rounded-2xl">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">
              Logo Watermark
            </h3>
            {watermarkFile && (
              <button onClick={handleRemoveWatermark} className="text-[10px] text-accent-red hover:underline">
                Remove
              </button>
            )}
          </div>

          {watermarkFile ? (
            <div className="flex items-center gap-3 bg-zinc-950 p-2.5 rounded-xl border border-border">
              <img src={URL.createObjectURL(watermarkFile)} alt="Watermark" className="w-8 h-8 object-contain rounded" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-mono text-zinc-200 truncate">{watermarkFile.name}</p>
              </div>
            </div>
          ) : (
            <button
              onClick={() => watermarkInputRef.current?.click()}
              className="py-2.5 px-3 border border-dashed border-border hover:border-zinc-700 bg-zinc-950/40 rounded-xl text-xs text-zinc-400 flex items-center justify-center gap-2 transition-colors"
            >
              <Upload className="w-3.5 h-3.5" /> Upload Logo / Watermark
            </button>
          )}
          <input
            ref={watermarkInputRef}
            type="file"
            accept="image/png,image/jpeg,image/svg+xml,image/webp"
            onChange={handleWatermarkSelected}
            className="hidden"
          />

          {watermarkImg && (
            <div className="flex flex-col gap-3 pt-1">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-medium text-zinc-400">Position</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {(["top-left", "top-right", "center", "bottom-left", "bottom-right"] as WatermarkPosition[]).map((pos) => (
                    <button
                      key={pos}
                      onClick={() => setWatermarkPos(pos)}
                      className={`py-1 rounded-lg border text-[10px] font-mono capitalize transition-all ${
                        watermarkPos === pos
                          ? "border-accent-blue bg-accent-blue/10 text-white"
                          : "border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
                      }`}
                    >
                      {pos.replace("-", " ")}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-medium text-zinc-400">Opacity ({watermarkOpacity}%)</label>
                  <input
                    type="range"
                    min={10}
                    max={100}
                    value={watermarkOpacity}
                    onChange={(e) => setWatermarkOpacity(Number(e.target.value))}
                    className="accent-accent-blue cursor-pointer"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-medium text-zinc-400">Scale ({watermarkScale}%)</label>
                  <input
                    type="range"
                    min={10}
                    max={50}
                    value={watermarkScale}
                    onChange={(e) => setWatermarkScale(Number(e.target.value))}
                    className="accent-accent-blue cursor-pointer"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Badge Stamps Panel */}
        <div className="flex flex-col gap-3 bg-card/40 border border-border p-5 rounded-2xl">
          <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">
            Badge Stamp Overlay
          </h3>
          <div className="grid grid-cols-3 gap-1.5">
            {(["none", "APPROVED", "CONFIDENTIAL", "VIRAL", "TOP SECRET", "HOT"] as BadgePreset[]).map((badge) => (
              <button
                key={badge}
                onClick={() => setSelectedBadge(badge)}
                className={`py-1.5 rounded-lg border text-[10px] font-bold font-mono transition-all ${
                  selectedBadge === badge
                    ? "border-accent-blue bg-accent-blue/10 text-white"
                    : "border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
                }`}
              >
                {badge}
              </button>
            ))}
          </div>
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
            disabled={!file || isExporting}
            onClick={handleExport}
            className="w-full py-3 text-sm font-semibold rounded-xl flex items-center gap-2 justify-center"
          >
            {isExporting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-white" />
                Exporting Meme...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 text-white" />
                Export Meme ({isGif ? "GIF" : "PNG"})
              </>
            )}
          </Button>
        </div>
      </section>

      {/* Main Canvas Workstation */}
      <section className="flex-1 flex flex-col h-full overflow-hidden p-6 gap-4 bg-zinc-950/20">
        <div className="flex items-center justify-between text-zinc-300 shrink-0">
          <div className="flex items-center gap-2">
            <Stamp className="w-4 h-4 text-accent-blue" />
            <h2 className="text-sm font-semibold">Meme Workstation</h2>
            {isGif && (
              <span className="text-[10px] text-accent-blue bg-accent-blue/10 border border-accent-blue/20 px-2 py-0.5 rounded-full font-mono">
                Animated GIF ({frames.length} frames)
              </span>
            )}
          </div>
          {file && (
            <div className="flex items-center gap-2">
              {isGif && frames.length > 1 && (
                <button
                  onClick={() => setIsPlaying(!isPlaying)}
                  className="px-3 py-1.5 rounded-xl border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-xs text-zinc-200 flex items-center gap-1.5 transition-colors"
                >
                  {isPlaying ? <Pause className="w-3.5 h-3.5 text-accent-blue" /> : <Play className="w-3.5 h-3.5 text-accent-blue" />}
                  {isPlaying ? "Pause Preview" : "Play GIF Preview"}
                </button>
              )}
              <Button variant="danger" onClick={handleRemove} className="p-2">
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          )}
        </div>

        {file && fileUrl ? (
          <div className="flex-1 bg-card/10 border border-border rounded-2xl flex items-center justify-center p-6 overflow-hidden relative">
            <canvas
              ref={previewCanvasRef}
              className="max-h-full max-w-full object-contain rounded-lg shadow-xl border border-zinc-800"
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
