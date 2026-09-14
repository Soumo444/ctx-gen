/**
 * parsers/codeSymbols.ts
 * ------------------------------------------------------------------
 * Lightweight, regex-based extraction of "the interesting parts" of
 * a source file: top-level function/class declarations, and HTTP
 * route definitions (Express/FastAPI/Flask style).
 *
 * Deliberately NOT a full AST parser (no @babel/parser, no ts-morph,
 * no tree-sitter). Those add tens of MB of dependencies and real
 * parse time on large repos. A disciplined line-by-line regex pass
 * gets ~90% of the value - "what can I call, and what does it look
 * like" - in near-zero time and with zero extra install weight,
 * which matters for a tool meant to run instantly via `npx`.
 *
 * Trade-off developers should know: this reads top-level and
 * decorator-adjacent declarations. Deeply nested inner functions and
 * multi-line signatures spanning many lines are not captured. That's
 * an intentional scope cut, not a bug - see README for details.
 * ------------------------------------------------------------------
 */
import fs from "fs";
import { FileNode, CodeSymbol, FileSymbols } from "../types";
import { flattenFiles } from "../utils/treeUtils";

const TS_JS_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx"]);
const PY_EXTENSION = ".py";

const MAX_SIGNATURE_LENGTH = 100;

// ---- TypeScript / JavaScript patterns ------------------------------------

const TS_FUNCTION_RE =
  /^\s*export\s+(?:default\s+)?(?:async\s+)?function\s*\*?\s+([A-Za-z0-9_$]+)\s*\(([^)]*)\)|^\s*(?:async\s+)?function\s*\*?\s+([A-Za-z0-9_$]+)\s*\(([^)]*)\)/;

const TS_ARROW_CONST_RE =
  /^\s*export\s+(?:default\s+)?const\s+([A-Za-z0-9_$]+)\s*(?::\s*[^=]+?)?=\s*(?:async\s*)?\(([^)]*)\)\s*(?::\s*[^=]+?)?=>|^\s*const\s+([A-Za-z0-9_$]+)\s*(?::\s*[^=]+?)?=\s*(?:async\s*)?\(([^)]*)\)\s*(?::\s*[^=]+?)?=>/;

const TS_CLASS_RE =
  /^\s*export\s+(?:default\s+)?(?:abstract\s+)?class\s+([A-Za-z0-9_$]+)(?:\s+extends\s+([A-Za-z0-9_$.<>]+))?|^\s*(?:abstract\s+)?class\s+([A-Za-z0-9_$]+)(?:\s+extends\s+([A-Za-z0-9_$.<>]+))?/;

// app.get("/path", ...) / router.post('/path', ...) - Express-style
const JS_ROUTE_RE =
  /^\s*(?:export\s+)?(?:const\s+\w+\s*=\s*)?(\w+)\.(get|post|put|delete|patch|all)\s*\(\s*["'`]([^"'`]+)["'`]/i;

// ---- Python patterns ------------------------------------------------------

const PY_DEF_RE = /^\s*(async\s+)?def\s+([A-Za-z0-9_]+)\s*\(([^)]*)\)/;
const PY_CLASS_RE = /^\s*class\s+([A-Za-z0-9_]+)\s*(?:\(([^)]*)\))?\s*:/;
// @app.get("/path") / @router.post('/path') / @app.route("/path", methods=[...])
const PY_ROUTE_DECORATOR_RE = /^\s*@(\w+)\.(get|post|put|delete|patch|route)\s*\(\s*["']([^"']+)["']/i;

/**
 * Extract symbols from every eligible source file in the tree.
 * `maxPerFile` caps how many symbols get kept per file (large
 * generated files or vendored code shouldn't flood the output).
 */
export function extractSymbols(tree: FileNode, maxPerFile: number): FileSymbols[] {
  const files = flattenFiles(tree);
  const results: FileSymbols[] = [];

  for (const file of files) {
    const ext = extname(file.name);
    if (!TS_JS_EXTENSIONS.has(ext) && ext !== PY_EXTENSION) continue;

    const symbols =
      ext === PY_EXTENSION ? extractPythonSymbols(file.absPath) : extractTsJsSymbols(file.absPath);

    if (symbols.length === 0) continue;

    const truncated = symbols.length > maxPerFile;
    results.push({
      relPath: file.relPath,
      symbols: symbols.slice(0, maxPerFile),
      truncated,
    });
  }

  return results;
}

function extractTsJsSymbols(absPath: string): CodeSymbol[] {
  const lines = readLines(absPath);
  const symbols: CodeSymbol[] = [];

  lines.forEach((line, idx) => {
    const lineNo = idx + 1;

    const fnMatch = line.match(TS_FUNCTION_RE);
    if (fnMatch) {
      const name = fnMatch[1] ?? fnMatch[3] ?? "";
      const params = fnMatch[2] ?? fnMatch[4] ?? "";
      symbols.push({
        kind: "function",
        name,
        signature: truncateSignature(`function ${name}(${params.trim()})`),
        line: lineNo,
      });
      return;
    }

    const arrowMatch = line.match(TS_ARROW_CONST_RE);
    if (arrowMatch) {
      const name = arrowMatch[1] ?? arrowMatch[3] ?? "";
      const params = arrowMatch[2] ?? arrowMatch[4] ?? "";
      symbols.push({
        kind: "function",
        name,
        signature: truncateSignature(`const ${name} = (${params.trim()}) => ...`),
        line: lineNo,
      });
      return;
    }

    const classMatch = line.match(TS_CLASS_RE);
    if (classMatch) {
      const name = classMatch[1] ?? classMatch[3] ?? "";
      const extendsName = classMatch[2] ?? classMatch[4];
      symbols.push({
        kind: "class",
        name,
        signature: truncateSignature(`class ${name}${extendsName ? ` extends ${extendsName}` : ""}`),
        line: lineNo,
      });
      return;
    }

    const routeMatch = line.match(JS_ROUTE_RE);
    if (routeMatch) {
      const [, , method, routePath] = routeMatch;
      symbols.push({
        kind: "route",
        name: `${method.toUpperCase()} ${routePath}`,
        signature: `${method.toUpperCase()} ${routePath}`,
        line: lineNo,
      });
    }
  });

  return symbols;
}

function extractPythonSymbols(absPath: string): CodeSymbol[] {
  const lines = readLines(absPath);
  const symbols: CodeSymbol[] = [];
  let pendingRoute: { method: string; routePath: string; line: number } | null = null;

  lines.forEach((line, idx) => {
    const lineNo = idx + 1;
    const trimmed = line.trim();

    // A decorator line: stash it, keep scanning for the `def` it decorates.
    const routeDecoratorMatch = line.match(PY_ROUTE_DECORATOR_RE);
    if (routeDecoratorMatch) {
      const [, , method, routePath] = routeDecoratorMatch;
      pendingRoute = { method: method.toUpperCase(), routePath, line: lineNo };
      return;
    }
    // Any other decorator line: keep pendingRoute alive (decorators can stack)
    if (trimmed.startsWith("@")) return;

    const defMatch = line.match(PY_DEF_RE);
    if (defMatch) {
      const isAsync = !!defMatch[1];
      const name = defMatch[2];
      const params = defMatch[3];

      if (pendingRoute) {
        symbols.push({
          kind: "route",
          name: `${pendingRoute.method} ${pendingRoute.routePath}`,
          signature: `${pendingRoute.method} ${pendingRoute.routePath} -> ${name}()`,
          line: pendingRoute.line,
        });
        pendingRoute = null;
      } else {
        symbols.push({
          kind: "function",
          name,
          signature: truncateSignature(`${isAsync ? "async " : ""}def ${name}(${params.trim()})`),
          line: lineNo,
        });
      }
      return;
    }

    const classMatch = line.match(PY_CLASS_RE);
    if (classMatch) {
      const name = classMatch[1];
      const bases = classMatch[2];
      symbols.push({
        kind: "class",
        name,
        signature: truncateSignature(`class ${name}${bases ? `(${bases})` : ""}`),
        line: lineNo,
      });
      pendingRoute = null;
    }
  });

  return symbols;
}

function truncateSignature(sig: string): string {
  const collapsed = sig.replace(/\s+/g, " ").trim();
  return collapsed.length > MAX_SIGNATURE_LENGTH
    ? collapsed.slice(0, MAX_SIGNATURE_LENGTH - 3) + "..."
    : collapsed;
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
