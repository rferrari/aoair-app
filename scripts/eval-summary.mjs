#!/usr/bin/env node
// Summarizes BOAR evaluation results (see docs/EVAL_QUERIES.md).
//
//   node scripts/eval-summary.mjs results/*.jsonl            # per-config summary table
//   node scripts/eval-summary.mjs --answers results/*.jsonl  # side-by-side answers, markdown
//
// Inputs can be exported .jsonl files or a saved Metro terminal log: any
// line containing "[EVAL] {" is parsed too. Rows are deduped by
// runId + configId + queryId.
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const answersMode = args.includes("--answers");
const files = args.filter((a) => !a.startsWith("--"));
if (files.length === 0) {
  console.error("usage: node scripts/eval-summary.mjs [--answers] <results.jsonl | metro.log> ...");
  process.exit(1);
}

const rows = new Map();
for (const file of files) {
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const at = line.indexOf("[EVAL] {");
    const json = at >= 0 ? line.slice(at + "[EVAL] ".length) : line.trim().startsWith("{") ? line.trim() : null;
    if (!json) continue;
    try {
      const r = JSON.parse(json);
      if (r.runId && r.configId && r.queryId) rows.set(`${r.runId}|${r.configId}|${r.queryId}`, r);
    } catch {
      // not a result row
    }
  }
}
if (rows.size === 0) {
  console.error("no evaluation rows found");
  process.exit(1);
}
const all = [...rows.values()];

function median(values) {
  const v = values.filter((x) => typeof x === "number" && Number.isFinite(x)).sort((a, b) => a - b);
  if (v.length === 0) return undefined;
  const mid = v.length >> 1;
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}
const sec = (ms) => (ms == null ? "—" : `${(ms / 1000).toFixed(1)}s`);
const num = (n, d = 1) => (n == null ? "—" : n.toFixed(d));
const gb = (b) => (b == null ? "—" : `${(b / 1024 ** 3).toFixed(2)}GB`);
function max(values) {
  const v = values.filter((x) => typeof x === "number" && Number.isFinite(x));
  return v.length ? Math.max(...v) : undefined;
}

if (answersMode) {
  const byQuery = new Map();
  for (const r of all) {
    if (!byQuery.has(r.queryId)) byQuery.set(r.queryId, []);
    byQuery.get(r.queryId).push(r);
  }
  for (const [queryId, group] of byQuery) {
    const first = group[0];
    console.log(`## ${queryId} (${first.category})\n\n> ${first.query}\n`);
    for (const r of group) {
      const retrieval = r.retrievalUsed ? r.retrievedTitles.join(", ") : "none";
      console.log(`### ${r.configLabel} — ${r.modelId ?? "?"} · ${r.promptFormat ?? "?"} · ${r.outcome} · retrieval: ${retrieval}\n`);
      console.log(`${(r.outcome === "failure" && r.errorMessage) || r.answer || "(empty)"}\n`);
    }
  }
  process.exit(0);
}

const byConfig = new Map();
for (const r of all) {
  const key = `${r.runId} ${r.configLabel}`;
  if (!byConfig.has(key)) byConfig.set(key, []);
  byConfig.get(key).push(r);
}

const header = ["run / config", "format", "n", "ok", "fail", "KB hit", "med TTFT", "med tok/s", "med total", "max load", "peak RSS"];
const table = [...byConfig].map(([key, group]) => {
  const withKb = group.filter((r) => r.expectedKbHit !== null);
  const formats = [...new Set(group.map((r) => r.promptFormat).filter(Boolean))];
  return [
    key,
    formats.join("+") || "—",
    String(group.length),
    String(group.filter((r) => r.outcome === "success").length),
    String(group.filter((r) => r.outcome === "failure").length),
    withKb.length ? `${withKb.filter((r) => r.expectedKbHit).length}/${withKb.length}` : "—",
    sec(median(group.map((r) => r.ttftMs))),
    num(median(group.map((r) => r.tokPerSec))),
    sec(median(group.map((r) => r.totalLatencyMs))),
    sec(max(group.map((r) => r.modelLoadMs))),
    gb(max(group.map((r) => r.peakRssBytes))),
  ];
});
const widths = header.map((h, i) => Math.max(h.length, ...table.map((row) => row[i].length)));
const fmt = (cells) => cells.map((c, i) => c.padEnd(widths[i])).join("  ");
console.log(fmt(header));
console.log(widths.map((w) => "-".repeat(w)).join("  "));
for (const row of table) console.log(fmt(row));

const failures = all.filter((r) => r.outcome !== "success");
if (failures.length) {
  console.log("\nnot successful:");
  for (const r of failures) console.log(`  ${r.configLabel} / ${r.queryId}: ${r.outcome} — ${r.errorMessage ?? ""}`);
}
