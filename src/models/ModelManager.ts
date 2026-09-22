import * as FileSystem from "expo-file-system/legacy";
import * as Crypto from "expo-crypto";
import { copyBundledAssetToFile } from "bundled-assets";
import {
  CatalogModel,
  MODEL_CATALOG,
  STORAGE_BUDGET_BYTES,
  totalManifestBytes,
} from "./manifest";

export interface AssetStatus {
  asset: CatalogModel;
  present: boolean;
  sizeOnDiskBytes: number;
  checksumOk: boolean | null; // null = not verified yet (expensive on large files)
}

export interface DownloadProgress {
  totalBytesWritten: number;
  totalBytesExpectedToWrite: number;
}

function assetPath(asset: Pick<CatalogModel, "filename">): string {
  return `${FileSystem.documentDirectory}${asset.filename}`;
}

/**
 * Local file manager for model weights. Two ways an asset ends up on disk:
 *
 * 1. **Bundled** (`installBundled`): copies a model baked into the APK's
 *    compiled assets (via the `bundled-assets` native module) into the
 *    document directory. Purely local — no network — so the default model
 *    is ready immediately after install with the device offline.
 * 2. **Downloaded** (`downloadCatalogModel`): fetches an optional catalog
 *    entry over the network. Only ever called from an explicit user tap in
 *    ModelSetupScreen — never automatically, never during chat/inference.
 */
export class ModelManager {
  constructor(private catalog: CatalogModel[] = MODEL_CATALOG) {}

  async statusOf(asset: CatalogModel): Promise<AssetStatus> {
    const path = assetPath(asset);
    const info = await FileSystem.getInfoAsync(path);
    if (!info.exists) {
      return { asset, present: false, sizeOnDiskBytes: 0, checksumOk: null };
    }
    return {
      asset,
      present: true,
      sizeOnDiskBytes: info.size ?? 0,
      checksumOk: null,
    };
  }

  async statusAll(): Promise<AssetStatus[]> {
    return Promise.all(this.catalog.map((a) => this.statusOf(a)));
  }

  /**
   * Streams the file and computes sha256. Cheap for the embedding model
   * (tens of MB); for a multi-GB LLM this reads the whole file as a base64
   * string in JS, which is memory-heavy — used sparingly (dev/setup-time
   * verification), not on every app launch. See downloadCatalogModel for
   * the cheaper size-only check used after an on-device download.
   */
  async verifyChecksum(asset: Pick<CatalogModel, "filename" | "sha256">): Promise<boolean> {
    if (!asset.sha256) return true;
    const path = assetPath(asset);
    const digest = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      await FileSystem.readAsStringAsync(path, {
        encoding: FileSystem.EncodingType.Base64,
      }),
      { encoding: Crypto.CryptoEncoding.HEX }
    );
    return digest.toLowerCase() === asset.sha256.toLowerCase();
  }

  /**
   * Installs a bundled model from the APK's compiled assets into the
   * document directory, if not already present with the right size. No
   * network access. Idempotent — safe to call on every launch.
   */
  async installBundled(asset: CatalogModel): Promise<void> {
    const status = await this.statusOf(asset);
    if (status.present && status.sizeOnDiskBytes === asset.sizeBytes) return;

    const assetSubPath = `models/${asset.filename.split("/").pop()}`;
    const destPath = assetPath(asset);
    const writtenBytes = await copyBundledAssetToFile(assetSubPath, destPath);

    if (writtenBytes !== asset.sizeBytes) {
      throw new Error(
        `Bundled asset ${asset.id} size mismatch after copy: expected ${asset.sizeBytes}, got ${writtenBytes}`
      );
    }
  }

  async installAllBundled(): Promise<void> {
    const bundled = this.catalog.filter((m) => m.bundled);
    for (const asset of bundled) {
      await this.installBundled(asset);
    }
  }

  /**
   * Downloads an optional (non-bundled) catalog model. Network access
   * happens ONLY here, and only when explicitly invoked (a user tap in
   * ModelSetupScreen) — never automatically and never during chat/inference.
   * Verifies the downloaded size matches the catalog entry; deletes and
   * throws on mismatch rather than leaving a truncated/corrupt file.
   */
  async downloadCatalogModel(
    asset: CatalogModel,
    onProgress?: (p: DownloadProgress) => void
  ): Promise<void> {
    const destPath = assetPath(asset);
    const destDir = destPath.substring(0, destPath.lastIndexOf("/"));
    await FileSystem.makeDirectoryAsync(destDir, { intermediates: true }).catch(() => {});

    const downloadResumable = FileSystem.createDownloadResumable(
      asset.sourceUrl,
      destPath,
      {},
      (data) =>
        onProgress?.({
          totalBytesWritten: data.totalBytesWritten,
          totalBytesExpectedToWrite: data.totalBytesExpectedToWrite,
        })
    );

    await downloadResumable.downloadAsync();

    const info = await FileSystem.getInfoAsync(destPath);
    if (!info.exists || info.size !== asset.sizeBytes) {
      await FileSystem.deleteAsync(destPath, { idempotent: true });
      throw new Error(
        `Download of ${asset.label} failed verification (size mismatch) — deleted.`
      );
    }
  }

  async deleteModel(asset: CatalogModel): Promise<void> {
    await FileSystem.deleteAsync(assetPath(asset), { idempotent: true });
  }

  async currentStorageUsageBytes(): Promise<number> {
    const statuses = await this.statusAll();
    return statuses.reduce((sum, s) => sum + s.sizeOnDiskBytes, 0);
  }

  async withinStorageBudget(): Promise<boolean> {
    const projected = totalManifestBytes(this.catalog);
    return projected <= STORAGE_BUDGET_BYTES;
  }

  missingAssets(statuses: AssetStatus[]): CatalogModel[] {
    return statuses.filter((s) => !s.present).map((s) => s.asset);
  }
}
