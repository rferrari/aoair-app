import * as FileSystem from "expo-file-system/legacy";
import { initLlama, LlamaContext } from "llama.rn";

export interface GenerateOptions {
  prompt: string;
  nPredict?: number;
  temperature?: number;
  onToken?: (piece: string) => void;
}

/**
 * Thin wrapper around llama.rn. Loads a GGUF model with mmap so weights
 * stream from disk rather than being fully resident, keeping peak RAM under
 * the model's working-set size (weights touched + KV cache), not the full
 * file size. No network access anywhere in this module.
 */
export class LlamaEngine {
  private context: LlamaContext | null = null;

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

    this.context = await initLlama({
      model: modelPath,
      use_mlock: false, // avoid pinning full weights in RAM; rely on mmap streaming
      n_ctx: opts?.nCtx ?? 4096,
      n_threads: opts?.nThreads ?? 4,
      n_gpu_layers: 0, // CPU-only for broad device compatibility; adjust per-device
    });
  }

  async unload() {
    await this.context?.release();
    this.context = null;
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
}

export const llamaEngine = new LlamaEngine();
