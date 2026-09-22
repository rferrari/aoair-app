/**
 * Model + index manifest. Every offline asset the app depends on is declared
 * here with an expected sha256 so ModelManager can verify integrity and the
 * total footprint can be audited against the 50GB storage cap.
 */

export type AssetKind = "llm" | "embedding" | "fts-index" | "vector-index";

export interface ManifestAsset {
  id: string;
  kind: AssetKind;
  /** Relative path under FileSystem.documentDirectory */
  filename: string;
  /** Expected file size in bytes, used for storage-budget checks before download */
  sizeBytes: number;
  sha256: string;
  /**
   * Where to fetch this asset during setup. Never fetched at app runtime —
   * only by the one-time setup wizard / scripts/setup-models.sh, with the
   * device online. The shipped app itself never calls this URL.
   */
  setupSourceUrl?: string;
  description: string;
}

export const STORAGE_BUDGET_BYTES = 50 * 1024 * 1024 * 1024; // 50GB
export const RAM_BUDGET_BYTES = 12 * 1024 * 1024 * 1024; // 12GB

/**
 * Default manifest. See docs/MODELS.md for the rationale behind each pick
 * (licensing, size/RAM tradeoffs). Checksums verified against the files
 * fetched by scripts/setup-models.sh.
 */
export const DEFAULT_MANIFEST: ManifestAsset[] = [
  {
    id: "primary-llm",
    kind: "llm",
    filename: "models/primary-llm.gguf",
    sizeBytes: 2393232672,
    sha256: "e4165e3a71af97f1b4820da61079826d8752a2088e313af0c7d346796c38eff5",
    setupSourceUrl:
      "https://huggingface.co/bartowski/Phi-3.5-mini-instruct-GGUF/resolve/main/Phi-3.5-mini-instruct-Q4_K_M.gguf",
    description:
      "Phi-3.5-mini-instruct (MIT), 3.8B dense, Q4_K_M — primary generation model.",
  },
  {
    id: "embedding-model",
    kind: "embedding",
    filename: "models/embedding.gguf",
    sizeBytes: 36806944,
    sha256: "ec38e8da142596baa913124ae50550de284b6916bf59577ef2f0cb9660c2f514",
    setupSourceUrl:
      "https://huggingface.co/CompendiumLabs/bge-small-en-v1.5-gguf/resolve/main/bge-small-en-v1.5-q8_0.gguf",
    description:
      "bge-small-en-v1.5 (MIT), 33M, Q8_0 — sentence embeddings for the local vector index.",
  },
];

export function totalManifestBytes(manifest: ManifestAsset[]): number {
  return manifest.reduce((sum, a) => sum + a.sizeBytes, 0);
}
