import { catalogNodeNotes } from "../src/note-catalog.mjs";

/** Catalog note carriers below one caller-admitted actuator-node root; defaults to dated paths. */
export async function catalogNodeNotesAction(input = {}) { return catalogNodeNotes(input); }

export const operation = Object.freeze({ name: "catalog-node-notes", description: "Catalog note carriers below one caller-admitted actuator-node root; defaults to dated paths.", operation: catalogNodeNotesAction });
