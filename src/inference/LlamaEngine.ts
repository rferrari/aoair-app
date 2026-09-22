import * as FileSystem from "expo-file-system/legacy";
import { initLlama, LlamaContext } from "llama.rn";

export interface GenerateOptions {
  prompt: string;
  nPredict?: number;
  temperature?: number;
  onToken?: (piece: string) => void;
}

export interface LoadedModelInfo {
  filename: string;
  nCtx: number;
  nThreads: number;
}

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
    const modelPath = `${FileSystem.documentDirectory}${modelFilename}`;
    const info = await FileSystem.getInfoAsync(modelPath);
    if (!info.exists) {
      throw new Error(
        `Model not found at ${modelPath}. Run the setup wizard to install it first.`
      );
    }

    // Release any previously loaded model first (e.g. switching models from
    // Settings re-mounts ChatScreen and calls load() again) so we don't leak
    // the old context's native memory.
    await this.unload();

    const nCtx = opts?.nCtx ?? 4096;
    const nThreads = opts?.nThreads ?? 4;

    this.context = await initLlama({
      model: modelPath,
      use_mlock: false, // avoid pinning full weights in RAM; rely on mmap streaming
      n_ctx: nCtx,
      n_threads: nThreads,
      n_gpu_layers: 0, // CPU-only for broad device compatibility; adjust per-device
    });
    this.modelInfo = { filename: modelFilename, nCtx, nThreads };
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

  async generate({ prompt, nPredict = 512, temperature = 0.7, onToken }: GenerateOptions): Promise<string> {
    if (!this.context) throw new Error("LlamaEngine: model not loaded");

    let full = "";
    const { text } = await this.context.completion(
      {
        prompt,
        n_predict: nPredict,
        temperature,
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
