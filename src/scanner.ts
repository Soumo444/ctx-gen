/**
 * scanner.ts
 * ------------------------------------------------------------------
 * Recursively walks the project directory on disk and builds an
 * in-memory FileNode tree, skipping anything matched by the ignore
 * ruleset. This tree is the single source of truth that every other
 * part of the tool (tree renderer, parsers, generator) reads from.
 * ------------------------------------------------------------------
 */
import fs from "fs";
import path from "path";
import { Ignore } from "ignore";
import { FileNode } from "./types";

export interface ScanStats {
  fileCount: number;
  dirCount: number;
}

/**
 * Scan `rootDir` recursively and return the root FileNode plus counts.
 * `maxDepth` of Infinity means "no limit". Depth 0 = just the root dir.
 */
export function scanDirectory(
  rootDir: string,
  ig: Ignore,
  maxDepth: number
): { tree: FileNode; stats: ScanStats } {
  const stats: ScanStats = { fileCount: 0, dirCount: 0 };

  const rootNode: FileNode = {
    name: path.basename(rootDir) || rootDir,
    relPath: ".",
    absPath: rootDir,
    type: "directory",
    children: [],
  };

  walk(rootDir, rootDir, rootNode, ig, 0, maxDepth, stats);

  return { tree: rootNode, stats };
}

function walk(
  rootDir: string,
  currentDir: string,
  node: FileNode,
  ig: Ignore,
  depth: number,
  maxDepth: number,
  stats: ScanStats
): void {
  if (depth >= maxDepth) return;

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(currentDir, { withFileTypes: true });
  } catch {
    // Unreadable directory (permissions, broken symlink, etc.) - skip quietly
    return;
  }

  // Sort: directories first, then files, both alphabetically.
  // This gives a clean, predictable tree instead of raw filesystem order.
  entries.sort((a, b) => {
    if (a.isDirectory() && !b.isDirectory()) return -1;
    if (!a.isDirectory() && b.isDirectory()) return 1;
    return a.name.localeCompare(b.name);
  });

  for (const entry of entries) {
    const absPath = path.join(currentDir, entry.name);
    const relPath = path.relative(rootDir, absPath).split(path.sep).join("/");

    // `ignore` matches gitignore-style patterns against POSIX-style relative
    // paths. Directory-only patterns (e.g. "dist/") only match when the
    // tested path itself carries a trailing slash, so we append one for dirs.
    const testPath = entry.isDirectory() ? `${relPath}/` : relPath;
    if (ig.ignores(testPath)) continue;

    if (entry.isDirectory()) {
      const dirNode: FileNode = {
        name: entry.name,
        relPath,
        absPath,
        type: "directory",
        children: [],
      };
      stats.dirCount++;
      node.children!.push(dirNode);
      walk(rootDir, absPath, dirNode, ig, depth + 1, maxDepth, stats);
    } else if (entry.isFile()) {
      let size = 0;
      try {
        size = fs.statSync(absPath).size;
      } catch {
        /* ignore stat errors */
      }
      node.children!.push({
        name: entry.name,
        relPath,
        absPath,
        type: "file",
        size,
      });
      stats.fileCount++;
    }
    // symlinks and other special types are silently skipped
  }
}
