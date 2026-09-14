#!/usr/bin/env node
/**
 * cli.ts
 * ------------------------------------------------------------------
 * The command-line interface. Three subcommands, all built on the
 * same scanner + ignore-rules foundation:
 *
 *   ctx-gen scan   -> write project-context.md (for AI assistants)
 *   ctx-gen docs   -> write README.md (for humans)
 *   ctx-gen watch  -> keep project-context.md continuously up to date
 *
 * Usage:
 *   npx ctx-gen                          # same as `ctx-gen scan`
 *   npx ctx-gen scan -o out.md --no-content
 *   npx ctx-gen docs --force
 *   npx ctx-gen watch --debounce 600
 * ------------------------------------------------------------------
 */
import fs from "fs";
import path from "path";
import { Command } from "commander";
import chalk from "chalk";

import { CtxGenOptions, DocsContext, WatchOptions } from "./types";
import { loadIgnoreRules } from "./ignoreRules";
import { scanDirectory } from "./scanner";
import { buildProjectContext } from "./contextBuilder";
import { generateMarkdown } from "./generator";
import { startWatch } from "./watcher";

import { parsePackageJson } from "./parsers/packageJson";
import { parsePythonDeps, parsePyprojectDescription } from "./parsers/pythonDeps";
import { parseEnvExample } from "./parsers/envExample";
import { parseSchemas } from "./parsers/schema";
import { findKeyFiles } from "./parsers/keyFiles";
import { detectTechStack } from "./detectors/projectType";
import { detectLicense } from "./detectors/license";
import { buildQuickStart } from "./quickStart";
import { generateReadme } from "./docsGenerator";

const pkgJson = require("../package.json");

const program = new Command();

program
  .name("ctx-gen")
  .description("Local context engine for AI coding assistants — scan, document, and watch your project")
  .version(pkgJson.version);

// ---------------------------------------------------------------------
// ctx-gen scan
// ---------------------------------------------------------------------
program
  .command("scan", { isDefault: true })
  .description("Scan the current project and generate project-context.md")
  .option("-o, --out <file>", "output file path", "project-context.md")
  .option("-i, --ignore-file <file>", "custom ignore file", ".ctxignore")
  .option("-d, --max-depth <n>", "maximum directory depth to scan", parseIntOption, Infinity)
  .option("--no-content", "skip content previews of key entry-point files")
  .option("-l, --preview-lines <n>", "lines to preview per key file", parseIntOption, 40)
  .option("--no-symbols", "skip function/class/route signature extraction")
  .option("--no-imports", "skip the internal import/dependency graph")
  .option("--max-symbols <n>", "max symbols to render per file", parseIntOption, 25)
  .option("-v, --verbose", "verbose logging", false)
  .action(runScan);

// ---------------------------------------------------------------------
// ctx-gen docs
// ---------------------------------------------------------------------
program
  .command("docs")
  .description("Generate a professional README.md by detecting your tech stack")
  .option("-o, --out <file>", "output file path", "README.md")
  .option("-i, --ignore-file <file>", "custom ignore file", ".ctxignore")
  .option("-d, --max-depth <n>", "maximum directory depth to scan", parseIntOption, Infinity)
  .option("-f, --force", "overwrite an existing README.md without prompting", false)
  .option("-v, --verbose", "verbose logging", false)
  .action(runDocs);

// ---------------------------------------------------------------------
// ctx-gen watch
// ---------------------------------------------------------------------
program
  .command("watch")
  .description("Continuously regenerate project-context.md as files change")
  .option("-o, --out <file>", "output file path", "project-context.md")
  .option("-i, --ignore-file <file>", "custom ignore file", ".ctxignore")
  .option("-d, --max-depth <n>", "maximum directory depth to scan", parseIntOption, Infinity)
  .option("--no-content", "skip content previews of key entry-point files")
  .option("-l, --preview-lines <n>", "lines to preview per key file", parseIntOption, 40)
  .option("--no-symbols", "skip function/class/route signature extraction")
  .option("--no-imports", "skip the internal import/dependency graph")
  .option("--max-symbols <n>", "max symbols to render per file", parseIntOption, 25)
  .option("--debounce <ms>", "ms to wait after the last change before regenerating", parseIntOption, 400)
  .option("-v, --verbose", "verbose logging", false)
  .action(runWatch);

program.parseAsync(process.argv).catch((err) => {
  console.error(chalk.red("✖ ctx-gen failed:"), err instanceof Error ? err.message : err);
  process.exit(1);
});

function parseIntOption(value: string): number {
  const parsed = parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`Expected a number, got "${value}"`);
  }
  return parsed;
}

// =======================================================================
// scan
// =======================================================================

async function runScan(cmdOptions: {
  out: string;
  ignoreFile: string;
  maxDepth: number;
  content: boolean;
  previewLines: number;
  symbols: boolean;
  imports: boolean;
  maxSymbols: number;
  verbose: boolean;
}): Promise<void> {
  const startedAt = Date.now();
  const options = resolveCtxGenOptions(cmdOptions);

  log(options, chalk.cyan(`🔍 Scanning ${options.rootDir} ...`));

  const ig = loadIgnoreRules(options.rootDir, options.ignoreFile);
  const { tree, stats } = scanDirectory(options.rootDir, ig, options.maxDepth);

  log(options, chalk.gray(`  found ${stats.fileCount} files, ${stats.dirCount} directories`));

  const context = buildProjectContext(options, tree, stats);
  const markdown = generateMarkdown(context);
  fs.writeFileSync(options.outFile, markdown, "utf-8");

  const elapsedMs = Date.now() - startedAt;
  const sizeKb = (Buffer.byteLength(markdown, "utf-8") / 1024).toFixed(1);
  const tokenNote = context.tokenStats ? `~${context.tokenStats.approxTokens.toLocaleString()} tokens` : "";

  console.log(chalk.green(`✔ Wrote ${path.relative(options.rootDir, options.outFile)}`));
  console.log(
    chalk.gray(
      `  ${stats.fileCount} files • ${context.symbols.length} file(s) w/ symbols • ${context.imports.length} file(s) w/ internal imports • ${sizeKb} KB • ${tokenNote} • ${elapsedMs}ms`
    )
  );
  console.log(chalk.dim("\nPaste this file into your AI assistant, or point Cursor/Copilot at it directly."));
}

function resolveCtxGenOptions(cmdOptions: {
  out: string;
  ignoreFile: string;
  maxDepth: number;
  content: boolean;
  previewLines: number;
  symbols: boolean;
  imports: boolean;
  maxSymbols: number;
  verbose: boolean;
}): CtxGenOptions {
  const rootDir = process.cwd();
  return {
    rootDir,
    outFile: path.isAbsolute(cmdOptions.out) ? cmdOptions.out : path.join(rootDir, cmdOptions.out),
    ignoreFile: cmdOptions.ignoreFile,
    maxDepth: cmdOptions.maxDepth,
    includeContent: cmdOptions.content,
    previewLines: cmdOptions.previewLines,
    verbose: cmdOptions.verbose,
    includeSymbols: cmdOptions.symbols,
    includeImports: cmdOptions.imports,
    maxSymbolsPerFile: cmdOptions.maxSymbols,
  };
}

// =======================================================================
// docs
// =======================================================================

async function runDocs(cmdOptions: {
  out: string;
  ignoreFile: string;
  maxDepth: number;
  force: boolean;
  verbose: boolean;
}): Promise<void> {
  const rootDir = process.cwd();
  const outFile = path.isAbsolute(cmdOptions.out) ? cmdOptions.out : path.join(rootDir, cmdOptions.out);

  if (fs.existsSync(outFile) && !cmdOptions.force) {
    console.log(chalk.yellow(`⚠ ${path.relative(rootDir, outFile)} already exists.`));
    console.log(chalk.gray("  Re-run with --force to overwrite it."));
    return;
  }

  if (cmdOptions.verbose) console.log(chalk.cyan(`🔍 Scanning ${rootDir} ...`));

  const ig = loadIgnoreRules(rootDir, cmdOptions.ignoreFile);
  const { tree } = scanDirectory(rootDir, ig, cmdOptions.maxDepth);

  const pkg = parsePackageJson(rootDir);
  const pythonDeps = parsePythonDeps(rootDir);
  const envVars = parseEnvExample(rootDir);
  const schemas = parseSchemas(tree);
  const keyFiles = findKeyFiles(tree, 60); // deeper preview here just to locate entry points, not rendered directly

  const techStack = detectTechStack(tree, pkg, pythonDeps);
  const quickStart = buildQuickStart(techStack, pkg, pythonDeps, keyFiles);
  const license = detectLicense(tree, pkg);
  const description = pkg?.description || parsePyprojectDescription(rootDir);

  const docsContext: DocsContext = {
    rootName: path.basename(rootDir),
    generatedAt: new Date().toISOString(),
    tree,
    pkg,
    pythonDeps,
    envVars,
    schemas,
    techStack,
    quickStart,
    description,
    license,
  };

  const readme = generateReadme(docsContext);
  fs.writeFileSync(outFile, readme, "utf-8");

  console.log(chalk.green(`✔ Wrote ${path.relative(rootDir, outFile)}`));
  console.log(chalk.gray(`  Detected: ${techStack.primaryType}`));

  if (cmdOptions.verbose) {
    techStack.signals.forEach((signal) => console.log(chalk.dim(`  • ${signal}`)));
  }

  console.log(chalk.dim("\nReview and customize before publishing — this is a solid first draft, not a final copy."));
}

// =======================================================================
// watch
// =======================================================================

async function runWatch(cmdOptions: {
  out: string;
  ignoreFile: string;
  maxDepth: number;
  content: boolean;
  previewLines: number;
  symbols: boolean;
  imports: boolean;
  maxSymbols: number;
  debounce: number;
  verbose: boolean;
}): Promise<void> {
  const baseOptions = resolveCtxGenOptions(cmdOptions);
  const options: WatchOptions = { ...baseOptions, debounceMs: cmdOptions.debounce };

  const ig = loadIgnoreRules(options.rootDir, options.ignoreFile);
  startWatch(options, ig);
  // startWatch keeps the process alive via active fs.watch() handles and
  // a SIGINT/SIGTERM handler - intentionally does not resolve/return.
}

function log(options: CtxGenOptions, message: string): void {
  if (options.verbose) console.log(message);
}
