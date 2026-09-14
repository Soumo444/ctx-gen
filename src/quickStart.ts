/**
 * quickStart.ts
 * ------------------------------------------------------------------
 * Builds ordered "how do I actually run this" steps from what was
 * detected. Rules of precedence:
 *   - package.json `scripts` always win for the run command, since
 *     that's the project author's own stated way to run it.
 *   - Framework convention (manage.py runserver / flask run / uvicorn)
 *     is the fallback for Python projects with no scripts concept.
 * ------------------------------------------------------------------
 */
import { PackageSummary, PythonDepsSummary, TechStackDetection, QuickStartStep, KeyFilePreview } from "./types";

export function buildQuickStart(
  stack: TechStackDetection,
  pkg: PackageSummary | undefined,
  pythonDeps: PythonDepsSummary | undefined,
  keyFiles: KeyFilePreview[]
): QuickStartStep[] {
  const steps: QuickStartStep[] = [];

  if (pkg) {
    steps.push({ label: "Install Node dependencies", command: "npm install" });

    if (pkg.scripts?.dev) {
      steps.push({ label: "Run in development mode", command: "npm run dev" });
    } else if (pkg.scripts?.start) {
      steps.push({ label: "Start the app", command: "npm start" });
    } else if (pkg.main) {
      steps.push({ label: "Run the entry point", command: `node ${pkg.main}` });
    }

    if (pkg.scripts?.build) {
      steps.push({ label: "Build for production", command: "npm run build" });
    }
    if (pkg.scripts?.test) {
      steps.push({ label: "Run tests", command: "npm test" });
    }
  }

  if (pythonDeps) {
    steps.push({
      label: "Create and activate a virtual environment",
      command: "python -m venv venv\nsource venv/bin/activate  # Windows: venv\\Scripts\\activate",
    });

    if (pythonDeps.sourceFile === "requirements.txt") {
      steps.push({ label: "Install Python dependencies", command: "pip install -r requirements.txt" });
    } else if (pythonDeps.sourceFile === "pyproject.toml") {
      steps.push({ label: "Install Python dependencies", command: "poetry install" });
    } else if (pythonDeps.sourceFile === "Pipfile") {
      steps.push({ label: "Install Python dependencies", command: "pipenv install" });
    }
  }

  // Framework-specific run command. Uses whichever entry-point file was
  // actually found rather than assuming "app.py" / "main.py" blindly.
  if (stack.frameworks.includes("Django")) {
    steps.push({ label: "Apply database migrations", command: "python manage.py migrate" });
    steps.push({ label: "Run the development server", command: "python manage.py runserver" });
  } else if (stack.frameworks.includes("Flask")) {
    const entry = findPyEntry(keyFiles, /app\.py$|wsgi\.py$|main\.py$/);
    const moduleArg = entry ? entry.replace(/\.py$/, "") : "app";
    steps.push({ label: "Run the development server", command: `flask --app ${moduleArg} run --debug` });
  } else if (stack.frameworks.includes("FastAPI")) {
    const entry = findPyEntry(keyFiles, /main\.py$|app\.py$/);
    const modulePath = (entry ?? "main.py").replace(/\.py$/, "").replace(/\//g, ".");
    steps.push({ label: "Run the development server", command: `uvicorn ${modulePath}:app --reload` });
  } else if (pythonDeps) {
    const entry = findPyEntry(keyFiles, /\.py$/);
    if (entry) steps.push({ label: "Run the app", command: `python ${entry}` });
  }

  if (steps.length === 0) {
    steps.push({
      label: "Get started",
      command: "# No package manifest detected — review the project structure below to find the entry point",
    });
  }

  return steps;
}

function findPyEntry(keyFiles: KeyFilePreview[], pattern: RegExp): string | undefined {
  return keyFiles.find((f) => pattern.test(f.relPath))?.relPath;
}
