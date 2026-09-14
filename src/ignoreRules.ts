/**
 * ignoreRules.ts
 * ------------------------------------------------------------------
 * Builds the combined ignore ruleset used while walking the project:
 *   1. A sane set of DEFAULT_IGNORES (junk that's never useful context)
 *   2. The contents of a user-supplied .ctxignore file (gitignore syntax)
 *
 * We use the battle-tested `ignore` npm package (same matching engine
 * semantics as .gitignore) so users get familiar, predictable behavior.
 * ------------------------------------------------------------------
 */
import fs from "fs";
import path from "path";
import ignore, { Ignore } from "ignore";

/**
 * Folders/files that add noise, not signal, to an AI context file.
 * These are excluded even if the user has no .ctxignore at all.
 */
export const DEFAULT_IGNORES: string[] = [
  // VCS / editor
  ".git",
  ".svn",
  ".hg",
  ".idea",
  ".vscode",
  ".DS_Store",

  // JS/TS ecosystem
  "node_modules",
  "dist",
  "build",
  "out",
  ".next",
  ".nuxt",
  ".svelte-kit",
  ".turbo",
  ".cache",
  "coverage",
  "*.log",
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",

  // Python
  "venv",
  ".venv",
  "__pycache__",
  "*.pyc",
  ".pytest_cache",
  ".mypy_cache",
  "*.egg-info",

  // Other languages / build systems
  "target", // Rust/Java
  "bin/Debug",
  "bin/Release",
  ".gradle",

  // Env & secrets - NEVER include actual secret values in context
  ".env",
  ".env.local",
  ".env.*.local",

  // Binaries / large assets that don't help an LLM understand structure
  "*.png",
  "*.jpg",
  "*.jpeg",
  "*.gif",
  "*.ico",
  "*.webp",
  "*.mp4",
  "*.mov",
  "*.zip",
  "*.tar.gz",
  "*.pdf",

  // The tool's own output, so re-runs don't ingest their own summary
  "project-context.md",
];

/**
 * Load and merge default ignores with an optional user .ctxignore file.
 * Returns a ready-to-use `ignore` matcher instance.
 */
export function loadIgnoreRules(rootDir: string, ignoreFileName: string): Ignore {
  const ig = ignore();
  ig.add(DEFAULT_IGNORES);

  const ignoreFilePath = path.join(rootDir, ignoreFileName);
  if (fs.existsSync(ignoreFilePath)) {
    const contents = fs.readFileSync(ignoreFilePath, "utf-8");
    ig.add(contents);
  }

  return ig;
}
