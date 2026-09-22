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
}

const modelManager = new ModelManager();
const state = new Map<string, DownloadState>();
const inFlight = new Map<string, Promise<void>>();
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

/** Starts a download if one isn't already running for this asset; otherwise no-ops. */
export function startDownload(asset: CatalogModel): Promise<void> {
  const existing = inFlight.get(asset.id);
  if (existing) return existing;

  state.set(asset.id, { downloading: true, progress: 0, error: null });
  notify();

  const promise = modelManager
    .downloadCatalogModel(asset, (p: DownloadProgress) => {
      const progress = p.totalBytesExpectedToWrite > 0 ? p.totalBytesWritten / p.totalBytesExpectedToWrite : 0;
      state.set(asset.id, { downloading: true, progress, error: null });
      notify();
    })
    .then(() => {
      state.set(asset.id, { downloading: false, progress: 1, error: null });
    })
    .catch((e: any) => {
      state.set(asset.id, { downloading: false, progress: 0, error: e?.message ?? String(e) });
    })
    .finally(() => {
      inFlight.delete(asset.id);
      notify();
    });

  inFlight.set(asset.id, promise);
  return promise;
}
