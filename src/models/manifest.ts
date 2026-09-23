/**
 * Model + corpus catalog. Every asset the app can use is declared here with
 * an expected sha256 so ModelManager can verify integrity and the total
 * footprint can be audited against the 50GB storage cap.
 *
 * `required: true` entries are the default LLM + embedding model. They are
 * NOT bundled inside the app build (that keeps the installable app small
 * and fast to build/ship — see modules/bundled-assets + plugins/withBundledModels.js
 * for an alternate fully-bundled build path, still available but not used
 * by default). Instead, on first launch the app shows a mandatory setup
 * screen (src/ui/ModelSetupScreen.tsx in "required" mode) that downloads
 * them — the ONLY time the app needs network access. Once downloaded, the
 * app works fully offline from then on, matching the bounty's "work
 * completely offline once installed" requirement (installed = app +
 * one-time model setup complete).
 *
 * `required: false` entries are optional extras a user can fetch later from
 * the same Models/Settings screen in its normal (non-blocking) mode — either
 * an alternate LLM, or a corpus pack (see TIERS below).
 */

import type { ModelCapabilities } from "../routing/types";

export type AssetKind = "llm" | "embedding" | "corpus";
export type SetupTier = "minimum" | "standard" | "full";

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
  /** Must be downloaded before the app can be used; the default model for its kind. */
  required: boolean;
  /**
   * Ships inside the app build itself (see plugins/withBundledModels.js).
   * Not used by default — see module doc comment — but kept available.
   */
  bundled?: boolean;
  /**
   * Which adaptive-routing roles this model is hand-curated as suitable
   * for (see src/routing/types.ts's ModelCapabilities doc comment — a
   * maintainer's judgment call based on parameter count/class, not a
   * benchmark result). Absent/undefined for entries added before this field
   * existed and for anything from discoveredModels.ts (Hugging Face search
   * results aren't vetted the same way as this curated catalog) — routing
   * resolution must treat "no capabilities" as "not yet assessed", never
   * assume a role.
   */
  capabilities?: ModelCapabilities;
}

export const STORAGE_BUDGET_BYTES = 50 * 1024 * 1024 * 1024; // 50GB
export const RAM_BUDGET_BYTES = 12 * 1024 * 1024 * 1024; // 12GB

/**
 * See docs/MODELS.md for the rationale behind each pick (licensing,
 * size/RAM tradeoffs). Model checksums verified against the files fetched
 * by scripts/setup-models.sh; corpus pack checksums verified against files
 * built by scripts/build-corpus-tier.mjs and committed to this repo (hosted
 * for download via raw.githubusercontent.com — no separate server needed).
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
    description: "3.8B dense, primary generation model. ~2.2GB. Default.",
    required: true,
    capabilities: { roles: ["general", "reasoning"] },
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
    description: "33M, sentence embeddings for the local vector index. Default.",
    required: true,
    capabilities: { roles: ["embedding"] },
  },
  {
    id: "qwen2.5-1.5b-instruct-q4km",
    kind: "llm",
    label: "Qwen2.5-1.5B-Instruct (Q4_K_M)",
    filename: "models/qwen2.5-1.5b-instruct-q4km.gguf",
    sizeBytes: 986048768,
    sha256: "1adf0b11065d8ad2e8123ea110d1ec956dab4ab038eab665614adba04b6c3370",
    sourceUrl:
      "https://huggingface.co/bartowski/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/Qwen2.5-1.5B-Instruct-Q4_K_M.gguf",
    license: "Apache-2.0",
    description: "1.5B dense, fast/lightweight secondary model. ~1.0GB. Downloaded at first-run setup alongside the primary model, giving adaptive routing two real models to switch between from the start.",
    required: true,
    // Real-device Phase 9 test ("whats up?" -> a long, rambling,
    // free-associated multi-question response) traced to the app's
    // hand-built "Question: ...\n\nAnswer:" prompt shape being outside
    // Qwen2.5-Instruct's own fine-tuned ChatML template — see
    // routing/types.ts's ModelCapabilities.usesChatTemplate doc comment.
    capabilities: { roles: ["fast"], usesChatTemplate: true },
  },
  {
    id: "qwen2.5-7b-instruct-q4km",
    kind: "llm",
    label: "Qwen2.5-7B-Instruct (Q4_K_M)",
    filename: "models/qwen2.5-7b-instruct-q4km.gguf",
    sizeBytes: 4683074240,
    sha256: "65b8fcd92af6b4fefa935c625d1ac27ea29dcb6ee14589c55a8f115ceaaa1423",
    sourceUrl:
      "https://huggingface.co/bartowski/Qwen2.5-7B-Instruct-GGUF/resolve/main/Qwen2.5-7B-Instruct-Q4_K_M.gguf",
    license: "Apache-2.0",
    description: "7B dense, stronger reasoning, more RAM/storage/time. ~4.7GB.",
    required: false,
    capabilities: { roles: ["reasoning", "verifier"] },
  },
  {
    id: "corpus-standard",
    kind: "corpus",
    label: "Standard knowledge base (+1,000 topics)",
    filename: "corpus/corpus-standard.json",
    sizeBytes: 614084,
    sha256: "2aeff76db48098851e1304fb37dc8013d9facf9214395897e7e05f276f85d2ff",
    sourceUrl:
      "https://raw.githubusercontent.com/rferrari/boar-app/main/assets/corpus/corpus-standard.json",
    license: "CC BY-SA 4.0 (Wikipedia)",
    description: "1,000 additional Wikipedia-derived topics for local RAG. ~600KB.",
    required: false,
  },
  {
    id: "corpus-full",
    kind: "corpus",
    label: "Full knowledge base (+4,000 topics)",
    filename: "corpus/corpus-full.json",
    sizeBytes: 2530725,
    sha256: "6d602003bb9da59200e3e55b75b9e15bb073a4b9b1357da2c2d47b2803c570be",
    sourceUrl:
      "https://raw.githubusercontent.com/rferrari/boar-app/main/assets/corpus/corpus-full.json",
    license: "CC BY-SA 4.0 (Wikipedia)",
    description: "4,000 more Wikipedia-derived topics for local RAG. ~2.4MB.",
    required: false,
  },
  // Add more tested candidates / corpus packs here later (each needs a
  // unique `id` and `filename`). They ship with `required: false` and
  // appear in the Settings screen as optional downloads.
];

export const REQUIRED_MODELS = MODEL_CATALOG.filter((m) => m.required);
export const CORPUS_CATALOG = MODEL_CATALOG.filter((m) => m.kind === "corpus");

export interface TierDefinition {
  id: SetupTier;
  label: string;
  description: string;
  /** ids of CORPUS_CATALOG entries this tier downloads, in addition to the required models. */
  corpusPackIds: string[];
}

export const TIERS: TierDefinition[] = [
  {
    id: "minimum",
    label: "Minimum",
    description: "Models only. Uses the built-in 300-topic knowledge base — no extra download.",
    corpusPackIds: [],
  },
  {
    id: "standard",
    label: "Standard",
    description: "+ 1,000 more Wikipedia-derived topics (~600KB extra download).",
    corpusPackIds: ["corpus-standard"],
  },
  {
    id: "full",
    label: "Full",
    description: "+ 5,000 more Wikipedia-derived topics total (~3MB extra download).",
    corpusPackIds: ["corpus-standard", "corpus-full"],
  },
];

export function totalManifestBytes(models: CatalogModel[]): number {
  return models.reduce((sum, m) => sum + m.sizeBytes, 0);
}
