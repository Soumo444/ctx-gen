/**
 * detectors/projectType.ts
 * ------------------------------------------------------------------
 * Lightweight, signal-based tech-stack detection. No ML, no network
 * lookups - just checking for well-known files and dependency names,
 * the same way a human skimming a repo would. Every conclusion is
 * paired with the evidence that triggered it (`signals`), so the
 * generated README's stack section is explainable, not a black box.
 * ------------------------------------------------------------------
 */
import { FileNode, PackageSummary, PythonDepsSummary, TechStackDetection } from "../types";
import { flattenFiles } from "../utils/treeUtils";

const NODE_FRAMEWORK_SIGNALS: { dep: string; label: string }[] = [
  { dep: "next", label: "Next.js" },
  { dep: "nuxt", label: "Nuxt" },
  { dep: "@nestjs/core", label: "NestJS" },
  { dep: "react", label: "React" },
  { dep: "vue", label: "Vue" },
  { dep: "svelte", label: "Svelte" },
  { dep: "@angular/core", label: "Angular" },
  { dep: "express", label: "Express" },
  { dep: "fastify", label: "Fastify" },
];

const PYTHON_FRAMEWORK_SIGNALS: { dep: string; label: string }[] = [
  { dep: "django", label: "Django" },
  { dep: "flask", label: "Flask" },
  { dep: "fastapi", label: "FastAPI" },
];

export function detectTechStack(
  tree: FileNode,
  pkg: PackageSummary | undefined,
  pythonDeps: PythonDepsSummary | undefined
): TechStackDetection {
  const languages: string[] = [];
  const frameworks: string[] = [];
  const signals: string[] = [];

  const files = flattenFiles(tree);
  const fileNames = new Set(files.map((f) => f.name.toLowerCase()));
  const relPaths = new Set(files.map((f) => f.relPath));

  // ---- Node / TypeScript ----
  if (pkg) {
    const isTypeScript = relPaths.has("tsconfig.json") || files.some((f) => /\.tsx?$/.test(f.name));
    languages.push(isTypeScript ? "Node.js (TypeScript)" : "Node.js (JavaScript)");
    signals.push(`Found package.json${isTypeScript ? " + tsconfig.json" : ""}`);

    const allDeps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
    for (const { dep, label } of NODE_FRAMEWORK_SIGNALS) {
      if (dep in allDeps) {
        frameworks.push(label);
        signals.push(`"${dep}" found in package.json dependencies`);
      }
    }
  }

  // ---- Python ----
  const hasPythonSignal = !!pythonDeps || fileNames.has("manage.py") || files.some((f) => f.name.endsWith(".py"));
  if (hasPythonSignal) {
    languages.push("Python");

    if (pythonDeps) {
      signals.push(`Found ${pythonDeps.sourceFile}`);
      const depNames = new Set(pythonDeps.dependencies.map((d) => d.name.toLowerCase()));
      for (const { dep, label } of PYTHON_FRAMEWORK_SIGNALS) {
        if (depNames.has(dep) && !frameworks.includes(label)) {
          frameworks.push(label);
          signals.push(`"${dep}" listed in ${pythonDeps.sourceFile}`);
        }
      }
    }

    // File-based hints catch frameworks even when there's no dependency
    // manifest checked in (common in quick prototypes / course repos).
    if (fileNames.has("manage.py") && !frameworks.includes("Django")) {
      frameworks.push("Django");
      signals.push("Found manage.py (Django convention)");
    }
  }

  if (languages.length === 0) {
    languages.push("Unknown");
    signals.push("No package.json, requirements.txt, pyproject.toml, or Pipfile found");
  }

  return {
    languages,
    frameworks,
    primaryType: buildPrimaryLabel(languages, frameworks),
    signals,
  };
}

function buildPrimaryLabel(languages: string[], frameworks: string[]): string {
  if (frameworks.length > 0) return frameworks.join(" + ");
  if (languages.length > 0 && languages[0] !== "Unknown") return languages.join(" + ");
  return "Software Project";
}
