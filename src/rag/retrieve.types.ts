import type { ChunkRecord } from "./db";

export interface RetrievedChunk extends ChunkRecord {
  score: number;
  matchType: "lexical" | "semantic" | "hybrid";
}
