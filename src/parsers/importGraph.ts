/**
 * parsers/importGraph.ts
 * ------------------------------------------------------------------
 * Parses import/require (TS/JS) and import/from-import (Python)
 * statements and resolves the RELATIVE ones against the actual
 * scanned file tree, producing a map of "which project files does
 * this file pull in". External package imports (react, express,
 * numpy, ...) are counted but not individually listed - they're
 * already summarized in the package.json dependency section, so
 * repeating them here would just burn tokens without adding signal.
 *
 * Like codeSymbols.ts, this is regex-based on purpose: fast, zero
 * extra dependencies, good enough to answer "how do these files
 * connect" without a real module resolver.
 * ------------------------------------------------------------------
 */
import fs from "fs";
import path from "path";
import { FileNode, ImportEdge, FileImports } from "../types";
import { flattenFiles, buildRelPathIndex } from "../utils/treeUtils";

const TS_JS_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx"];
const PY_EXTENSION = ".py";

// import x from "..."; import "..."; import type { X } from "...";  export ... from "...";
const TS_IMPORT_FROM_RE = /(?:^|\s)(?:import|export)(?:[\s\S]*?)from\s+["']([^"']+)["']/;
const TS_SIDE_EFFECT_IMPORT_RE = /^\s*import\s+["']([^"']+)["']/;
const TS_REQUIRE_RE = /require\(\s*["']([^"']+)["']\s*\)/;

const PY_FROM_IMPORT_RE = /^\s*from\s+([\w.]+)\s+import\b/;
const PY_IMPORT_RE = /^\s*import\s+([\w.]+(?:\s*,\s*[\w.]+)*)/;

/**
 * Build the full import graph for the project, then collapse it into
 * one FileImports entry per source file (internal targets + a count
 * of external imports) - the shape the generator renders directly.
 */
export function buildImportGraph(tree: FileNode): FileImports[] {
  const files = flattenFiles(tree);
  const relPathIndex = buildRelPathIndex(files);
  const edges: ImportEdge[] = [];

  for (const file of files) {
    const ext = extname(file.name);
    if (!TS_JS_EXTENSIONS.includes(ext) && ext !== PY_EXTENSION) continue;

    const specifiers = ext === PY_EXTENSION ? extractPythonImports(file.absPath) : extractTsJsImports(file.absPath);

    for (const spec of specifiers) {
      const resolved =
        ext === PY_EXTENSION
          ? resolvePythonImport(spec, file.relPath, relPathIndex)
          : resolveTsJsImport(spec, file.relPath, relPathIndex);

      if (resolved) {
        edges.push({ from: file.relPath, to: resolved, external: false });
      } else if (isLikelyExternal(spec)) {
        edges.push({ from: file.relPath, to: spec, external: true });
      }
      // Non-relative internal-looking specifiers that don't resolve to a
      // real file (e.g. a path-mapped alias like "@/utils") are silently
      // dropped rather than guessed at - wrong edges are worse than missing ones.
    }
  }

  return collapseToFileImports(edges);
}

// ---- TS/JS ------------------------------------------------------------

function extractTsJsImports(absPath: string): string[] {
  const lines = readLines(absPath);
  const specs: string[] = [];

  for (const line of lines) {
    const fromMatch = line.match(TS_IMPORT_FROM_RE);
    if (fromMatch) {
      specs.push(fromMatch[1]);
      continue;
    }
    const sideEffectMatch = line.match(TS_SIDE_EFFECT_IMPORT_RE);
    if (sideEffectMatch) {
      specs.push(sideEffectMatch[1]);
      continue;
    }
    const requireMatch = line.match(TS_REQUIRE_RE);
    if (requireMatch) {
      specs.push(requireMatch[1]);
    }
  }
  return specs;
}

function resolveTsJsImport(spec: string, fromRelPath: string, index: Set<string>): string | null {
  if (!spec.startsWith(".")) return null; // not a relative import -> not internal

  const fromDir = path.posix.dirname(fromRelPath);
  const joined = path.posix.normalize(path.posix.join(fromDir, spec));

  const candidates = [
    joined,
    `${joined}.ts`,
    `${joined}.tsx`,
    `${joined}.js`,
    `${joined}.jsx`,
    `${joined}/index.ts`,
    `${joined}/index.tsx`,
    `${joined}/index.js`,
  ];

  return candidates.find((c) => index.has(c)) ?? null;
}

// ---- Python -------------------------------------------------------------

function extractPythonImports(absPath: string): string[] {
  const lines = readLines(absPath);
  const specs: string[] = [];

  for (const line of lines) {
    const fromMatch = line.match(PY_FROM_IMPORT_RE);
    if (fromMatch) {
      specs.push(fromMatch[1]);
      continue;
    }
    const importMatch = line.match(PY_IMPORT_RE);
    if (importMatch) {
      // `import os, sys, json` -> three separate specifiers
      importMatch[1].split(",").forEach((m) => specs.push(m.trim()));
    }
  }
  return specs;
}

function resolvePythonImport(spec: string, fromRelPath: string, index: Set<string>): string | null {
  // Relative import: `.sibling` or `..pkg.module`
  if (spec.startsWith(".")) {
    const fromDir = path.posix.dirname(fromRelPath);
    const dots = spec.match(/^\.+/)?.[0].length ?? 1;
    const modulePath = spec.slice(dots).replace(/\./g, "/");
    let baseDir = fromDir;
    for (let i = 1; i < dots; i++) baseDir = path.posix.dirname(baseDir);
    const joined = path.posix.normalize(path.posix.join(baseDir, modulePath));
    return findPythonCandidate(joined, index);
  }

  // Absolute-looking import: only treat as internal if it actually
  // resolves to a file under the project root (e.g. "myapp.models").
  const asPath = spec.replace(/\./g, "/");
  return findPythonCandidate(asPath, index);
}

function findPythonCandidate(joined: string, index: Set<string>): string | null {
  const candidates = [`${joined}.py`, `${joined}/__init__.py`];
  return candidates.find((c) => index.has(c)) ?? null;
}

// ---- Shared ---------------------------------------------------------------

/** Heuristic for "is this worth counting as an external dependency import". */
function isLikelyExternal(spec: string): boolean {
  // Skip path aliases (contain "/" but aren't relative and aren't a bare
  // package name) - they're ambiguous without reading tsconfig paths, and
  // showing them as fake "external packages" would be misleading.
  if (spec.startsWith(".") || spec.startsWith("/")) return false;
  if (spec.startsWith("@/") || spec.includes("://")) return false;
  return true;
}

function collapseToFileImports(edges: ImportEdge[]): FileImports[] {
  const map = new Map<string, FileImports>();

  for (const edge of edges) {
    if (!map.has(edge.from)) {
      map.set(edge.from, { relPath: edge.from, internal: [], externalCount: 0 });
    }
    const entry = map.get(edge.from)!;
    if (edge.external) {
      entry.externalCount++;
    } else if (!entry.internal.includes(edge.to)) {
      entry.internal.push(edge.to);
    }
  }

  return Array.from(map.values())
    .filter((f) => f.internal.length > 0) // only files with internal connections are worth rendering
    .sort((a, b) => a.relPath.localeCompare(b.relPath));
}

function readLines(absPath: string): string[] {
  try {
    return fs.readFileSync(absPath, "utf-8").split("\n");
  } catch {
    return [];
  }
}

function extname(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot === -1 ? "" : filename.slice(dot).toLowerCase();
}
