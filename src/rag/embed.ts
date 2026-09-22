import { LlamaContext, initLlama } from "llama.rn";
import * as FileSystem from "expo-file-system/legacy";

/**
 * Wraps a small local embedding model (GGUF, <300MB) via llama.rn's
 * embedding mode. Kept as a separate, lighter-weight context from the main
 * generation LLM so it can stay resident cheaply for fast retrieval without
 * competing with the primary model's RAM budget.
 */
export class EmbeddingEngine {
  private context: LlamaContext | null = null;

  async load(modelFilename: string) {
    const modelPath = `${FileSystem.documentDirectory}${modelFilename}`;
    const info = await FileSystem.getInfoAsync(modelPath);
    if (!info.exists) {
      throw new Error(`Embedding model not found at ${modelPath}`);
    }
    this.context = await initLlama({
      model: modelPath,
      embedding: true,
      n_ctx: 512,
      n_threads: 2,
    });
  }

  async embed(text: string): Promise<Float32Array> {
    if (!this.context) throw new Error("EmbeddingEngine: model not loaded");
    const result = await this.context.embedding(text);
    return Float32Array.from(result.embedding);
  }
}

export const embeddingEngine = new EmbeddingEngine();

export { cosineSimilarity } from "./pure";
