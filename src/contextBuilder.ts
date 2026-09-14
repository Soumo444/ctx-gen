/**
 * contextBuilder.ts
 * ------------------------------------------------------------------
 * Shared "tree + stats -> ProjectContext" assembly, used by both the
 * one-shot `scan` command and the continuously-running `watch`
 * command, so the two can never drift out of sync with each other.
 * ------------------------------------------------------------------
 */
import path from "path";
import { CtxGenOptions, ProjectContext, FileNode } from "./types";
import { ScanStats } from "./scanner";
import { parsePackageJson } from "./parsers/packageJson";
import { parseEnvExample } from "./parsers/envExample";
import { parseSchemas } from "./parsers/schema";
import { findKeyFiles } from "./parsers/keyFiles";
import { extractSymbols } from "./parsers/codeSymbols";
import { buildImportGraph } from "./parsers/importGraph";

export function buildProjectContext(options: CtxGenOptions, tree: FileNode, stats: ScanStats): ProjectContext {
  const pkg = parsePackageJson(options.rootDir);
  const envVars = parseEnvExample(options.rootDir);
  const schemas = parseSchemas(tree);
  const keyFiles = options.includeContent ? findKeyFiles(tree, options.previewLines) : [];
  const symbols = options.includeSymbols ? extractSymbols(tree, options.maxSymbolsPerFile) : [];
  const imports = options.includeImports ? buildImportGraph(tree) : [];

  return {
    rootName: path.basename(options.rootDir),
    generatedAt: new Date().toISOString(),
    tree,
    fileCount: stats.fileCount,
    dirCount: stats.dirCount,
    pkg,
    envVars,
    schemas,
    keyFiles,
    symbols,
    imports,
  };
}
