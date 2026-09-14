/**
 * parsers/schema.ts
 * ------------------------------------------------------------------
 * Detects and lightly parses database schema files so the AI knows
 * what tables/models exist without needing the entire schema dumped
 * (which can be huge in mature projects). Supports:
 *   - Prisma:      prisma/schema.prisma  -> `model Foo { ... }`
 *   - Raw SQL:     any *.sql file        -> `CREATE TABLE foo (...)`
 *
 * This is intentionally regex-based (not a full parser) to keep the
 * tool dependency-free and fast. It's good enough for a structural
 * summary, which is all an AI context file needs.
 * ------------------------------------------------------------------
 */
import fs from "fs";
import { FileNode, SchemaSummary } from "../types";

const PRISMA_MODEL_RE = /^\s*model\s+(\w+)\s*\{/gm;
const SQL_TABLE_RE = /create\s+table\s+(?:if\s+not\s+exists\s+)?["'`]?(\w+)["'`]?/gi;

/**
 * Walk the already-scanned tree (so we respect ignore rules for free)
 * looking for schema files, and extract model/table names from each.
 */
export function parseSchemas(tree: FileNode): SchemaSummary[] {
  const summaries: SchemaSummary[] = [];
  collect(tree, summaries);
  return summaries;
}

function collect(node: FileNode, out: SchemaSummary[]): void {
  if (node.type === "file") {
    const lower = node.name.toLowerCase();

    if (lower === "schema.prisma") {
      const models = extractMatches(node.absPath, PRISMA_MODEL_RE);
      if (models.length > 0) {
        out.push({ sourceFile: node.relPath, kind: "prisma", models });
      }
    } else if (lower.endsWith(".sql")) {
      const models = extractMatches(node.absPath, SQL_TABLE_RE);
      if (models.length > 0) {
        out.push({ sourceFile: node.relPath, kind: "sql", models });
      }
    }
    return;
  }

  for (const child of node.children ?? []) {
    collect(child, out);
  }
}

function extractMatches(filePath: string, regex: RegExp): string[] {
  try {
    const contents = fs.readFileSync(filePath, "utf-8");
    const matches: string[] = [];
    let m: RegExpExecArray | null;
    // Reset lastIndex since the regex objects are module-level and reused
    regex.lastIndex = 0;
    while ((m = regex.exec(contents)) !== null) {
      matches.push(m[1]);
    }
    return matches;
  } catch {
    return [];
  }
}

// Re-exported for testability / potential reuse
export { PRISMA_MODEL_RE, SQL_TABLE_RE };
