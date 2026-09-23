import * as FileSystem from "expo-file-system/legacy";
import { initLlama, LlamaContext } from "llama.rn";
import { getDeviceTotalRamBytes, getMemoryInfo } from "ram-monitor";

export interface GenerateOptions {
  prompt: string;
  nPredict?: number;
  temperature?: number;
  onToken?: (piece: string) => void;
  stop?: string[];
}

/**
 * assemblePrompt (src/rag/pure.ts) hand-builds a plain-text prompt with our
 * own "User:"/"Assistant:"/"Question:" role labels rather than using
 * llama.rn's chat-template API (which would auto-derive stop tokens from
 * the GGUF's own Jinja template) — so nothing tells the model where a turn
 * actually ends. Left unset, a model that's done answering (especially on
 * a short/trivial prompt with little else to say) just keeps predicting
 * tokens and starts hallucinating a fake continuation of the conversation,
 * inventing new "User:" turns rather than stopping. These match our own
 * template's role markers so generation halts the moment it tries to do that.
 */
const DEFAULT_STOP_SEQUENCES = ["\nUser:", "\n\nUser:", "\nQuestion:", "\n\nQuestion:"];

export interface LoadedModelInfo {
  filename: string;
  nCtx: number;
  nThreads: number;
}

// Rough overhead for OS + other apps + this app's own JS/UI runtime, before
// touching the model at all. Conservative on purpose: a warning that fires
// too early is annoying; one that fires too late is a cryptic crash.
const OS_AND_APP_OVERHEAD_BYTES = 2 * 1024 * 1024 * 1024;
// Multiplier from a GGUF file's on-disk size to its rough resident working
// set once loaded (weights actually touched + KV cache) — approximation,
// not a measurement. Matches the estimate used for the catalog's RAM
// compatibility badges (src/ui/CatalogItemCard.tsx).
const MODEL_RAM_OVERHEAD_FACTOR = 1.15;

/**
 * Thin wrapper around llama.rn. Loads a GGUF model with mmap so weights
 * stream from disk rather than being fully resident, keeping peak RAM under
 * the model's working-set size (weights touched + KV cache), not the full
 * file size. No network access anywhere in this module.
 */
export class LlamaEngine {
  private context: LlamaContext | null = null;
  private modelInfo: LoadedModelInfo | null = null;

  async load(modelFilename: string, opts?: { nCtx?: number; nThreads?: number }) {
    const nCtx = opts?.nCtx ?? 4096;
    const nThreads = opts?.nThreads ?? 4;

    // ChatScreen re-mounts (and calls load() again) every time Settings is
    // closed, even if the user didn't touch the model — re-initializing the
    // native llama.cpp context is expensive (seconds, for a multi-GB model),
    // so skip it entirely when nothing actually changed.
    if (
      this.context &&
      this.modelInfo?.filename === modelFilename &&
      this.modelInfo.nCtx === nCtx &&
      this.modelInfo.nThreads === nThreads
    ) {
      return;
    }

    const modelPath = `${FileSystem.documentDirectory}${modelFilename}`;
    const info = await FileSystem.getInfoAsync(modelPath);
    if (!info.exists) {
      throw new Error(
        `Model not found at ${modelPath}. Run the setup wizard to install it first.`
      );
    }
    const fileSizeBytes = (info as { size?: number }).size ?? 0;

    // Release any previously loaded model first (e.g. actually switching
    // models from Settings) so we don't leak the old context's native memory.
    await this.unload();

    // Pre-flight check: a clear "this probably won't fit" message beats a
    // cryptic native failure or an outright OOM crash. Best-effort — if the
    // native RAM readouts aren't available (0), we skip the check rather
    // than block loading on missing data.
    const diagnostics = this.estimateFit(fileSizeBytes);
    if (diagnostics && diagnostics.likelyInsufficient) {
      throw new Error(
        `"${modelFilename}" needs roughly ${diagnostics.estimatedGb}GB of RAM, but this ` +
          `device only has about ${diagnostics.availableGb}GB free (of ${diagnostics.totalGb}GB total). ` +
          `Try a smaller model from Settings > Tone & Model.`
      );
    }

    try {
      this.context = await initLlama({
        model: modelPath,
        use_mlock: false, // avoid pinning full weights in RAM; rely on mmap streaming
        n_ctx: nCtx,
        n_threads: nThreads,
        n_gpu_layers: 0, // CPU-only for broad device compatibility; adjust per-device
      });
      this.modelInfo = { filename: modelFilename, nCtx, nThreads };
    } catch (e: any) {
      // The native error here (from llama.rn/llama.cpp) is often terse
      // ("Failed to initialize context" with no further detail) — append
      // our own RAM estimate so the user (and future debugging) has an
      // actual hypothesis instead of a dead end, per diagnostics above.
      const nativeMessage = e?.message ?? String(e);
      const hint = diagnostics
        ? ` (this device has ~${diagnostics.totalGb}GB RAM, ~${diagnostics.availableGb}GB free; ` +
          `"${modelFilename}" needs roughly ${diagnostics.estimatedGb}GB — likely the cause if those are close)`
        : "";
      throw new Error(`Failed to load "${modelFilename}": ${nativeMessage}${hint}`);
    }
  }

  private estimateFit(
    fileSizeBytes: number
  ): { estimatedGb: string; totalGb: string; availableGb: string; likelyInsufficient: boolean } | null {
    let totalRam = 0;
    let currentRss = 0;
    try {
      totalRam = getDeviceTotalRamBytes();
      currentRss = getMemoryInfo().rssBytes;
    } catch {
      return null;
    }
    if (totalRam <= 0) return null;

    const availableBytes = Math.max(totalRam - currentRss - OS_AND_APP_OVERHEAD_BYTES, 0);
    const estimatedNeedBytes = fileSizeBytes * MODEL_RAM_OVERHEAD_FACTOR;
    const toGb = (b: number) => (b / 1024 / 1024 / 1024).toFixed(1);

    return {
      estimatedGb: toGb(estimatedNeedBytes),
      totalGb: toGb(totalRam),
      availableGb: toGb(availableBytes),
      likelyInsufficient: estimatedNeedBytes > availableBytes,
    };
  }

  async unload() {
    await this.context?.release();
    this.context = null;
    this.modelInfo = null;
  }

  getModelInfo(): LoadedModelInfo | null {
    return this.modelInfo;
  }

  get isLoaded(): boolean {
    return this.context !== null;
  }

  async generate({ prompt, nPredict = 512, temperature = 0.7, onToken, stop }: GenerateOptions): Promise<string> {
    if (!this.context) throw new Error("LlamaEngine: model not loaded");

    let full = "";
    const { text } = await this.context.completion(
      {
        prompt,
        n_predict: nPredict,
        temperature,
        stop: stop ?? DEFAULT_STOP_SEQUENCES,
      },
      (data) => {
        full += data.token;
        onToken?.(data.token);
      }
    );
    return text ?? full;
  }

  /**
   * Signals the native completion loop to stop. The in-flight generate()
   * call's completion() promise resolves normally with whatever text was
   * generated so far — this is llama.cpp's own clean-stop behavior, not an
   * error/abort path, so no try/catch needed around a stopped generate().
   */
  async stop(): Promise<void> {
    await this.context?.stopCompletion();
  }
}

export const llamaEngine = new LlamaEngine();
