/**
 * utils/treeUtils.ts
 * ------------------------------------------------------------------
 * Small shared helpers for walking an already-scanned FileNode tree.
 * Both the symbol extractor and the import mapper need a flat list
 * of file nodes (and a fast relPath -> node lookup), so it lives
 * here once instead of being duplicated in two parsers.
 * ------------------------------------------------------------------
 */
import { FileNode } from "../types";

/** Flatten a FileNode tree into a plain array of file (not directory) nodes. */
export function flattenFiles(node: FileNode): FileNode[] {
  const out: FileNode[] = [];
  walk(node, out);
  return out;
}

function walk(node: FileNode, out: FileNode[]): void {
  if (node.type === "file") {
    out.push(node);
    return;
  }
  for (const child of node.children ?? []) {
    walk(child, out);
  }
}

/** Build a Set of every file's relPath for O(1) "does this project file exist" checks. */
export function buildRelPathIndex(files: FileNode[]): Set<string> {
  return new Set(files.map((f) => f.relPath));
}
