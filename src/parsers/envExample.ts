/**
 * parsers/envExample.ts
 * ------------------------------------------------------------------
 * Extracts environment variable KEYS (never values) from common
 * "example env" filenames. This tells an AI assistant what config
 * the app expects without ever leaking real secrets - even if a
 * developer accidentally has a live .env sitting next to it (which
 * is excluded by DEFAULT_IGNORES anyway).
 * ------------------------------------------------------------------
 */
import fs from "fs";
import path from "path";
import { EnvVarEntry } from "../types";

const CANDIDATE_FILENAMES = [
  ".env.example",
  ".env.sample",
  ".env.template",
  "env.example",
];

export function parseEnvExample(rootDir: string): EnvVarEntry[] {
  for (const filename of CANDIDATE_FILENAMES) {
    const filePath = path.join(rootDir, filename);
    if (fs.existsSync(filePath)) {
      return extractKeys(fs.readFileSync(filePath, "utf-8"));
    }
  }
  return [];
}

function extractKeys(contents: string): EnvVarEntry[] {
  const entries: EnvVarEntry[] = [];
  let pendingComment: string | undefined;

  for (const rawLine of contents.split("\n")) {
    const line = rawLine.trim();
    if (!line) {
      pendingComment = undefined;
      continue;
    }
    if (line.startsWith("#")) {
      pendingComment = line.replace(/^#+\s*/, "");
      continue;
    }
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    if (match) {
      entries.push({ key: match[1], comment: pendingComment });
      pendingComment = undefined;
    }
  }
  return entries;
}
