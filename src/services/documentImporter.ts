import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { embeddingEngine } from "../rag/embed";
import {
  insertChunk,
  createCustomCollection,
  deleteCustomCollection,
  setCustomCollectionActive,
  listCustomCollections,
  getCollectionDocs,
  CustomCollection,
} from "../rag/db";

/**
 * User-supplied document import for the local knowledge base (Settings >
 * Knowledge Base > Import Documents). Deliberately limited to formats we can
 * parse reliably on-device without a new native dependency:
 *
 * - .txt / .md: read as plain text.
 * - .csv: naive comma-split per line (no quoted-field escaping) — fine for
 *   simple exports, not a full CSV parser.
 * - .json: if it matches the same {title, source, body}[] shape used by the
 *   app's own downloadable corpus packs (assets/corpus/*.json), each entry
 *   is imported as its own doc; otherwise the whole file is chunked as text.
 *
 * PDF is NOT supported: there is no pure-JS PDF text extractor that works
 * reliably in Hermes for real-world (compressed-stream) PDFs, and a native
 * PDF library would add exactly the native-dependency/rebuild risk this
 * project has been avoiding. Convert PDFs to text/markdown first.
 */

const CHARS_PER_TOKEN = 4; // rough English-text heuristic, no tokenizer on-device
const CHUNK_CHARS = 500 * CHARS_PER_TOKEN;
const OVERLAP_CHARS = 50 * CHARS_PER_TOKEN;

export const SUPPORTED_MIME_TYPES = [
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
];

export interface ImportProgress {
  stage: "reading" | "chunking" | "embedding";
  chunkIndex?: number;
  chunkCount?: number;
}

function chunkText(text: string): string[] {
  const trimmed = text.trim();
  if (trimmed.length === 0) return [];
  if (trimmed.length <= CHUNK_CHARS) return [trimmed];

  const chunks: string[] = [];
  let start = 0;
  while (start < trimmed.length) {
    const end = Math.min(start + CHUNK_CHARS, trimmed.length);
    chunks.push(trimmed.slice(start, end));
    if (end >= trimmed.length) break;
    start = end - OVERLAP_CHARS;
  }
  return chunks;
}

function csvToText(raw: string): string {
  return raw
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line) => line.split(",").join(" | "))
    .join("\n");
}

type ParsedDoc = { title: string; source: string; body: string };

function parseFileContent(filename: string, raw: string, fallbackTitle: string): ParsedDoc[] {
  const ext = filename.toLowerCase().split(".").pop();

  if (ext === "json") {
    try {
      const parsed = JSON.parse(raw);
      if (
        Array.isArray(parsed) &&
        parsed.every((d) => typeof d?.title === "string" && typeof d?.body === "string")
      ) {
        return parsed.map((d) => ({
          title: d.title,
          source: typeof d.source === "string" ? d.source : filename,
          body: d.body,
        }));
      }
    } catch {
      // not valid JSON, or not the corpus-pack shape — fall through to plain text
    }
    return [{ title: fallbackTitle, source: filename, body: raw }];
  }

  if (ext === "csv") {
    return [{ title: fallbackTitle, source: filename, body: csvToText(raw) }];
  }

  // .md / .txt / anything else we let through the picker filter
  return [{ title: fallbackTitle, source: filename, body: raw }];
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
}

export async function pickDocuments(): Promise<DocumentPicker.DocumentPickerAsset[] | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: SUPPORTED_MIME_TYPES,
    multiple: true,
    copyToCacheDirectory: true,
  });
  if (result.canceled) return null;
  return result.assets;
}

/**
 * Imports one or more already-picked files as a single named collection:
 * reads each file, splits into docs (see parseFileContent), chunks each doc,
 * embeds every chunk on-device (sequentially — the shared llama.cpp
 * embedding context can't run concurrent embeddings), and inserts into the
 * FTS5 + vector tables tagged with this collection's id so it can be
 * toggled or deleted as a unit later.
 */
export async function importDocuments(
  files: DocumentPicker.DocumentPickerAsset[],
  collectionName: string,
  onProgress?: (p: ImportProgress) => void
): Promise<CustomCollection> {
  const collectionId = `custom-${Date.now()}-${slug(collectionName)}`;

  onProgress?.({ stage: "reading" });
  const allDocs: ParsedDoc[] = [];
  let totalSizeBytes = 0;
  for (const file of files) {
    const raw = await FileSystem.readAsStringAsync(file.uri);
    totalSizeBytes += file.size ?? raw.length;
    const fallbackTitle = file.name.replace(/\.[^.]+$/, "");
    allDocs.push(...parseFileContent(file.name, raw, fallbackTitle));
  }

  onProgress?.({ stage: "chunking" });
  const chunks: { chunkId: string; docId: string; title: string; body: string; source: string }[] = [];
  allDocs.forEach((doc, docIndex) => {
    const docId = `${collectionId}-doc${docIndex}-${slug(doc.title)}`;
    const pieces = chunkText(doc.body);
    pieces.forEach((body, i) => {
      chunks.push({
        chunkId: `${docId}-c${i}`,
        docId,
        title: pieces.length > 1 ? `${doc.title} (part ${i + 1}/${pieces.length})` : doc.title,
        body,
        source: doc.source,
      });
    });
  });

  for (let i = 0; i < chunks.length; i++) {
    onProgress?.({ stage: "embedding", chunkIndex: i, chunkCount: chunks.length });
    const chunk = chunks[i];
    const embedding = await embeddingEngine.embed(`${chunk.title}\n${chunk.body}`);
    await insertChunk({ ...chunk, collectionId }, embedding);
  }

  const collection: Omit<CustomCollection, "active" | "createdAt"> = {
    id: collectionId,
    name: collectionName,
    sourceFilename: files.map((f) => f.name).join(", "),
    docCount: allDocs.length,
    chunkCount: chunks.length,
    sizeBytes: totalSizeBytes,
  };
  await createCustomCollection(collection);

  const [created] = (await listCustomCollections()).filter((c) => c.id === collectionId);
  return created;
}

export { listCustomCollections, setCustomCollectionActive, deleteCustomCollection };

/**
 * Exports a collection back out as JSON in the same {title, source, body}[]
 * shape as the app's own downloadable corpus packs — portable, small, and
 * re-embeddable by any instance of the app regardless of embedding model
 * version. Not a raw .sqlite/.db export: that would bake in this device's
 * specific embedding vectors, which are meaningless (or wrong-dimension) on
 * a phone running a different embedding model. Hands off to the OS share
 * sheet so the user picks the transport (Bluetooth, Nearby Share, a file
 * manager, etc.) themselves.
 */
export async function exportCollection(collection: CustomCollection): Promise<void> {
  const docs = await getCollectionDocs(collection.id);
  const json = JSON.stringify(docs, null, 2);
  const path = `${FileSystem.cacheDirectory}${slug(collection.name)}.json`;
  await FileSystem.writeAsStringAsync(path, json);

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(path, {
      mimeType: "application/json",
      dialogTitle: `Share "${collection.name}" knowledge base`,
    });
  } else {
    throw new Error("Sharing isn't available on this device");
  }
}
