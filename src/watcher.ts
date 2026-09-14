/**
 * watcher.ts
 * ------------------------------------------------------------------
 * Implements `ctx-gen watch`: keeps project-context.md continuously
 * up to date as files change, using Node's built-in fs.watch - no
 * chokidar, no native file-watching dependency, keeping install size
 * and startup time exactly what they were before this feature.
 *
 * fs.watch's `recursive: true` option only works reliably on macOS
 * and Windows, not Linux. Instead of depending on it, we watch every
 * directory individually and re-sync the watch list after every
 * regeneration. That has a nice side effect: newly created folders
 * are picked up automatically on the next debounced run, and deleted
 * folders get their watchers cleanly closed - no separate "handle a
 * new directory" code path needed.
 * ------------------------------------------------------------------
 */
import fs from "fs";
import path from "path";
import chalk from "chalk";
import { Ignore } from "ignore";

import { WatchOptions, FileNode } from "./types";
import { scanDirectory } from "./scanner";
import { buildProjectContext } from "./contextBuilder";
import { generateMarkdown } from "./generator";

/**
 * Safety net against runaway feedback loops. The most likely cause in
 * practice: something is writing to a file inside the watched project
 * on every regeneration (this process's own logs redirected into the
 * project folder, a linter/formatter writing a report file, an editor
 * autosave loop, etc). The per-outFile self-write guard in syncWatchers
 * handles the specific "writing project-context.md re-triggers itself"
 * case, but this catches the general pattern regardless of cause.
 */
const RAPID_REGEN_WINDOW_MS = 3000;
const RAPID_REGEN_LIMIT = 10;

export function startWatch(options: WatchOptions, ig: Ignore): void {
  const watchers = new Map<string, fs.FSWatcher>();
  let debounceTimer: NodeJS.Timeout | null = null;
  let regenerating = false;
  let rerunQueued = false;
  const regenTimestamps: number[] = [];

  const regenerate = (): void => {
    if (regenerating) {
      // A change came in while we were already writing - don't run two
      // scans concurrently, just remember to go again right after.
      rerunQueued = true;
      return;
    }
    regenerating = true;

    const now = Date.now();
    regenTimestamps.push(now);
    while (regenTimestamps.length > 0 && now - regenTimestamps[0] > RAPID_REGEN_WINDOW_MS) {
      regenTimestamps.shift();
    }
    if (regenTimestamps.length > RAPID_REGEN_LIMIT) {
      console.error(
        chalk.red(
          `\n✖ Detected ${regenTimestamps.length} regenerations in the last ${RAPID_REGEN_WINDOW_MS / 1000}s — stopping to avoid a runaway loop.`
        )
      );
      console.error(
        chalk.yellow(
          "  This usually means something is being written inside the watched folder on every regeneration\n" +
            "  (a log file this process's own output was redirected into, a linter report, an autosave loop, ...).\n" +
            `  Find that file, redirect it outside ${options.rootDir}, or add it to .ctxignore, then run 'ctx-gen watch' again.`
        )
      );
      regenerating = false;
      for (const watcher of watchers.values()) watcher.close();
      process.exit(1);
    }

    try {
      const { tree, stats } = scanDirectory(options.rootDir, ig, options.maxDepth);
      const context = buildProjectContext(options, tree, stats);
      const markdown = generateMarkdown(context);
      fs.writeFileSync(options.outFile, markdown, "utf-8");

      const tokenNote = context.tokenStats ? `~${context.tokenStats.approxTokens.toLocaleString()} tokens` : "";
      console.log(
        chalk.green(`✔ [${timestamp()}] Regenerated ${path.relative(options.rootDir, options.outFile)}`) +
          chalk.gray(`  (${stats.fileCount} files, ${tokenNote})`)
      );

      syncWatchers(tree, options, ig, watchers, scheduleRegenerate);
    } catch (err) {
      console.error(chalk.red(`✖ [${timestamp()}] Regeneration failed:`), err instanceof Error ? err.message : err);
    } finally {
      regenerating = false;
      if (rerunQueued) {
        rerunQueued = false;
        scheduleRegenerate();
      }
    }
  };

  function scheduleRegenerate(): void {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(regenerate, options.debounceMs);
  }

  // Initial full scan, write, and watcher setup - then every subsequent
  // change goes through the debounced path above.
  regenerate();

  console.log(chalk.cyan(`\n👀 Watching ${options.rootDir} for changes... (Ctrl+C to stop)\n`));

  const shutdown = (): void => {
    console.log(chalk.dim("\nStopping watch mode..."));
    for (const watcher of watchers.values()) watcher.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

/** Reconcile the set of active fs.watch() handles against the latest scanned tree. */
function syncWatchers(
  tree: FileNode,
  options: WatchOptions,
  ig: Ignore,
  watchers: Map<string, fs.FSWatcher>,
  onChange: () => void
): void {
  const currentDirs = new Set<string>([options.rootDir]);
  collectDirs(tree, currentDirs);

  for (const dir of currentDirs) {
    if (watchers.has(dir)) continue;
    try {
      const watcher = fs.watch(dir, { persistent: true }, (_eventType, filename) => {
        if (filename) {
          const absChangedPath = path.join(dir, filename);

          // Our own output file is the most common self-trigger source
          // (writing project-context.md would otherwise re-trigger the
          // watcher that writes it). Checked directly since it's exact.
          if (absChangedPath === options.outFile) return;

          // More generally: anything matched by the ignore rules (the
          // user's .ctxignore, or defaults like *.log) shouldn't cause a
          // regeneration either - it won't appear in the output, so a
          // change to it isn't a "project change" as far as ctx-gen cares.
          const relChangedPath = path.relative(options.rootDir, absChangedPath).split(path.sep).join("/");
          if (relChangedPath && ig.ignores(relChangedPath)) return;
        }
        onChange();
      });
      watcher.on("error", () => {
        // A watched directory can vanish mid-flight (e.g. rapid rename);
        // just drop it, the next regenerate() call will resync the set.
        watcher.close();
        watchers.delete(dir);
      });
      watchers.set(dir, watcher);
      if (options.verbose) console.log(chalk.dim(`  + watching ${path.relative(options.rootDir, dir) || "."}`));
    } catch {
      // Directory may have disappeared between scan and watch setup - skip it.
    }
  }

  for (const [dir, watcher] of watchers.entries()) {
    if (currentDirs.has(dir)) continue;
    watcher.close();
    watchers.delete(dir);
    if (options.verbose) {
      console.log(chalk.dim(`  - stopped watching ${path.relative(options.rootDir, dir) || "."}`));
    }
  }
}

function collectDirs(node: FileNode, out: Set<string>): void {
  if (node.type !== "directory") return;
  out.add(node.absPath);
  for (const child of node.children ?? []) collectDirs(child, out);
}

function timestamp(): string {
  return new Date().toLocaleTimeString();
}
