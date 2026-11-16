import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { catalogNodeNotesAction as catalogNodeNotes } from "@red-cup-engineering/note-resource-service/catalog-node-notes";
const NOTE_ROOT = "content/text/documents/articles/notes";

test("the recovery inventory retains out-of-form notes without changing the dated catalog", async t => {
  const nodeRoot = await mkdtemp(join(tmpdir(), "node-note-inventory-"));
  t.after(() => rm(nodeRoot, {recursive: true, force: true}));
  const notes = join(nodeRoot, NOTE_ROOT);
  const dated = "2026/11/16/2026-11-16-note-on-identity.md";
  const flat = "undated.md";
  const history = "history/2026/11/16/2026-11-16-note-on-identity.md";
  const malformed = "recovered/invalid.md";
  const body = "---\ntitle: Private fixture\n---\n\nExact body.\n";
  const files = new Map([
    [dated, body],
    [flat, body],
    [history, "Historical source without a metadata block.\n"],
    [malformed, "---\ntitle: [unterminated\n---\n\nDo not leak this.\n"],
  ]);
  for (const [path, value] of files) {
    const file = join(notes, path);
    await mkdir(dirname(file), {recursive: true});
    await writeFile(file, value);
  }
  await symlink(join(notes, dated), join(notes, "ignored.md"));
  const legacy = await catalogNodeNotes({nodeRoot});
  assert.equal(legacy.type, "TypedNodeNoteCatalogReceipt");
  assert.deepEqual(legacy.resources.map(r => r.path), [`${NOTE_ROOT}/${dated}`]);
  assert.equal(Object.hasOwn(legacy, "selection"), false);
  const report = await catalogNodeNotes({nodeRoot, selection: "all-carriers"});
  assert.equal(report.type, "TypedNodeNoteInventoryReceipt");
  assert.equal(report.resourceCount, files.size);
  const rows = new Map(report.resources.map(r => [r.path.slice(NOTE_ROOT.length + 1), r]));
  assert.deepEqual([...rows.keys()].sort(), [...files.keys()].sort());
  assert.equal(rows.get(dated).identity, legacy.resources[0].identity);
  assert.equal(rows.get(dated).placement, "dated");
  assert.equal(rows.get(dated).pathDate, "2026-11-16");
  assert.equal(rows.get(flat).placement, "other");
  assert.equal(Object.hasOwn(rows.get(flat), "proofPath"), false);
  assert.equal(Object.hasOwn(rows.get(flat), "pathDate"), false);
  assert.equal(rows.get(flat).contentIdentity, rows.get(dated).contentIdentity);
  assert.notEqual(rows.get(flat).identity, rows.get(dated).identity);
  assert.deepEqual(rows.get(flat).frontmatter, {status: "parsed"});
  assert.deepEqual(rows.get(history).frontmatter, {status: "absent"});
  assert.deepEqual(rows.get(malformed).frontmatter, {status: "invalid"});
  assert.doesNotMatch(JSON.stringify(report), /Private fixture|Do not leak this/);
  for (const [path, before] of files) {
    const bytes = await readFile(join(notes, path));
    assert.equal(bytes.toString("utf8"), before);
    assert.equal(rows.get(path).contentIdentity, "sha256:" + createHash("sha256").update(bytes).digest("hex"));
  }
  await assert.rejects(catalogNodeNotes({nodeRoot, selection: "all-carriers", maximumFiles: 3}), /maximumFiles/);
  await assert.rejects(catalogNodeNotes({nodeRoot, selection: "all-carriers", maximumBytes: 5}), /maximumBytes/);
  assert.deepEqual(await catalogNodeNotes({nodeRoot, selection: "dated"}), legacy);
});

test("a source relocation remains visible for verification without reporting its private target", async t => {
  const nodeRoot = await mkdtemp(join(tmpdir(), "node-note-relocation-"));
  t.after(() => rm(nodeRoot, {recursive: true, force: true}));
  const root = join(nodeRoot, NOTE_ROOT);
  await mkdir(root, {recursive: true});
  const link = "https://github.com/private/example/blob/demo/note.md";
  await Promise.all([
    writeFile(join(root, "former.md"), `---\nstatus: relocated-research-source\ncanonical-source: "${link}"\n---\n\nFind the original.\n`),
    writeFile(join(root, "missing.md"), "---\nstatus: relocated-research-source\ncanonical-source: [not, a, scalar]\n---\n"),
    writeFile(join(root, "citation.md"), `---\nstatus: research\ncanonical-source: "${link}"\n---\n`),
  ]);
  const old = await catalogNodeNotes({nodeRoot});
  assert.equal(old.resourceCount, 0);
  const inventory = await catalogNodeNotes({nodeRoot, selection: "all-carriers"});
  assert.deepEqual(Object.fromEntries(inventory.resources.map(row => [row.path.split("/").at(-1), row.frontmatter])), {
    "former.md": {status:"parsed", relocation:"declared"},
    "missing.md": {status:"parsed", relocation:"missing-target"},
    "citation.md": {status:"parsed"},
  });
  assert.doesNotMatch(JSON.stringify(inventory), /github[.]com|Find the original/);
  assert.deepEqual(await catalogNodeNotes({nodeRoot}), old);
});
