import { describe, it, expect, vi, beforeEach } from "vitest";

const acquireMock = vi.fn(() => true);
const releaseMock = vi.fn();
vi.mock("download-wake-lock", () => ({
  acquireDownloadWakeLock: () => acquireMock(),
  releaseDownloadWakeLock: () => releaseMock(),
}));

type Deferred = { resolve: () => void; reject: (e: unknown) => void };
const pending = new Map<string, Deferred>();
const downloadMock = vi.fn(
  (asset: { id: string }) =>
    new Promise<void>((resolve, reject) => {
      pending.set(asset.id, { resolve, reject });
    })
);
const signalCancelMock = vi.fn(async (asset: { id: string }) => {
  pending.get(asset.id)?.reject(new Error("Download paused"));
});

vi.mock("../models/ModelManager", () => ({
  ModelManager: class {
    downloadCatalogModel(asset: any) {
      return downloadMock(asset);
    }
    signalCancelDownload(asset: any) {
      return signalCancelMock(asset);
    }
    async deletePartialDownload() {}
  },
}));

import { getDownloadState, resetDownloadState, restartDownload, startDownload } from "./downloadManager";

const asset = (id: string) => ({ id, sizeBytes: 100 }) as any;
const settle = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  resetDownloadState();
  pending.clear();
  acquireMock.mockClear();
  releaseMock.mockClear();
  downloadMock.mockClear();
});

describe("download wake lock", () => {
  it("is acquired when a download starts, and released when it succeeds", async () => {
    const p = startDownload(asset("a"));
    expect(acquireMock).toHaveBeenCalledTimes(1);
    expect(releaseMock).not.toHaveBeenCalled();
    pending.get("a")!.resolve();
    await p;
    expect(releaseMock).toHaveBeenCalledTimes(1);
    expect(getDownloadState("a")?.error).toBeNull();
  });

  it("is released when the download fails", async () => {
    const p = startDownload(asset("a"));
    pending.get("a")!.reject(new Error("failed verification — got 0 bytes"));
    await p;
    expect(releaseMock).toHaveBeenCalledTimes(1);
    expect(getDownloadState("a")?.error).toMatch(/verification/);
  });

  it("is released on an unexpected exception inside the download", async () => {
    downloadMock.mockImplementationOnce(async () => {
      throw new TypeError("boom");
    });
    await startDownload(asset("a"));
    expect(acquireMock).toHaveBeenCalledTimes(1);
    expect(releaseMock).toHaveBeenCalledTimes(1);
  });

  it("is released when a download is cancelled, and re-acquired for its restart", async () => {
    const first = startDownload(asset("a"));
    const restart = restartDownload(asset("a"));
    await first;
    await settle();
    expect(releaseMock).toHaveBeenCalledTimes(1);
    expect(acquireMock).toHaveBeenCalledTimes(2);
    pending.get("a")!.resolve();
    await restart;
    expect(releaseMock).toHaveBeenCalledTimes(2);
  });

  it("does not take a second lock when the same download is started twice", async () => {
    const p1 = startDownload(asset("a"));
    const p2 = startDownload(asset("a"));
    expect(p2).toBe(p1);
    expect(acquireMock).toHaveBeenCalledTimes(1);
    pending.get("a")!.resolve();
    await p1;
    expect(releaseMock).toHaveBeenCalledTimes(1);
  });

  it("shares one lock between concurrent downloads, released after the last one", async () => {
    const a = startDownload(asset("a"));
    const b = startDownload(asset("b"));
    expect(acquireMock).toHaveBeenCalledTimes(1);
    pending.get("a")!.resolve();
    await a;
    expect(releaseMock).not.toHaveBeenCalled();
    pending.get("b")!.reject(new Error("network"));
    await b;
    expect(releaseMock).toHaveBeenCalledTimes(1);
  });

  it("never lets a wake lock error break the download", async () => {
    acquireMock.mockImplementationOnce(() => {
      throw new Error("no permission");
    });
    const p = startDownload(asset("a"));
    pending.get("a")!.resolve();
    await expect(p).resolves.toBeUndefined();
    expect(getDownloadState("a")?.progress).toBe(1);
  });
});
