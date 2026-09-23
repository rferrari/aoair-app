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
   * Paused-but-resumable downloads, keyed by asset id. expo-file-system's
   * own docs: "When the app has been moved to the background, this
   * [progress] callback won't be fired until it's moved to the foreground"
   * — so backgrounding looks identical to a truly stalled connection from
   * downloadCatalogModel's inactivity timer's point of view, and the timer
   * correctly fires. The fix isn't to stop detecting that (a genuinely dead
   * connection should still surface an error) — it's to make what happens
   * next cheap: pause (keep the partial bytes + resume token) instead of
   * cancel-and-delete, so a retry continues from here instead of
   * restarting a multi-GB download from 0%.
   */
  private pausedDownloads = new Map<string, FileSystem.DownloadResumable>();

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
   * Escape hatch for a download that's stuck with no error at all — no
   * progress, no failure, `pausedDownloads` possibly holding a resumable
   * whose underlying transfer nothing is actually driving forward anymore
   * (e.g. a stale reference left over from a dev Fast Refresh mid-download,
   * or a native task that silently stopped calling back). Unlike the
   * timeout/backgrounding path, this doesn't wait for anything to detect
   * the stall — it's user-triggered.
   *
   * Split into two steps (signal, then delete) rather than one, because
   * `pauseAsync()` resolving only means cancellation was *requested* — the
   * native write loop notices `isPausing` and stops on its next iteration,
   * which is asynchronous and not awaited by pause() itself. Deleting the
   * file and starting a new download immediately after signalling cancel
   * (as an earlier version of this method did) raced the old, now-orphaned
   * writer: if its stream happened to close *after* the new download
   * finished, it silently truncated the file right back down — the new
   * download would verify as `0 bytes` despite having fully completed.
   * Callers MUST await the corresponding downloadCatalogModel() promise's
   * settlement between calling signalCancelDownload and
   * deletePartialDownload (see downloadManager.restartDownload) so the old
   * writer is actually gone before the file is touched again.
   */
  async signalCancelDownload(asset: CatalogModel): Promise<void> {
    const active = this.pausedDownloads.get(asset.id);
    if (active) {
      await active.pauseAsync().catch(() => {});
      this.pausedDownloads.delete(asset.id);
    }
  }

  async deletePartialDownload(asset: CatalogModel): Promise<void> {
    await FileSystem.deleteAsync(assetPath(asset), { idempotent: true }).catch(() => {});
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
    // progress callbacks for this long means something stopped it —
    // either a genuinely dead connection, OR the app was backgrounded
    // (expo-file-system: progress callbacks "won't be fired until moved to
    // foreground"). Both look identical from here, so both are handled the
    // same way: pause (keep the partial file + resume token), not
    // cancel-and-delete. A subsequent call for the same asset — the Retry
    // button, or the auto-resume-on-foreground in SetupWizardScreen —
    // reuses the paused resumable and continues from where it left off
    // instead of restarting a multi-GB download from 0%.
    let timedOut = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let downloadResumable: FileSystem.DownloadResumable;
    const resetInactivityTimer = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        timedOut = true;
        downloadResumable.pauseAsync().catch(() => {});
      }, DOWNLOAD_INACTIVITY_TIMEOUT_MS);
    };

    const resuming = this.pausedDownloads.get(asset.id);
    downloadResumable =
      resuming ??
      FileSystem.createDownloadResumable(asset.sourceUrl, destPath, {}, (data) => {
        resetInactivityTimer();
        onProgress?.({
          totalBytesWritten: data.totalBytesWritten,
          totalBytesExpectedToWrite: data.totalBytesExpectedToWrite,
        });
      });
    this.pausedDownloads.set(asset.id, downloadResumable);
    resetInactivityTimer();

    let result: FileSystem.FileSystemDownloadResult | undefined;
    try {
      result = await (resuming ? downloadResumable.resumeAsync() : downloadResumable.downloadAsync());
    } catch (e: any) {
      clearTimeout(timer);
      if (timedOut) {
        // Paused, not deleted — stays in pausedDownloads for the next call
        // to pick up. Only genuinely-failed (non-timeout) downloads below
        // are treated as unrecoverable and cleaned up.
        throw new Error(
          `Download of ${asset.label} stalled (no progress for ${DOWNLOAD_INACTIVITY_TIMEOUT_MS / 1000}s) — tap Retry to resume, or check your connection.`
        );
      }
      this.pausedDownloads.delete(asset.id);
      await FileSystem.deleteAsync(destPath, { idempotent: true }).catch(() => {});
      throw e;
    } finally {
      clearTimeout(timer);
    }

    if (!result) {
      // resolves to undefined on pause too, not just cancel — same
      // stalled/paused case as the throw path above, just via the resolve
      // side of the promise instead of a rejection.
      throw new Error(
        `Download of ${asset.label} paused (no progress for ${DOWNLOAD_INACTIVITY_TIMEOUT_MS / 1000}s) — tap Retry to resume, or check your connection.`
      );
    }

    this.pausedDownloads.delete(asset.id);

    const info = await FileSystem.getInfoAsync(destPath);
    if (!info.exists || info.size !== asset.sizeBytes) {
      const actualSize = info.exists ? info.size ?? 0 : 0;
      // A multi-hundred-MB+ GGUF landing at a few KB almost always means the
      // "download" actually succeeded at the HTTP level but the body wasn't
      // the model — e.g. a rate-limit/error page served with a 200 status,
      // which a plain byte-count check alone can't distinguish from a truly
      // corrupt transfer. Surfacing the actual size (and a text snippet when
      // it's small enough to plausibly be one of those pages) turns "size
      // mismatch" from a dead end into an actionable signal instead of
      // silently deleting the only evidence of what really happened.
      let snippet = "";
      if (actualSize > 0 && actualSize < 65536) {
        try {
          const text = await FileSystem.readAsStringAsync(destPath, {
            encoding: FileSystem.EncodingType.UTF8,
          });
          snippet = ` Response body: ${text.slice(0, 300)}`;
        } catch {
          // Not decodable as UTF8 (genuinely partial binary) — no snippet, still report sizes.
        }
      }
      await FileSystem.deleteAsync(destPath, { idempotent: true });
      throw new Error(
        `Download of ${asset.label} failed verification — got ${actualSize} bytes, expected ${asset.sizeBytes}.${snippet}`
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
