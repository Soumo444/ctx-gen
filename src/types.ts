/**
 * types.ts
 * ------------------------------------------------------------------
 * Central place for all shared TypeScript interfaces/types.
 * Keeping these in one file makes it easy to see the "shape" of data
 * as it flows: Scanner -> Parsers -> Generator -> project-context.md
 * ------------------------------------------------------------------
 */

/** A single directory node in the recursively-scanned file tree. */
export interface FileNode {
  /** File or folder name only (not full path) */
  name: string;
  /** Path relative to the project root, e.g. "src/utils/logger.ts" */
  relPath: string;
  /** Absolute path on disk */
  absPath: string;
  type: "file" | "directory";
  /** Populated only when type === "directory" */
  children?: FileNode[];
  /** File size in bytes (files only) */
  size?: number;
}

/** Options resolved from CLI flags + .ctxrc config file (if present). */
export interface CtxGenOptions {
  /** Root directory to scan (defaults to process.cwd()) */
  rootDir: string;
  /** Output markdown file path */
  outFile: string;
  /** Path to a custom ignore file (defaults to .ctxignore) */
  ignoreFile: string;
  /** Max directory depth to descend (Infinity = no limit) */
  maxDepth: number;
  /** Whether to include short content previews of key files */
  includeContent: boolean;
  /** Max number of lines to preview per "key file" */
  previewLines: number;
  /** Print verbose logs while scanning */
  verbose: boolean;
  /** Whether to extract function/class/route signatures from source files */
  includeSymbols: boolean;
  /** Whether to analyze and render the internal import/dependency graph */
  includeImports: boolean;
  /** Max symbols to render per file (keeps huge files from flooding the output) */
  maxSymbolsPerFile: number;
}

/** Summary extracted from package.json (Node projects). */
export interface PackageSummary {
  name?: string;
  version?: string;
  description?: string;
  main?: string;
  type?: string;
  license?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

/** A single environment variable discovered in .env.example / .env.template */
export interface EnvVarEntry {
  key: string;
  comment?: string;
}

/** Summary of a detected database schema (Prisma, raw SQL, etc). */
export interface SchemaSummary {
  sourceFile: string;
  kind: "prisma" | "sql" | "unknown";
  /** Table/model names found */
  models: string[];
}

/** A "key file" whose content gets a short preview in the final markdown. */
export interface KeyFilePreview {
  relPath: string;
  language: string;
  lines: string[];
  truncated: boolean;
}

/** A single extracted function, class, or route from a source file. */
export interface CodeSymbol {
  kind: "function" | "class" | "route";
  /** Human-readable name, e.g. "getUser" or "GET /users/:id" */
  name: string;
  /** Rendered signature line, e.g. "function getUser(id: string): Promise<User>" */
  signature: string;
  /** 1-based line number in the source file */
  line: number;
}

/** All symbols extracted from one source file. */
export interface FileSymbols {
  relPath: string;
  symbols: CodeSymbol[];
  /** True if this file had more symbols than maxSymbolsPerFile allowed */
  truncated: boolean;
}

/** One edge in the internal import graph: `from` imports `to`. */
export interface ImportEdge {
  /** relPath of the file containing the import statement */
  from: string;
  /**
   * For internal imports: resolved relPath of the imported project file.
   * For external imports: the raw package/module name (e.g. "express").
   */
  to: string;
  external: boolean;
}

/** Per-file grouping of an internal import graph, ready for rendering. */
export interface FileImports {
  relPath: string;
  /** relPaths of other project files this file imports */
  internal: string[];
  /** count of distinct external package imports (not listed individually) */
  externalCount: number;
}

/** Token-count estimate for the generated markdown, used to warn about AI context limits. */
export interface TokenStats {
  totalChars: number;
  /** Approximate token count using a ~4-chars-per-token heuristic */
  approxTokens: number;
}

/** Everything the generator needs to render the final markdown file. */
export interface ProjectContext {
  rootName: string;
  generatedAt: string;
  tree: FileNode;
  fileCount: number;
  dirCount: number;
  pkg?: PackageSummary;
  envVars: EnvVarEntry[];
  schemas: SchemaSummary[];
  keyFiles: KeyFilePreview[];
  symbols: FileSymbols[];
  imports: FileImports[];
  /** Filled in after the body is rendered, since it measures the body's size */
  tokenStats?: TokenStats;
}

// ------------------------------------------------------------------
// `ctx-gen docs` types
// ------------------------------------------------------------------

/** A single Python dependency (from requirements.txt, pyproject.toml, or Pipfile). */
export interface PythonDependency {
  name: string;
  version?: string;
}

/** Python dependency list plus which manifest it came from (priority order matters downstream). */
export interface PythonDepsSummary {
  sourceFile: "pyproject.toml" | "requirements.txt" | "Pipfile";
  dependencies: PythonDependency[];
}

/**
 * Result of tech-stack detection. Every conclusion in `languages` /
 * `frameworks` has a matching human-readable reason in `signals`, so
 * the generated README can explain itself instead of guessing silently.
 */
export interface TechStackDetection {
  languages: string[];
  frameworks: string[];
  /** Short display label combining the above, e.g. "Flask + React" */
  primaryType: string;
  signals: string[];
}

/** One ordered step in the generated Quick Start section. */
export interface QuickStartStep {
  label: string;
  command: string;
}

/** Resolved options for the `docs` subcommand. */
export interface DocsGenOptions {
  rootDir: string;
  outFile: string;
  ignoreFile: string;
  maxDepth: number;
  /** Overwrite an existing README.md without prompting */
  force: boolean;
  verbose: boolean;
}

/** Everything docsGenerator.ts needs to render README.md. */
export interface DocsContext {
  rootName: string;
  generatedAt: string;
  tree: FileNode;
  pkg?: PackageSummary;
  pythonDeps?: PythonDepsSummary;
  envVars: EnvVarEntry[];
  schemas: SchemaSummary[];
  techStack: TechStackDetection;
  quickStart: QuickStartStep[];
  description?: string;
  license?: string;
}

// ------------------------------------------------------------------
// `ctx-gen watch` types
// ------------------------------------------------------------------

/** Resolved options for the `watch` subcommand (mostly reuses CtxGenOptions). */
export interface WatchOptions extends CtxGenOptions {
  /** Milliseconds to wait after the last change before regenerating (debounce) */
  debounceMs: number;
}
