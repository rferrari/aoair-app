/**
 * Model catalog. Every model the app can use — bundled or downloadable — is
 * declared here with an expected sha256 so ModelManager can verify integrity
 * and the total footprint can be audited against the 50GB storage cap.
 *
 * `bundled: true` entries ship inside the app build itself (see
 * plugins/withBundledModels.js + modules/bundled-assets) and are installed
 * to the app's document directory on first launch with **no network access**
 * — the app works fully offline immediately after install. Entries with
 * `bundled: false` are optional extras a user can fetch later from the
 * in-app model catalog (src/ui/ModelSetupScreen.tsx), which does use the
 * network, only when the user explicitly taps "Download".
 */

export type AssetKind = "llm" | "embedding";

export interface CatalogModel {
  id: string;
  kind: AssetKind;
  label: string;
  /** Relative path under FileSystem.documentDirectory once installed */
  filename: string;
  sizeBytes: number;
  sha256: string;
  sourceUrl: string;
  license: string;
  description: string;
  /** Ships inside the app build; installed from the bundle, not downloaded. */
  bundled: boolean;
}

export const STORAGE_BUDGET_BYTES = 50 * 1024 * 1024 * 1024; // 50GB
export const RAM_BUDGET_BYTES = 12 * 1024 * 1024 * 1024; // 12GB

/**
 * See docs/MODELS.md for the rationale behind each pick (licensing,
 * size/RAM tradeoffs). Checksums verified against the files fetched by
 * scripts/setup-models.sh (which must run before `expo prebuild` so the
 * bundled entries actually exist to be packaged into the build).
 */
export const MODEL_CATALOG: CatalogModel[] = [
  {
    id: "phi-3.5-mini-instruct-q4km",
    kind: "llm",
    label: "Phi-3.5-mini-instruct (Q4_K_M)",
    filename: "models/primary-llm.gguf",
    sizeBytes: 2393232672,
    sha256: "e4165e3a71af97f1b4820da61079826d8752a2088e313af0c7d346796c38eff5",
    sourceUrl:
      "https://huggingface.co/bartowski/Phi-3.5-mini-instruct-GGUF/resolve/main/Phi-3.5-mini-instruct-Q4_K_M.gguf",
    license: "MIT",
    description:
      "3.8B dense, primary generation model. ~2.2GB. Bundled default.",
    bundled: true,
  },
  {
    id: "bge-small-en-v1.5-q8",
    kind: "embedding",
    label: "bge-small-en-v1.5 (Q8_0)",
    filename: "models/embedding.gguf",
    sizeBytes: 36806944,
    sha256: "ec38e8da142596baa913124ae50550de284b6916bf59577ef2f0cb9660c2f514",
    sourceUrl:
      "https://huggingface.co/CompendiumLabs/bge-small-en-v1.5-gguf/resolve/main/bge-small-en-v1.5-q8_0.gguf",
    license: "MIT",
    description:
      "33M, sentence embeddings for the local vector index. Bundled default.",
    bundled: true,
  },
  // Add more tested candidates here later (each needs a unique `id` and
  // `filename` so it can coexist on disk with other downloaded models).
  // They ship with `bundled: false` and appear in the in-app catalog for
  // the user to optionally download when online.
];

export const BUNDLED_MODELS = MODEL_CATALOG.filter((m) => m.bundled);

export function totalManifestBytes(models: CatalogModel[]): number {
  return models.reduce((sum, m) => sum + m.sizeBytes, 0);
}
