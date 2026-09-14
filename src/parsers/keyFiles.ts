/**
 * parsers/keyFiles.ts
 * ------------------------------------------------------------------
 * Identifies a small set of high-signal "entry point" files (main
 * server file, app root, README, CLI entry, etc.) and captures a
 * short preview of each - just enough for an AI assistant to
 * understand how the project boots, without pasting entire files
 * and blowing the token budget.
 * ------------------------------------------------------------------
 */
import fs from "fs";
import path from "path";
import { FileNode, KeyFilePreview } from "../types";

/** Filenames (case-insensitive, matched exactly) considered "entry points". */
const ENTRY_POINT_NAMES = new Set([
  "index.ts",
  "index.js",
  "main.ts",
  "main.py",
  "app.ts",
  "app.js",
  "server.ts",
  "server.js",
  "cli.ts",
  "__main__.py",
  "manage.py",
  "wsgi.py",
]);

/** Always-useful root-level docs/config, previewed regardless of folder depth. */
const ALWAYS_PREVIEW_ROOT_FILES = new Set([
  "readme.md",
  "tsconfig.json",
  "docker-compose.yml",
  "dockerfile",
]);

const LANGUAGE_BY_EXT: Record<string, string> = {
  ".ts": "typescript",
  ".tsx": "tsx",
  ".js": "javascript",
  ".jsx": "jsx",
  ".py": "python",
  ".json": "json",
  ".md": "markdown",
  ".yml": "yaml",
  ".yaml": "yaml",
};

export function findKeyFiles(tree: FileNode, previewLines: number): KeyFilePreview[] {
  const candidates: FileNode[] = [];
  collectCandidates(tree, 0, candidates);

  return candidates
    .slice(0, 12) // hard cap so pathological projects can't bloat the output
    .map((node) => buildPreview(node, previewLines))
    .filter((p): p is KeyFilePreview => p !== null);
}

function collectCandidates(node: FileNode, depth: number, out: FileNode[]): void {
  if (node.type === "file") {
    const lower = node.name.toLowerCase();
    const isRootLevel = depth <= 1;
    if (ENTRY_POINT_NAMES.has(lower) || (isRootLevel && ALWAYS_PREVIEW_ROOT_FILES.has(lower))) {
      out.push(node);
    }
    return;
  }
  for (const child of node.children ?? []) {
    collectCandidates(child, depth + 1, out);
  }
}

function buildPreview(node: FileNode, previewLines: number): KeyFilePreview | null {
  try {
    const contents = fs.readFileSync(node.absPath, "utf-8");
    const allLines = contents.split("\n");
    const truncated = allLines.length > previewLines;
    const lines = allLines.slice(0, previewLines);
    const ext = path.extname(node.name).toLowerCase();

    return {
      relPath: node.relPath,
      language: LANGUAGE_BY_EXT[ext] ?? "",
      lines,
      truncated,
    };
  } catch {
    return null;
  }
}
