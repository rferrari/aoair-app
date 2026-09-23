import * as FileSystem from "expo-file-system/legacy";
import * as Crypto from "expo-crypto";
import { copyBundledAssetToFile } from "bundled-assets";
import {
  CatalogModel,
  MODEL_CATALOG,
  REQUIRED_MODELS,
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

// How long a download can go with zero progress callbacks before it's
// treated as stalled and cancelled — see downloadCatalogModel's doc comment.
const DOWNLOAD_INACTIVITY_TIMEOUT_MS = 60_000;

function assetPath(asset: Pick<CatalogModel, "filename">): string {
  return `${FileSystem.documentDirectory}${asset.filename}`;
}

/**
 * Local file manager for model weights. Two ways an asset ends up on disk:
 *
 * 1. **Downloaded** (`downloadCatalogModel`): fetches a catalog entry over
 *    the network — used for both the required default models (via the
 *    mandatory first-run ModelSetupScreen) and optional extras (via the
 *    same screen's normal mode). Always an explicit user action; never
 *    automatic, never during chat/inference.
 * 2. **Bundled** (`installBundled`): copies a model baked into the APK's
 *    compiled assets (via the `bundled-assets` native module +
 *    plugins/withBundledModels.js) into the document directory, purely
 *    locally. Not used by default (keeps the installable app small/fast to
 *    build) but available as an alternate build path — see manifest.ts.
 */
export class ModelManager {
  constructor(private catalog: CatalogModel[] = MODEL_CATALOG) {}

  /**
   * A file that exists but doesn't match the catalog's expected size is
   * treated as NOT present (and cleaned up) rather than a false "present" —
   * this is what an interrupted/truncated download looks like (e.g. the
   * app backgrounded or network dropped mid-transfer), and llama.cpp fails
   * to load such a file with a generic, unhelpful error. Catching this here
   * means the UI correctly offers "Download"/"Retry" instead of showing a
   * green "Downloaded" badge for a file that will fail the moment it's used.
   */
  async statusOf(asset: CatalogModel): Promise<AssetStatus> {
    const path = assetPath(asset);
    const info = await FileSystem.getInfoAsync(path);
    if (!info.exists) {
      return { asset, present: false, sizeOnDiskBytes: 0, checksumOk: null };
    }
    const sizeOnDisk = info.size ?? 0;
    if (sizeOnDisk !== asset.sizeBytes) {
      await FileSystem.deleteAsync(path, { idempotent: true }).catch(() => {});
      return { asset, present: false, sizeOnDiskBytes: 0, checksumOk: null };
    }
    return {
      asset,
      present: true,
      sizeOnDiskBytes: sizeOnDisk,
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

    // Inactivity timeout, not a flat deadline: a large model on a slow-but-
    // working connection can legitimately take many minutes, but zero
    // progress callbacks for this long (rate limiting, a hung TCP
    // connection, a server that accepted the request and never responds)
    // means something is actually wrong — before this, a stalled download
    // sat at 0% forever with no error, no retry option, and no way for the
    // user to escape the mandatory first-run setup screen.
    let timedOut = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const resetInactivityTimer = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        timedOut = true;
        downloadResumable.cancelAsync().catch(() => {});
      }, DOWNLOAD_INACTIVITY_TIMEOUT_MS);
    };

    const downloadResumable = FileSystem.createDownloadResumable(
      asset.sourceUrl,
      destPath,
      {},
      (data) => {
        resetInactivityTimer();
        onProgress?.({
          totalBytesWritten: data.totalBytesWritten,
          totalBytesExpectedToWrite: data.totalBytesExpectedToWrite,
        });
      }
    );
    resetInactivityTimer();

    try {
      await downloadResumable.downloadAsync();
    } catch (e: any) {
      await FileSystem.deleteAsync(destPath, { idempotent: true }).catch(() => {});
      if (timedOut) {
        throw new Error(
          `Download of ${asset.label} stalled (no progress for ${DOWNLOAD_INACTIVITY_TIMEOUT_MS / 1000}s) — check your connection and try again.`
        );
      }
      throw e;
    } finally {
      clearTimeout(timer);
    }

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

  /**
   * Whether the default (required) LLM + embedding models are already on
   * disk. Gates first-run navigation: if false, the app shows the mandatory
   * setup screen instead of the chat UI. This is the only place the app's
   * flow depends on network having been used at some point — once true, no
   * further network access is needed.
   */
  async requiredModelsPresent(): Promise<boolean> {
    const statuses = await Promise.all(REQUIRED_MODELS.map((a) => this.statusOf(a)));
    return statuses.every((s) => s.present && s.sizeOnDiskBytes === s.asset.sizeBytes);
  }
}
