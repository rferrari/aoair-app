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
 * Default manifest. Fill in sha256 + setupSourceUrl once models are chosen
 * and benchmarked on-device (see docs/MODELS.md). Kept empty-safe so the app
 * can run its integrity check even before assets are chosen.
 */
export const DEFAULT_MANIFEST: ManifestAsset[] = [
  {
    id: "primary-llm",
    kind: "llm",
    filename: "models/primary-llm.gguf",
    sizeBytes: 0,
    sha256: "",
    description:
      "Primary quantized instruct model (GGUF, Q4_K_M or similar) for generation and reasoning.",
  },
  {
    id: "embedding-model",
    kind: "embedding",
    filename: "models/embedding.gguf",
    sizeBytes: 0,
    sha256: "",
    description:
      "Sub-300MB sentence-embedding model used to build/query the local vector index.",
  },
];

export function totalManifestBytes(manifest: ManifestAsset[]): number {
  return manifest.reduce((sum, a) => sum + a.sizeBytes, 0);
}
