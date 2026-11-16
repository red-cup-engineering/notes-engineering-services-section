import { lstat, readdir, readFile } from "node:fs/promises";
import { extname, relative, resolve, sep } from "node:path";
import { parseDatedNotePath } from "@red-cup-engineering/computer-article-engineering-services-section/article-content-path-grammar";
import { readMarkdownFrontmatter } from "@red-cup-engineering/markdown-engineering-services-section/read-markdown-frontmatter";
import { NOTE_ROOT, NOTE_PROOF_PATH, admittedRoot, inside, validDate, digest, resourceIdentity, receipt } from "./note-resource-identity.mjs";

function observeFrontmatter(bytes) {
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const observed = readMarkdownFrontmatter(text);
    if (observed.format == null) return Object.freeze({ status: "absent" });
    const metadata = observed.frontmatter;
    const relocation = metadata.status === "relocated-research-source"
      ? typeof metadata["canonical-source"] === "string" && metadata["canonical-source"].trim() !== ""
        ? "declared"
        : "missing-target"
      : undefined;
    return Object.freeze({ status: "parsed", ...(relocation === undefined ? {} : { relocation }) });
  } catch {
    return Object.freeze({ status: "invalid" });
  }
}

/**
 * Enumerate eligible Markdown files below the existing note root.
 * In the opt-in all-carriers view, path placement says nothing about admission
 * or authorship. Use the corpus census to attach verified Git-source readings.
 */
export async function catalogNodeNotes({
  nodeRoot, maximumFiles = 10_000, maximumBytes = 64 * 1024 * 1024, selection = "dated",
}) {
  if (selection !== "dated" && selection !== "all-carriers") {
    throw new TypeError("note catalog selection must be dated or all-carriers");
  }
  const root = admittedRoot(nodeRoot), notesRoot = inside(root, NOTE_ROOT), resources = [];
  let totalBytes = 0;
  async function walk(directory) {
    let entries;
    try { entries = await readdir(directory, { withFileTypes: true }); } catch (error) { if (error?.code === "ENOENT") return; throw error; }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const path = inside(notesRoot, resolve(directory, entry.name));
      const metadata = await lstat(path);
      if (metadata.isSymbolicLink()) continue;
      if (metadata.isDirectory()) { await walk(path); continue; }
      if (!metadata.isFile() || ![".md", ".markdown"].includes(extname(path).toLowerCase())) continue;
      const locator = relative(notesRoot, path).split(sep).join("/");
      const dated = parseDatedNotePath(locator);
      let pathDate;
      if (dated && locator.split("/").length === 4) {
        try { pathDate = validDate(dated.date).value; } catch { /* Other placement. */ }
      }
      if (pathDate === undefined && selection === "dated") continue;
      if (resources.length >= maximumFiles) throw new RangeError("note catalog exceeds maximumFiles");
      if (totalBytes + metadata.size > maximumBytes) throw new RangeError("note catalog exceeds maximumBytes");
      const bytes = await readFile(path);
      totalBytes += bytes.length;
      if (totalBytes > maximumBytes) throw new RangeError("note catalog exceeds maximumBytes");
      const pathReading = `${NOTE_ROOT}/${locator}`, contentIdentity = digest(bytes);
      resources.push(Object.freeze({ identity: resourceIdentity(root, pathReading, contentIdentity), contentIdentity, byteLength: bytes.length, mediaType: "text/markdown", path: pathReading,
        ...(pathDate === undefined ? {} : { proofPath: NOTE_PROOF_PATH }),
        ...(selection === "all-carriers" ? { placement: pathDate === undefined ? "other" : "dated",
          ...(pathDate === undefined ? {} : { pathDate }), frontmatter: observeFrontmatter(bytes) } : {}) }));
    }
  }
  await walk(notesRoot);
  const body = selection === "dated"
    ? { type: "TypedNodeNoteCatalogReceipt", version: 1, nodeRoot: root, proofPath: NOTE_PROOF_PATH, resourceCount: resources.length, resources }
    : { type: "TypedNodeNoteInventoryReceipt", version: 1, nodeRoot: root, selection, resourceCount: resources.length, resources };
  return receipt(body);
}

