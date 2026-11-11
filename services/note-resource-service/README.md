# Note resource service

<!-- 561-group-standards:badges:start -->
[![Red Cup Engineering](https://img.shields.io/badge/561%20Group-Red%20Cup%20Engineering-c0392b)](https://github.com/red-cup-engineering)
[![License: MIT](https://img.shields.io/badge/license-MIT-c0392b)](LICENSE)
[![Indigenous data: CARE](https://img.shields.io/badge/Indigenous%20data-CARE-4b6f44)](https://github.com/red-cup-engineering/.github/blob/main/GOVERNANCE.md)
[![Tips welcome](https://img.shields.io/badge/tips-welcome-d4a017)](https://github.com/561-group/.github/blob/main/TIPS.md)
<!-- 561-group-standards:badges:end -->

This service catalogs dated notes and deposits supplied Markdown beneath an
admitted actuator node. It uses the shared article path grammar, Markdown
reader, document creator and validator. Those providers own YAML encoding,
semantic linefeeds and note-frontmatter conformance.

## Deposit a note

Import `depositNoteCarrier` from
`@red-cup-engineering/note-resource-service` and supply:

| Field | Meaning |
| --- | --- |
| `nodeRoot` | Filesystem root of the receiving actuator node. |
| `date` | Real filing date in `YYYY-MM-DD` form. |
| `title` | Note title; must agree with any authored title. |
| `carrier.content` | Nonempty Markdown, with or without YAML frontmatter. |
| `frontmatter` | Optional metadata to add without replacing authored values. |
| `source` | Optional provider attribution; non-null values become `source-<key>` frontmatter strings and remain in the receipt. |
| `slug` | Optional filename topic, derived from the title when absent. |
| `carrier.sha256` | Optional `sha256:<64 lowercase hex digits>` witness for the exact incoming UTF-8 bytes. |
| `authority` | Optional scope, retained in the receipt and frontmatter; must agree with authored authority. |
| `mode` | `create` by default, or `replace` or `upsert`. |

The path is
`content/text/documents/articles/notes/YYYY/MM/DD/YYYY-MM-DD-note-on-<topic>.md`.
The topic is normalized to lowercase ASCII letters, digits and hyphens; an
empty result is refused.

The note must carry a title, a non-generic description, `date-created` and
nonempty tags. Put the description and tags in incoming frontmatter or the
`frontmatter` object. The service fills a missing creation date from `date`;
an authored timestamp is preserved in full and must name the same day.
Missing `kind`, `status` and `owning-enterprise` default to `note`,
`research` and `red-cup-engineering`. The default authority is
`source-grounded-provider-output-not-publication-or-actuation-authority`.

| Mode | Missing destination | Existing destination |
| --- | --- | --- |
| `create` | Create. | Refuse, including identical bytes. |
| `replace` | Refuse. | Replace changed bytes; return `already-present` for identical bytes. |
| `upsert` | Create. | Replace changed bytes; return `already-present` for identical bytes. |

## Source preservation and receipts

Authorship, dates, references and other authored fields survive generation.
Conflicting supplied values, malformed frontmatter and a lossy YAML round trip
refuse before writing. Authored null fields are explicitly preserved.

Decoded and supplied metadata pass the JSON provider's bounded resource
envelope. Runtime `Date` objects, undefined values, non-finite numbers,
cycles and accessors are refused; write dates as strings. The YAML reader
also refuses non-JSON values. Own `__proto__` fields remain ordinary metadata
without changing object prototypes.

The shared Markdown creator normalizes the output. Non-destructive validation
findings remain in the receipt: a leading heading that repeats the title, for
example, is reported without rewriting it. After validation, the service
writes a temporary file and renames it into the destination.

A `NoteCarrierDepositReceipt` carries the disposition, path, node root,
source attribution, authority and findings. Its identities distinguish:

| Field | Identifies |
| --- | --- |
| `sourceResource` | Exact incoming UTF-8 bytes, including whitespace and line endings. |
| `contentIdentity` | Generated Markdown bytes. |
| `resource` | Node root, relative path and generated content identity together. |
| `id` | Receipt body. |

Normalization may change the output bytes. Equal input bytes deposited under
different paths produce different resources. The `proofPath` records the
restriction `file → data → content → text → document → article → note`
realized by the directory path.

A deposit records a research note. It does not certify an engineering result,
turn research into law, grant publication or actuation authority, or move
legacy notes.

## Catalog and verify

Import `catalogNodeNotes` from the same package and call it with
`{ nodeRoot }`. It returns a `TypedNodeNoteCatalogReceipt` containing
only dated Markdown paths matching the article grammar. It skips symbolic
links encountered while walking the note directory. Entries carry their
path, byte length, content identity and resource identity. The default limits
are 10,000 notes and 64 MiB of content; callers may supply `maximumFiles`
and `maximumBytes`.

The [catalog module](scripts/catalog-node-notes.mjs) and
[deposit module](scripts/deposit-note-carrier.mjs) also export named operation
descriptors whose `operation` functions accept the same inputs.

Use Node 22 or newer in a workspace that resolves the dependencies in
[`package.json`](package.json), then run `npm run verify`. The existing
[deposit and catalog tests](test/note-resources.test.mjs) and
[generation tests](test/note-generation.test.mjs) cover path identity,
metadata preservation, source digests, validation findings, mode behavior
and rejected inputs. The [implementation](src/note-resources.mjs) defines the
current behavior.
