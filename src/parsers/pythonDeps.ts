/**
 * parsers/pythonDeps.ts
 * ------------------------------------------------------------------
 * Extracts Python dependency names (and loose version specifiers)
 * from whichever manifest the project actually has, checked in this
 * priority order: pyproject.toml -> requirements.txt -> Pipfile.
 *
 * Regex-based on purpose: a full TOML parser is overkill just to
 * pull out a dependency list, and it would be another dependency to
 * carry in a tool whose whole pitch is "installs and runs instantly".
 * ------------------------------------------------------------------
 */
import fs from "fs";
import path from "path";
import { PythonDepsSummary, PythonDependency } from "../types";

export function parsePythonDeps(rootDir: string): PythonDepsSummary | undefined {
  const pyprojectPath = path.join(rootDir, "pyproject.toml");
  if (fs.existsSync(pyprojectPath)) {
    const deps = parsePyprojectToml(fs.readFileSync(pyprojectPath, "utf-8"));
    if (deps.length > 0) return { sourceFile: "pyproject.toml", dependencies: deps };
  }

  const requirementsPath = path.join(rootDir, "requirements.txt");
  if (fs.existsSync(requirementsPath)) {
    const deps = parseRequirementsTxt(fs.readFileSync(requirementsPath, "utf-8"));
    if (deps.length > 0) return { sourceFile: "requirements.txt", dependencies: deps };
  }

  const pipfilePath = path.join(rootDir, "Pipfile");
  if (fs.existsSync(pipfilePath)) {
    const deps = parsePipfile(fs.readFileSync(pipfilePath, "utf-8"));
    if (deps.length > 0) return { sourceFile: "Pipfile", dependencies: deps };
  }

  return undefined;
}

/** Best-effort project description from pyproject.toml (Poetry or PEP 621 style). */
export function parsePyprojectDescription(rootDir: string): string | undefined {
  const pyprojectPath = path.join(rootDir, "pyproject.toml");
  if (!fs.existsSync(pyprojectPath)) return undefined;
  const contents = fs.readFileSync(pyprojectPath, "utf-8");
  const match = contents.match(/^\s*description\s*=\s*"([^"]*)"/m);
  return match?.[1] || undefined;
}

function parseRequirementsTxt(contents: string): PythonDependency[] {
  const deps: PythonDependency[] = [];
  for (const rawLine of contents.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || line.startsWith("-")) continue;
    const match = line.match(/^([A-Za-z0-9_.-]+)\s*([=<>!~]=?[\d.\w,*]*)?/);
    if (match) deps.push({ name: match[1], version: match[2]?.trim() || undefined });
  }
  return deps;
}

function parsePipfile(contents: string): PythonDependency[] {
  const deps: PythonDependency[] = [];
  const packagesSection = contents.match(/\[packages\]([\s\S]*?)(\n\[|$)/);
  if (!packagesSection) return deps;

  for (const rawLine of packagesSection[1].split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    const match = line.match(/^([A-Za-z0-9_.-]+)\s*=\s*"?\{?[^"{]*"?([^"}]*)"?\}?/);
    if (match) {
      const version = match[2]?.trim();
      deps.push({ name: match[1], version: version && version !== "*" ? version : undefined });
    }
  }
  return deps;
}

function parsePyprojectToml(contents: string): PythonDependency[] {
  const deps: PythonDependency[] = [];

  // Poetry-style: [tool.poetry.dependencies]
  const poetrySection = contents.match(/\[tool\.poetry\.dependencies\]([\s\S]*?)(\n\[|$)/);
  if (poetrySection) {
    for (const rawLine of poetrySection[1].split("\n")) {
      const line = rawLine.trim();
      if (!line) continue;
      const match = line.match(/^([A-Za-z0-9_.-]+)\s*=\s*"?\^?~?([^",\n}]*)"?/);
      if (match && match[1].toLowerCase() !== "python") {
        deps.push({ name: match[1], version: match[2]?.trim() || undefined });
      }
    }
  }

  // PEP 621-style: dependencies = ["fastapi>=0.1", "uvicorn"]
  const pep621Match = contents.match(/(?<!optional-)dependencies\s*=\s*\[([\s\S]*?)\]/);
  if (pep621Match) {
    const items = pep621Match[1].match(/"([^"]+)"/g) ?? [];
    for (const item of items) {
      const clean = item.replace(/"/g, "");
      const m = clean.match(/^([A-Za-z0-9_.-]+)\s*([=<>!~]=?[\d.\w,*]*)?/);
      if (m) deps.push({ name: m[1], version: m[2]?.trim() || undefined });
    }
  }

  return deps;
}
