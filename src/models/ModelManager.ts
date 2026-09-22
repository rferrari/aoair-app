import * as FileSystem from "expo-file-system/legacy";
import * as Crypto from "expo-crypto";
import {
  DEFAULT_MANIFEST,
  ManifestAsset,
  STORAGE_BUDGET_BYTES,
  totalManifestBytes,
} from "./manifest";

export interface AssetStatus {
  asset: ManifestAsset;
  present: boolean;
  sizeOnDiskBytes: number;
  checksumOk: boolean | null; // null = not verified yet (expensive on large files)
}

function assetPath(asset: ManifestAsset): string {
  return `${FileSystem.documentDirectory}${asset.filename}`;
}

/**
 * Local-only file manager for model weights + indexes. Never performs
 * network requests itself; verification and enumeration only. Fetching is
 * the responsibility of the offline setup wizard / scripts/setup-models.sh,
 * run once with the device online, before first offline use.
 */
export class ModelManager {
  constructor(private manifest: ManifestAsset[] = DEFAULT_MANIFEST) {}

  async statusOf(asset: ManifestAsset): Promise<AssetStatus> {
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
    return Promise.all(this.manifest.map((a) => this.statusOf(a)));
  }

  /** Streams the file and computes sha256; used sparingly (large files). */
  async verifyChecksum(asset: ManifestAsset): Promise<boolean> {
    if (!asset.sha256) return true; // nothing to check against yet
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

  async currentStorageUsageBytes(): Promise<number> {
    const statuses = await this.statusAll();
    return statuses.reduce((sum, s) => sum + s.sizeOnDiskBytes, 0);
  }

  async withinStorageBudget(): Promise<boolean> {
    const projected = totalManifestBytes(this.manifest);
    return projected <= STORAGE_BUDGET_BYTES;
  }

  missingAssets(statuses: AssetStatus[]): ManifestAsset[] {
    return statuses.filter((s) => !s.present).map((s) => s.asset);
  }
}
