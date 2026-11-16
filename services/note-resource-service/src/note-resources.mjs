import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { basename, dirname } from "node:path";

import { canonicalJson, canonicalizeJson, JSON_RESOURCE_ENVELOPE } from "@red-cup-engineering/json-engine/canonical";
import { parseDatedNotePath, projectNotePath } from "@red-cup-engineering/computer-article-engineering-services-section/article-content-path-grammar";
import { createMarkdownDocument } from "@red-cup-engineering/markdown-engineering-services-section/create-markdown-document";
import { readMarkdownFrontmatter } from "@red-cup-engineering/markdown-engineering-services-section/read-markdown-frontmatter";
import { siteNoteFrontmatterConformance } from "@red-cup-engineering/markdown-engineering-services-section/markdown-projector";
import { validateMarkdownDocument } from "@red-cup-engineering/markdown-engineering-services-section/validate-markdown-document";

import { NOTE_PROOF_PATH, admittedRoot, inside, validDate, digest, text, resourceIdentity, receipt } from "./note-resource-identity.mjs";
export { NOTE_ROOT, NOTE_PROOF_PATH, NOTE_RESOURCE_CATALOG } from "./note-resource-identity.mjs";
export { catalogNodeNotes } from "./note-catalog.mjs";

const SHA256 = /^sha256:([a-f0-9]{64})$/u;

function slug(value) {
  const normalized = text(value, "slug", 160).toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/gu, "-").replace(/^-|-$/gu, "");
  if (!normalized) throw new TypeError("slug must contain an ASCII letter or digit");
  return normalized;
}
/** Merge supplied facets without silently replacing an authored value. */
function addFacets(frontmatter, supplied) {
  const admitted = canonicalizeJson(supplied, JSON_RESOURCE_ENVELOPE).value;
  for (const [key, value] of Object.entries(admitted)) {
    if (Object.hasOwn(frontmatter, key) && canonicalJson(frontmatter[key]) !== canonicalJson(value)) {
      throw new TypeError(`note frontmatter conflicts with supplied ${key}`);
    }
    Object.defineProperty(frontmatter, key, { value, enumerable: true, writable: true, configurable: true });
  }
}
function noteText(input) {
  const raw = input.carrier?.content;
  if (typeof raw !== "string" || raw.trim().length === 0 || raw.length > 16 * 1024 * 1024) throw new TypeError("carrier.content must be 1-16777216 characters");
  // The incoming carrier identity covers its actual bytes, including whitespace.
  const sourceSha256 = digest(Buffer.from(raw, "utf8"));
  if (input.carrier.sha256 !== undefined && (!SHA256.test(input.carrier.sha256) || sourceSha256 !== input.carrier.sha256)) throw new Error("carrier bytes do not match carrier.sha256");
  const parsed = readMarkdownFrontmatter(raw);
  const frontmatter = { ...canonicalizeJson(parsed.frontmatter ?? {}, JSON_RESOURCE_ENVELOPE).value };
  if (input.frontmatter !== undefined) {
    if (input.frontmatter === null || typeof input.frontmatter !== "object" || Array.isArray(input.frontmatter)) throw new TypeError("frontmatter must be an object");
    addFacets(frontmatter, input.frontmatter);
  }
  addFacets(frontmatter, { title: input.title });
  if (input.explicitAuthority !== undefined) addFacets(frontmatter, { authority: input.explicitAuthority });
  if (!Object.hasOwn(frontmatter, "date-created")) addFacets(frontmatter, { "date-created": input.date });
  else if (typeof frontmatter["date-created"] !== "string" || frontmatter["date-created"].slice(0, 10) !== input.date) {
    throw new TypeError("note date conflicts with authored date-created");
  }
  const defaults = { kind: "note", status: "research", "owning-enterprise": "red-cup-engineering", authority: input.authority };
  for (const [key, value] of Object.entries(defaults)) if (!Object.hasOwn(frontmatter, key)) addFacets(frontmatter, { [key]: value });
  for (const [key, value] of Object.entries(input.source)) if (value !== undefined && value !== null) addFacets(frontmatter, { [`source-${key}`]: String(value) });
  const conformance = siteNoteFrontmatterConformance(frontmatter);
  if (!conformance.conformant) {
    const failed = conformance.observations.filter((entry) => entry.modality === "MUST" && entry.evidence.against.length > 0).map((entry) => entry.predicate);
    throw new TypeError(`note frontmatter does not settle required facets: ${failed.join(", ")}`);
  }
  // Reserve only a synthetic body key absent from the authored metadata.
  let bodyKey = "__note_body";
  while (Object.hasOwn(frontmatter, bodyKey)) bodyKey += "_";
  const content = createMarkdownDocument(frontmatter, { body: parsed.body, bodyKey, nullFrontmatter: "preserve" });
  const roundTrip = readMarkdownFrontmatter(content);
  if (canonicalJson(roundTrip.frontmatter) !== canonicalJson(frontmatter)) throw new TypeError("Markdown generation cannot preserve all authored frontmatter fields");
  // Authorship is retained; generic validator policy must not erase it.
  const validation = validateMarkdownDocument(content, { forbiddenFrontmatterKeys: [] });
  if (!validation.parseable) throw new TypeError("generated note frontmatter is not parseable");
  return Object.freeze({ content, sourceSha256, findings: validation.findings });
}
export async function depositNoteCarrier(input) {
  const root = admittedRoot(input.nodeRoot), date = validDate(input.date), title = text(input.title, "title", 240), name = `${date.value}-note-on-${slug(input.slug ?? title)}.md`;
  const relativePath = projectNotePath(`${date.year}/${date.month}/${date.day}/${name}`), target = inside(root, relativePath);
  if (parseDatedNotePath(relativePath)?.date !== date.value) throw new TypeError("note path does not settle the article grammar");
  const mode = input.mode ?? "create";
  if (!new Set(["create", "replace", "upsert"]).has(mode)) throw new TypeError("mode must be create, replace, or upsert");
  const authority = input.authority ?? "source-grounded-provider-output-not-publication-or-actuation-authority";
  const source = input.source && typeof input.source === "object" && !Array.isArray(input.source) ? canonicalizeJson(input.source, JSON_RESOURCE_ENVELOPE).value : {};
  const prepared = noteText({ ...input, title, date: date.value, source, authority, explicitAuthority: input.authority }), bytes = Buffer.from(prepared.content, "utf8");
  let current = null;
  try { current = await readFile(target); } catch (error) { if (error?.code !== "ENOENT") throw error; }
  if (mode === "create" && current) throw new Error("create refused because the note already exists");
  if (mode === "replace" && !current) throw new Error("replace refused because the note does not exist");
  const contentIdentity = digest(bytes), resource = resourceIdentity(root, relativePath, contentIdentity);
  if (current?.equals(bytes)) return receipt({ type: "NoteCarrierDepositReceipt", version: 1, disposition: "already-present", resource, contentIdentity, sourceResource: prepared.sourceSha256, nodeRoot: root, path: relativePath, proofPath: NOTE_PROOF_PATH, source, authority, findings: prepared.findings });
  await mkdir(dirname(target), { recursive: true });
  const temporary = inside(dirname(target), `.${basename(target)}.${process.pid}.${randomUUID()}.tmp`);
  try { await writeFile(temporary, bytes, { flag: "wx", mode: 0o644 }); await rename(temporary, target); } catch (error) { await unlink(temporary).catch(() => {}); throw error; }
  return receipt({ type: "NoteCarrierDepositReceipt", version: 1, disposition: current ? "replaced" : "created", resource, contentIdentity, sourceResource: prepared.sourceSha256, byteLength: bytes.length, nodeRoot: root, path: relativePath, proofPath: NOTE_PROOF_PATH, source, authority, findings: prepared.findings });
}
