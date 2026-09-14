/**
 * parsers/packageJson.ts
 * ------------------------------------------------------------------
 * Reads package.json (if present at the project root) and extracts
 * just the fields useful for AI context: identity, scripts, and
 * dependency names/versions. We deliberately DON'T dump the whole
 * file verbatim - that wastes tokens on fields (like nested configs)
 * an AI assistant rarely needs.
 * ------------------------------------------------------------------
 */
import fs from "fs";
import path from "path";
import { PackageSummary } from "../types";

export function parsePackageJson(rootDir: string): PackageSummary | undefined {
  const pkgPath = path.join(rootDir, "package.json");
  if (!fs.existsSync(pkgPath)) return undefined;

  try {
    const raw = fs.readFileSync(pkgPath, "utf-8");
    const json = JSON.parse(raw);

    return {
      name: json.name,
      version: json.version,
      description: json.description,
      main: json.main,
      type: json.type,
      license: json.license,
      scripts: json.scripts,
      dependencies: json.dependencies,
      devDependencies: json.devDependencies,
    };
  } catch {
    // Malformed JSON shouldn't crash the whole scan
    return undefined;
  }
}
