import { createHash } from "node:crypto";
import { resolve, sep } from "node:path";
import { projectNotePath } from "@red-cup-engineering/computer-article-engineering-services-section/article-content-path-grammar";

export const NOTE_ROOT = projectNotePath("");
export const NOTE_PROOF_PATH = Object.freeze([
  "file", "data", "content", "text", "document", "article", "note",
]);
export const NOTE_RESOURCE_CATALOG = Object.freeze({
  profile: "org.red-cup-engineering.typed-resource-catalog.v1",
  nodes: Object.freeze(NOTE_PROOF_PATH.map((type, index) => Object.freeze({
    type,
    parent: index === 0 ? null : NOTE_PROOF_PATH[index - 1],
  }))),
  imports: Object.freeze([
    "@red-cup-engineering/typed-resource-catalog",
    "@red-cup-engineering/markdown-file-reading-service",
    "@red-cup-engineering/markdown-file-writing-service",
    "@red-cup-engineering/computer-code-engine/semiotic-expression-notation/semantic-content-identity",
    "@red-cup-engineering/immutable-content-custody-service",
    "@red-cup-engineering/organizing-a-knowledge-vault",
    "@red-cup-engineering/standards-conformance-services-section",
  ]),
});
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/u;

export function digest(bytes) { return `sha256:${createHash("sha256").update(bytes).digest("hex")}`; }
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
export function receipt(body) { return Object.freeze({ id: `urn:sha256:${createHash("sha256").update(canonical(body)).digest("hex")}`, ...body }); }
export function resourceIdentity(nodeRoot, path, contentIdentity) {
  return `urn:sha256:${createHash("sha256").update(canonical({ nodeRoot, path, contentIdentity })).digest("hex")}`;
}
export function text(value, field, maximum = 4096) {
  if (typeof value !== "string" || value.trim().length === 0 || value.trim().length > maximum) throw new TypeError(`${field} must be 1-${maximum} characters`);
  return value.trim();
}
export function admittedRoot(nodeRoot) { return resolve(text(nodeRoot, "nodeRoot", 16_384)); }
export function inside(root, candidate) {
  const target = resolve(root, candidate);
  if (target !== root && !target.startsWith(`${root}${sep}`)) throw new RangeError("resource path escaped the admitted actuator node");
  return target;
}
export function validDate(value) {
  const match = DATE.exec(text(value, "date", 10));
  if (!match) throw new TypeError("date must be YYYY-MM-DD");
  const instant = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(instant.valueOf()) || instant.toISOString().slice(0, 10) !== value) throw new TypeError("date must be a real calendar date");
  return { value, year: match[1], month: match[2], day: match[3] };
}
