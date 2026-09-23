import { ModelManager, DownloadProgress } from "../models/ModelManager";
import { CatalogModel } from "../models/manifest";

/**
 * Module-level (not component-local) download state, so it survives the
 * Settings screen unmounting/remounting — e.g. the user closes Settings
 * while a download is running, then reopens it later. Without this, a
 * previous version tracked download progress in ModelSetupScreen's local
 * React state: closing Settings meant losing track of the in-flight
 * download entirely, so reopening Settings showed a plain "Download"
 * button again (as if nothing were happening) even while the original
 * download was still writing to disk. Tapping "Download" again in that
 * state started a SECOND concurrent download to the same destination file
 * — a real race condition, and plausibly part of what produced the
 * truncated Qwen downloads found earlier (two writers to one path).
 *
 * `startDownload` guards against exactly that: if a download for this
 * asset is already in flight, it returns the existing one instead of
 * starting a duplicate.
 */

export interface DownloadState {
  downloading: boolean;
  progress: number;
  error: string | null;
  bytesWritten?: number;
  bytesExpected?: number;
  speedBytesPerSec?: number;
  etaSeconds?: number;
}

const modelManager = new ModelManager();
const state = new Map<string, DownloadState>();
const inFlight = new Map<string, Promise<void>>();
const downloadTimestamps = new Map<string, { lastBytes: number; lastTime: number; startTime: number }>();
type Listener = () => void;
const listeners = new Set<Listener>();

function notify() {
  listeners.forEach((l) => l());
}

export function subscribeDownloads(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getDownloadState(assetId: string): DownloadState | undefined {
  return state.get(assetId);
}

export function isDownloading(assetId: string): boolean {
  return inFlight.has(assetId);
}

/**
 * Forgets all tracked download state without cancelling any in-flight
 * FileSystem transfer (there's no cancel handle stored here to call) — used
 * by appReset.ts right before deleting the model files those transfers
 * would have been writing to, so a stale/failed entry doesn't linger for a
 * file that no longer exists.
 */
export function resetDownloadState(): void {
  state.clear();
  inFlight.clear();
  downloadTimestamps.clear();
  notify();
}

/** Starts a download if one isn't already running for this asset; otherwise no-ops. */
export function startDownload(asset: CatalogModel): Promise<void> {
  const existing = inFlight.get(asset.id);
  if (existing) return existing;

  const now = Date.now();
  downloadTimestamps.set(asset.id, { lastBytes: 0, lastTime: now, startTime: now });

  state.set(asset.id, {
    downloading: true,
    progress: 0,
    error: null,
    bytesWritten: 0,
    bytesExpected: asset.sizeBytes,
    speedBytesPerSec: 0,
    etaSeconds: 0,
  });
  notify();

  const promise = modelManager
    .downloadCatalogModel(asset, (p: DownloadProgress) => {
      const progress = p.totalBytesExpectedToWrite > 0 ? p.totalBytesWritten / p.totalBytesExpectedToWrite : 0;
      const ts = downloadTimestamps.get(asset.id);
      const currentTime = Date.now();
      let speedBytesPerSec = 0;
      let etaSeconds = 0;

      if (ts) {
        const timeDiffSec = (currentTime - ts.lastTime) / 1000;
        if (timeDiffSec >= 0.5) {
          const bytesDiff = p.totalBytesWritten - ts.lastBytes;
          speedBytesPerSec = Math.max(0, bytesDiff / timeDiffSec);
          ts.lastBytes = p.totalBytesWritten;
          ts.lastTime = currentTime;
        } else {
          const prev = state.get(asset.id);
          speedBytesPerSec = prev?.speedBytesPerSec ?? 0;
        }

        const remainingBytes = Math.max(0, p.totalBytesExpectedToWrite - p.totalBytesWritten);
        if (speedBytesPerSec > 0) {
          etaSeconds = Math.ceil(remainingBytes / speedBytesPerSec);
        }
      }

      state.set(asset.id, {
        downloading: true,
        progress,
        error: null,
        bytesWritten: p.totalBytesWritten,
        bytesExpected: p.totalBytesExpectedToWrite,
        speedBytesPerSec,
        etaSeconds,
      });
      notify();
    })
    .then(() => {
      state.set(asset.id, {
        downloading: false,
        progress: 1,
        error: null,
        bytesWritten: asset.sizeBytes,
        bytesExpected: asset.sizeBytes,
        speedBytesPerSec: 0,
        etaSeconds: 0,
      });
      downloadTimestamps.delete(asset.id);
    })
    .catch((e: any) => {
      state.set(asset.id, {
        downloading: false,
        progress: 0,
        error: e?.message ?? String(e),
      });
      downloadTimestamps.delete(asset.id);
    })
    .finally(() => {
      inFlight.delete(asset.id);
      notify();
    });

  inFlight.set(asset.id, promise);
  return promise;
}
