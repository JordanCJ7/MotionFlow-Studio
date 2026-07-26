"use client";

import React, { useState, useRef, useEffect } from "react";
import { Layers, Sparkles, Upload, Download, Loader2, Trash2, CheckSquare, Square, FolderArchive, Image as ImageIcon, Film } from "lucide-react";
import { Button } from "@/components/ui/button";
import JSZip from "jszip";

interface ExtractedFrame {
  id: string;
  index: number;
  canvas: HTMLCanvasElement;
  durationMs: number;
  dataUrl: string;
  blob: Blob;
  selected: boolean;
}

export const FrameExtractor: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [frames, setFrames] = useState<ExtractedFrame[]>([]);
  const [exportFormat, setExportFormat] = useState<"png" | "jpeg" | "webp">("png");

  // Processing State
  const [isExtracting, setIsExtracting] = useState<boolean>(false);
  const [isZipping, setIsZipping] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const [statusText, setStatusText] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (fileUrl) URL.revokeObjectURL(fileUrl);
    };
  }, [fileUrl]);

  // Extract Frames from GIF
  const extractFramesFromGif = async (selectedFile: File) => {
    setError(null);
    setFile(selectedFile);
    setIsExtracting(true);
    setProgress(0);
    setStatusText("Preparing decoder...");

    const url = URL.createObjectURL(selectedFile);
    setFileUrl(url);

    try {
      const extracted: ExtractedFrame[] = [];

      if ("ImageDecoder" in window) {
        // WebCodecs ImageDecoder
        const stream = selectedFile.stream();
        // @ts-ignore
        const decoder = new ImageDecoder({ data: stream, type: "image/gif" });
        await decoder.tracks.ready;

        const track = decoder.tracks.selectedTrack;
        const totalFrames = track?.frameCount || 1;

        for (let i = 0; i < totalFrames; i++) {
          setStatusText(`Extracting frame ${i + 1} of ${totalFrames}...`);
          setProgress(Math.round(((i + 1) / totalFrames) * 100));

          const result = await decoder.decode({ frameIndex: i });
          const imageFrame = result.image;

          const canvas = document.createElement("canvas");
          canvas.width = imageFrame.displayWidth;
          canvas.height = imageFrame.displayHeight;
          const ctx = canvas.getContext("2d")!;
          ctx.drawImage(imageFrame, 0, 0);

          const durationMs = imageFrame.duration ? imageFrame.duration / 1000 : 100;
          const dataUrl = canvas.toDataURL(`image/${exportFormat}`);
          const blob = await new Promise<Blob>((res) => canvas.toBlob((b) => res(b!), `image/${exportFormat}`));

          extracted.push({
            id: Math.random().toString(36).substring(2, 9),
            index: i + 1,
            canvas,
            durationMs,
            dataUrl,
            blob,
            selected: true,
          });

          imageFrame.close();
        }
      } else {
        // Fallback static single frame
        const img = new Image();
        img.src = url;
        await new Promise((res) => { img.onload = res; });

        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0);

        const dataUrl = canvas.toDataURL(`image/${exportFormat}`);
        const blob = await new Promise<Blob>((res) => canvas.toBlob((b) => res(b!), `image/${exportFormat}`));

        extracted.push({
          id: Math.random().toString(36).substring(2, 9),
          index: 1,
          canvas,
          durationMs: 1000,
          dataUrl,
          blob,
          selected: true,
        });
      }

      setFrames(extracted);
      setStatusText(`Extracted ${extracted.length} frames successfully!`);
    } catch (err: any) {
      setError(err.message || "Failed to extract frames from GIF.");
    } finally {
      setIsExtracting(false);
    }
  };

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected && selected.type === "image/gif") {
      extractFramesFromGif(selected);
    } else if (selected) {
      setError("Please select a valid animated GIF file.");
    }
  };

  const handleRemove = () => {
    if (fileUrl) URL.revokeObjectURL(fileUrl);
    setFile(null);
    setFileUrl(null);
    setFrames([]);
    setError(null);
    setStatusText("");
  };

  // Selection Toggles
  const toggleFrameSelection = (id: string) => {
    setFrames((prev) =>
      prev.map((f) => (f.id === id ? { ...f, selected: !f.selected } : f))
    );
  };

  const toggleSelectAll = () => {
    const allSelected = frames.every((f) => f.selected);
    setFrames((prev) => prev.map((f) => ({ ...f, selected: !allSelected })));
  };

  // Single Frame Download
  const downloadSingleFrame = (frame: ExtractedFrame) => {
    const a = document.createElement("a");
    a.href = frame.dataUrl;
    const baseName = file?.name.replace(/\.gif$/i, "") || "frame";
    a.download = `${baseName}_frame_${String(frame.index).padStart(3, "0")}.${exportFormat}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // Download ZIP Package
  const handleExportZip = async () => {
    const selectedFrames = frames.filter((f) => f.selected);
    if (selectedFrames.length === 0) {
      setError("Please select at least one frame to export.");
      return;
    }

    setError(null);
    setIsZipping(true);
    setStatusText("Packaging frames into ZIP...");

    try {
      const zip = new JSZip();
      const baseName = file?.name.replace(/\.gif$/i, "") || "gif_frames";
      const folder = zip.folder(baseName) || zip;

      for (const frame of selectedFrames) {
        // Re-generate blob in chosen format if format changed
        const blob = await new Promise<Blob>((res) =>
          frame.canvas.toBlob((b) => res(b!), `image/${exportFormat}`)
        );
        const fileName = `frame_${String(frame.index).padStart(3, "0")}.${exportFormat}`;
        folder.file(fileName, blob);
      }

      // Generate metadata JSON file
      const meta = {
        originalFileName: file?.name,
        totalFrames: frames.length,
        exportedFrames: selectedFrames.length,
        format: exportFormat,
        frames: selectedFrames.map((f) => ({
          index: f.index,
          durationMs: f.durationMs,
          width: f.canvas.width,
          height: f.canvas.height,
        })),
      };
      folder.file("metadata.json", JSON.stringify(meta, null, 2));

      setStatusText("Generating ZIP archive...");
      const content = await zip.generateAsync({ type: "blob" });

      const url = URL.createObjectURL(content);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${baseName}_frames.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setStatusText("ZIP export complete!");
    } catch (err: any) {
      setError(err.message || "Failed to create ZIP package.");
    } finally {
      setIsZipping(false);
    }
  };

  const selectedCount = frames.filter((f) => f.selected).length;

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Settings Side Panel */}
      <section className="w-80 md:w-96 border-r border-border bg-card/20 flex flex-col h-full overflow-y-auto p-6 gap-6 shrink-0">
        <div className="flex items-center gap-2 text-zinc-300">
          <FolderArchive className="w-4 h-4 text-accent-blue" />
          <h2 className="text-sm font-semibold">Frame Extractor Settings</h2>
        </div>

        {/* Configuration Panel */}
        <div className="flex flex-col gap-5 bg-card/40 border border-border p-5 rounded-2xl">
          <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">
            Export Format
          </h3>

          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium text-zinc-400">Image Format</label>
            <div className="grid grid-cols-3 gap-1.5">
              {(["png", "jpeg", "webp"] as const).map((fmt) => (
                <button
                  key={fmt}
                  type="button"
                  onClick={() => setExportFormat(fmt)}
                  className={`py-2 rounded-xl border text-xs font-bold font-mono uppercase transition-all ${
                    exportFormat === fmt
                      ? "border-accent-blue bg-accent-blue/10 text-white"
                      : "border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
                  }`}
                >
                  {fmt}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-zinc-500 mt-1">
              PNG preserves full transparency and lossless quality.
            </p>
          </div>
        </div>

        {/* Info Deck */}
        {file && frames.length > 0 && (
          <div className="bg-card/30 border border-border/50 rounded-xl p-4 flex flex-col gap-2">
            <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Extraction Details</p>
            <div className="grid grid-cols-2 gap-2 text-xs font-mono text-zinc-300">
              <div>Total Frames: <span className="font-bold text-white">{frames.length}</span></div>
              <div>Selected: <span className="font-bold text-accent-blue">{selectedCount}</span></div>
              <div>Resolution: <span className="font-bold text-white">{frames[0].canvas.width}×{frames[0].canvas.height}</span></div>
              <div>Size: <span className="font-bold text-white">{(file.size / 1024 / 1024).toFixed(2)} MB</span></div>
            </div>
          </div>
        )}

        {/* Action Button */}
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
            disabled={!file || frames.length === 0 || selectedCount === 0 || isZipping}
            onClick={handleExportZip}
            className="w-full py-3 text-sm font-semibold rounded-xl flex items-center gap-2 justify-center"
          >
            {isZipping ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-white" />
                Packaging ZIP...
              </>
            ) : (
              <>
                <FolderArchive className="w-4 h-4 text-white" />
                Export {selectedCount} Frames as ZIP
              </>
            )}
          </Button>
        </div>
      </section>

      {/* Main Extracted Frame Grid Deck */}
      <section className="flex-1 flex flex-col h-full overflow-hidden p-6 gap-4 bg-zinc-950/20">
        <div className="flex items-center justify-between text-zinc-300 shrink-0">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-accent-blue" />
            <h2 className="text-sm font-semibold">Extracted Frame Deck</h2>
            {frames.length > 0 && (
              <span className="text-[10px] text-zinc-500 bg-zinc-900 border border-border px-2 py-0.5 rounded-full font-mono">
                {frames.length} frames
              </span>
            )}
          </div>

          {frames.length > 0 && (
            <div className="flex items-center gap-2">
              <button
                onClick={toggleSelectAll}
                className="px-3 py-1.5 rounded-xl border border-border bg-card/40 hover:bg-card/70 text-xs text-zinc-300 flex items-center gap-1.5 transition-colors"
              >
                {frames.every((f) => f.selected) ? <CheckSquare className="w-3.5 h-3.5 text-accent-blue" /> : <Square className="w-3.5 h-3.5" />}
                {frames.every((f) => f.selected) ? "Deselect All" : "Select All"}
              </button>
              <Button variant="danger" onClick={handleRemove} className="p-2">
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          )}
        </div>

        {file && frames.length > 0 ? (
          <div className="flex-1 overflow-y-auto pr-1">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {frames.map((frame) => (
                <div
                  key={frame.id}
                  onClick={() => toggleFrameSelection(frame.id)}
                  className={`group relative rounded-2xl border p-2.5 flex flex-col gap-2 cursor-pointer transition-all duration-200 ${
                    frame.selected
                      ? "border-accent-blue/50 bg-accent-blue/5 shadow-[0_0_15px_rgba(59,130,246,0.08)]"
                      : "border-border/60 bg-card/20 hover:border-zinc-700 opacity-60 hover:opacity-100"
                  }`}
                >
                  {/* Thumbnail */}
                  <div className="relative aspect-square w-full rounded-xl overflow-hidden bg-zinc-950 border border-border flex items-center justify-center">
                    <img src={frame.dataUrl} alt={`Frame ${frame.index}`} className="w-full h-full object-contain" />

                    {/* Frame Index Badge */}
                    <div className="absolute top-1.5 left-1.5 bg-black/80 backdrop-blur-sm text-[10px] font-mono font-bold text-zinc-300 px-1.5 py-0.5 rounded-md border border-zinc-800">
                      #{frame.index}
                    </div>

                    {/* Checkbox badge */}
                    <div className="absolute top-1.5 right-1.5">
                      {frame.selected ? (
                        <CheckSquare className="w-4 h-4 text-accent-blue drop-shadow" />
                      ) : (
                        <Square className="w-4 h-4 text-zinc-500 drop-shadow" />
                      )}
                    </div>
                  </div>

                  {/* Meta & Download action */}
                  <div className="flex items-center justify-between text-[10px] text-zinc-400 font-mono px-0.5">
                    <span>{Math.round(frame.durationMs)}ms</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        downloadSingleFrame(frame);
                      }}
                      className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
                      title="Download single frame"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div
            onClick={() => fileInputRef.current?.click()}
            className="flex-1 border-2 border-dashed border-border hover:border-zinc-700 bg-card/40 rounded-2xl flex flex-col items-center justify-center text-center p-6 cursor-pointer transition-colors duration-300"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/gif"
              onChange={handleFileSelected}
              className="hidden"
            />
            <div className="mb-4 p-3 rounded-full bg-zinc-900 border border-border">
              <Upload className="w-8 h-8 text-zinc-400" />
            </div>
            <p className="mb-2 text-sm text-zinc-300">
              <span className="font-semibold text-accent-blue">Click to upload GIF</span> or drag and drop
            </p>
            <p className="text-xs text-zinc-500">Decompose animated GIF into individual PNG, JPEG, or WebP frames</p>
          </div>
        )}
      </section>
    </div>
  );
};
