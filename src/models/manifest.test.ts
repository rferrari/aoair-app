import { describe, it, expect } from "vitest";
import { DEFAULT_MANIFEST, STORAGE_BUDGET_BYTES, totalManifestBytes } from "./manifest";

describe("totalManifestBytes", () => {
  it("sums asset sizes", () => {
    expect(totalManifestBytes(DEFAULT_MANIFEST)).toBe(
      DEFAULT_MANIFEST.reduce((sum, a) => sum + a.sizeBytes, 0)
    );
  });

  it("stays within the 50GB storage budget for the default manifest", () => {
    expect(totalManifestBytes(DEFAULT_MANIFEST)).toBeLessThanOrEqual(STORAGE_BUDGET_BYTES);
  });
});
