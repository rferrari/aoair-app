import { describe, it, expect } from "vitest";
import { MODEL_CATALOG, BUNDLED_MODELS, STORAGE_BUDGET_BYTES, totalManifestBytes } from "./manifest";

describe("totalManifestBytes", () => {
  it("sums asset sizes", () => {
    expect(totalManifestBytes(MODEL_CATALOG)).toBe(
      MODEL_CATALOG.reduce((sum, a) => sum + a.sizeBytes, 0)
    );
  });

  it("stays within the 50GB storage budget even if every catalog model were installed", () => {
    expect(totalManifestBytes(MODEL_CATALOG)).toBeLessThanOrEqual(STORAGE_BUDGET_BYTES);
  });
});

describe("BUNDLED_MODELS", () => {
  it("includes exactly one llm and one embedding model", () => {
    expect(BUNDLED_MODELS.filter((m) => m.kind === "llm")).toHaveLength(1);
    expect(BUNDLED_MODELS.filter((m) => m.kind === "embedding")).toHaveLength(1);
  });

  it("every bundled model has a non-empty checksum and filename", () => {
    for (const m of BUNDLED_MODELS) {
      expect(m.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(m.filename.length).toBeGreaterThan(0);
    }
  });
});

describe("MODEL_CATALOG", () => {
  it("has unique ids and filenames", () => {
    const ids = MODEL_CATALOG.map((m) => m.id);
    const filenames = MODEL_CATALOG.map((m) => m.filename);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(filenames).size).toBe(filenames.length);
  });
});
