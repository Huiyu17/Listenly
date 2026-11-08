# Listenly — AI English Dictation Practice

Upload an English recording, transcribe it **in your browser** with OpenAI Whisper, correct the transcript, and practise
intensive listening with an auto-generated fill-in-the-blanks exercise.

No paid APIs, no API keys, no server-side inference, no uploads: the audio never leaves the device.

```
Upload audio → Local Whisper transcription → Review transcript → Generate blanks → Listening practice → Grading → Mistake review
```

## Quick start

Requirements: Node.js 20+ (tested with 22) and npm.

```bash
npm install
npm run dev          # http://localhost:3000
```

Other scripts:

| Command             | What it does                                   |
| ------------------- | ---------------------------------------------- |
| `npm run build`     | Production build (also type-checks)            |
| `npm start`         | Serve the production build                     |
| `npm test`          | Unit tests (Vitest)                            |
| `npm run typecheck` | `tsc --noEmit`                                 |

No environment variables are required.

### Deploying to Vercel

Import the repository in Vercel (framework preset **Next.js**) and deploy — no configuration or secrets needed.

## How it works

### Transcription (`src/workers/whisper.worker.ts`, `src/lib/transcription/`)

- Model: [`onnx-community/whisper-tiny.en`](https://huggingface.co/onnx-community/whisper-tiny.en) via
  [Transformers.js](https://github.com/huggingface/transformers.js) (`@huggingface/transformers` 3.8).
- Inference runs in a **Web Worker**, so the UI stays responsive. The worker is created only when you click
  *Transcribe* — nothing is downloaded on page load.
- **WebGPU** is used when an adapter is available (fp32 encoder + q4 decoder, ≈120 MB). Otherwise, or if WebGPU fails to
  initialise, it falls back to **WASM/CPU** (fp32 encoder + q8 decoder, ≈65 MB). You can also force either backend.
  (q8 weights on WebGPU were measured to produce garbage output in Chrome, so that combination is deliberately avoided.)
- Model weights are fetched once from Hugging Face (ONNX Runtime's `.wasm` binaries from jsDelivr) and cached by the
  browser. Those are the only network requests; audio is never sent anywhere.
- Audio is decoded with the Web Audio API and resampled to 16 kHz mono with an `OfflineAudioContext`.
- Long recordings use Whisper's 30 s windows with 5 s stride; progress is reported per window, with live partial text.
- `return_timestamps: true` gives segment-level timestamps. They are validated (finite, ordered, inside the audio) and
  any invalid timing is **dropped rather than guessed**.
- **Gap recovery:** small Whisper models sometimes stop early and silently drop trailing sentences. After the main
  pass, the worker looks for stretches that contain speech energy but no transcript segment, re-transcribes just those
  slices, and merges the results on the original timeline (`src/lib/transcription/gaps.ts`).

### Transcript review (`src/components/views/review-view.tsx`)

Segments are split into sentences. Each sentence carries the time span of the Whisper segment(s) it came from:

- **segment** — the sentence is exactly one Whisper segment;
- **approximate (≈)** — several sentences share a segment, or a sentence spans segments, so replay may include nearby
  speech;
- **none** — no valid timing; only whole-audio playback is offered.

Sentences can be edited, merged or deleted. Edits autosave until an exercise exists; after that, confirming changes
regenerates the exercise.

### Blank generation (`src/lib/exercise/generate.ts`)

Deterministic and **rule-based — no LLM or semantic analysis**:

1. Tokenise each sentence (contractions, hyphenated words and numbers stay whole; punctuation stays outside blanks).
2. Words in a stop-word list are never blanked on their own. The rest are *eligible*.
3. Each word is scored per difficulty using an embedded frequency list, word length and simple morphology:
   - **Easy (15 %)** – common content words, single words only, no proper nouns.
   - **Medium (30 %)** – verb/adverb-like words (suffix heuristics + verb list), mid-frequency vocabulary, short phrases.
   - **Hard (45 %)** – rarer/longer vocabulary and multiword expressions (fixed phrases, phrasal verbs).
4. Highest scores are chosen until the target share of eligible words is reached, with spacing and per-sentence caps
   so blanks are spread out. A seeded hash breaks ties; *Regenerate* changes only the seed.

The percentage can be customised from 5 % to 80 %.

### Grading (`src/lib/exercise/grade.ts`)

Local and deterministic: case-insensitive; ignores surrounding punctuation and extra whitespace; curly/straight
apostrophes and hyphen/space are equivalent; digits and number words up to twenty plus tens match ("ten" = "10").
Meaningful differences are kept (`its` ≠ `it's`, `walk` ≠ `walked`). Near misses (1–2 edits) are flagged as
"Almost — check spelling" but still count as wrong. Revealed answers never count as correct. Attempts and hints are
tracked per blank.

### Storage (`src/lib/storage/db.ts`)

IndexedDB stores exercise metadata, the transcript, blank layout and answers, responses, status and every result. The
audio blob is stored too when the storage estimate allows it; otherwise the exercise is marked *Re-upload audio* and
you'll be asked to select the file again (all other data is kept). If IndexedDB is unavailable (some private modes),
an in-memory fallback is used for the current tab, and the home page says so.

## Practice shortcuts

| Key               | Action                                   |
| ----------------- | ---------------------------------------- |
| Enter             | Check sentence (press again to continue) |
| Tab / Shift+Tab   | Next / previous blank                    |
| Alt+K             | Play / pause                             |
| Alt+J / Alt+L     | Back / forward 5 s                       |
| Alt+R             | Replay current sentence                  |
| Alt+H             | Hint (first letter, then more letters)   |
| Alt+N / Alt+P     | Next / previous sentence                 |

## Project layout

```
src/
  app/                         Next.js App Router pages (home, /exercises/[id]/{review,setup,practice,results})
  components/                  UI (shadcn-style primitives in components/ui, page views in components/views)
  hooks/                       useExercise (IndexedDB-backed state), useAudioPlayer (range playback)
  lib/audio/                   validation, decoding and resampling
  lib/transcription/           worker protocol, client façade, gap recovery
  lib/transcript/              timestamp validation, sentence splitting/alignment
  lib/exercise/                blank generation, grading, session helpers
  lib/storage/                 IndexedDB persistence
  lib/text/                    tokenizer and word lists
  workers/whisper.worker.ts    Transformers.js inference worker
tests/                         Vitest unit tests
```

## Limits and browser notes

- Recordings up to 10 minutes and 60 MB. MP3 and WAV decode everywhere; M4A/AAC depends on the browser's codecs
  (ALAC-in-M4A fails in some browsers — convert to MP3 if decoding fails).
- Whisper tiny.en is fast but imperfect, so the transcript review step matters: fix names, numbers and misheard words.
- WebGPU needs a recent Chromium-based browser (or Safari/Firefox with WebGPU enabled); everything else uses WASM.
