# 🛠️ MotionFlow Studio - Technical Guide

This document contains instructions for setting up the environment, compiling, running, and understanding the architecture of **MotionFlow Studio**.

---

## 🏗️ Architecture & Data Flow

MotionFlow Studio utilizes a hybrid frontend/backend desktop architecture:

```mermaid
graph TD
    A[Tauri App Shell / Browser] -->|Renders UI| B[Next.js Dashboard Webview]
    B -->|Convert Images| C1[Client-Side Canvas Processing]
    B -->|Record Screen / Extract Video Frames| C2[Seek-based Canvas Extraction]
    B -->|Edit Individual Frame| FE[Canvas-based FrameEditorModal]
    B -->|Generate GIF / Compress GIF / Optimize GIF| C3[FastAPI Backend Server]
    FE -->|Returns edited frame data URL| B
    C3 -->|Processes images via Pillow & Gifsicle| D[GIF / Lossy LZW Compression Engine]
    C1 -->|Instant Download| E[File System]
    C2 -->|Sends extracted frames| C3
    D -->|Streams file buffer + headers| B
```

*   **Next.js & Framer Motion** provide the user-interactive editor interface with persistent keep-alive tool mounting (`invisible pointer-events-none` state retention across sidebar navigation).
*   **FrameEditorModal** enables pixel-level operations (filters, rotation, text overlays) client-side using canvas, feeding modified frame buffer URLs back to the editor state.
*   **HTML5 Media, Canvas & WebCodecs APIs** are used for client-side GIF-to-video conversion (`ImageDecoder` + `MediaRecorder`), screen recording (1–60 FPS with live timer, quality presets, and pause/resume), video playback slicing (including interactive dual-handle trimming with 1–60 FPS extraction and real-time seek preview), and format conversions without backend roundtrips.
*   **FastAPI, Pillow & Gifsicle** handle bulk GIF compilation, custom per-frame delays (`durations` parameter), and advanced lossy/lossless LZW optimization (`/optimize-gif` via bundled Gifsicle executable) at `localhost:8000`.
*   **Tauri** acts as the native desktop wrapper, hosting the web views securely.

---

## ⚙️ Prerequisites

To run or build the application locally, you will need the following tools installed on your machine:

1. **Node.js** (v18.x or higher) & **npm**
2. **Python** (v3.10.x or higher)
3. **Rust Toolchain** (For building the Tauri desktop wrapper)
   - Install via [rustup](https://rustup.rs/).
   - Ensure the `cargo` command is available in your PATH.

---

## 🚀 Setup & Execution

### 1. Backend Service (FastAPI)

1. Open a terminal and navigate to the backend directory:
   ```bash
   cd src-tauri/python-backend
   ```

2. Set up a virtual environment and activate it:
   ```bash
   # Create environment
   python -m venv venv
   
   # Activate (Windows PowerShell)
   .\venv\Scripts\Activate.ps1
   
   # Activate (macOS/Linux)
   source venv/bin/activate
   ```

3. Install the required Python libraries:
   ```bash
   pip install -r requirements.txt
   ```

4. Start the FastAPI development server:
   ```bash
   uvicorn main:app --reload
   ```
   *The backend will now listen for image payloads at `http://127.0.0.1:8000/generate-gif`.*

---

### 2. Frontend & Tauri Wrapper

Open a new terminal window at the project root directory.

1. Install Node modules:
   ```bash
   npm install
   ```

2. Run the application:

   - **Development Browser Sandbox** (Run without Rust/Cargo setup):
     ```bash
     npm run dev
     ```
     Open [http://localhost:3000](http://localhost:3000) to test, modify, and preview changes.

   - **Tauri Desktop Mode** (Runs inside native desktop shell):
     ```bash
     npm run tauri dev
     ```

---

## 📁 Repository Directory Structure

```text
/ (Project Root - Next.js Application)
├── src/
│   ├── app/
│   │   ├── layout.tsx       # Root Next.js layout structure
│   │   ├── page.tsx         # Main UI workstation layout
│   │   └── globals.css      # Core Tailwind styling & custom scrollbar definitions
│   ├── components/
│   │   ├── DragDropZone.tsx # Framer-motion files drop zone
│   │   ├── PreviewGrid.tsx  # Animated, layout-aware preview deck
│   │   ├── SettingsPanel.tsx# Generation parameter inputs
│   │   ├── tools/           # Specialized tool components
│   │   │   ├── GifCreator.tsx       # GIF Timeline, reordering & timing logic
│   │   │   ├── FrameEditorModal.tsx # Canvas frame rotation, text, and filters
│   │   │   ├── VideoToGif.tsx
│   │   │   ├── GifToVideo.tsx       # WebCodecs + MediaRecorder GIF-to-MP4/WebM converter
│   │   │   ├── MemeStudio.tsx       # Animated Meme Generator, Logo Watermarking & Badge Stamps
│   │   │   ├── BgRemover.tsx        # Neural AI background removal & chroma color keying
│   │   │   ├── FrameExtractor.tsx   # Decomposes GIFs into frames & client-side JSZip packaging
│   │   │   ├── GifCompressor.tsx
│   │   │   ├── ImageConverter.tsx
│   │   │   └── ScreenRecorder.tsx
│   │   └── ui/              # Shadcn/ui-inspired primitive components
│   │       ├── button.tsx
│   │       └── input.tsx
│   └── lib/
│       ├── api.ts           # Axios/Fetch client connecting to Python endpoints
│       └── utils.ts         # Global Tailwind classes merge utility (cn)
├── src-tauri/
│   ├── Cargo.toml           # Rust desktop configurations and dependencies
│   ├── build.rs             # Tauri compilation script
│   ├── tauri.conf.json      # Tauri app dimensions, menus, and bundles
│   ├── src/
│   │   └── main.rs          # Tauri wrapper entrypoint
│   └── python-backend/
│       ├── main.py          # FastAPI application & Gifsicle subprocess handler
│       ├── bin/
│       │   └── gifsicle.exe # Bundled Gifsicle CLI binary for lossy LZW compression
│       └── requirements.txt # Python package declarations
├── package.json             # Node script triggers and configurations
├── tailwind.config.ts       # Tailwind CSS configurations
└── tsconfig.json            # TypeScript compile configurations
```

---

## 🛠️ Build Commands

### Create Production Web Bundle
```bash
npm run build
```

### Compile Native Desktop Installer (via Tauri)
```bash
npm run tauri build
```
*(Compiled output will be placed inside `src-tauri/target/release/bundle/`)*
