/**
 * docsGenerator.ts
 * ------------------------------------------------------------------
 * Renders a DocsContext into a clean, professional README.md.
 * Structurally similar to generator.ts (the project-context.md
 * renderer for AI assistants) but aimed at a human landing on the
 * repo for the first time - so it reads like documentation, not a
 * structured data dump.
 * ------------------------------------------------------------------
 */
import { DocsContext } from "./types";
import { renderTree } from "./treeBuilder";

export function generateReadme(ctx: DocsContext): string {
  const sections: string[] = [
    renderTitleSection(ctx),
    renderTechStackSection(ctx),
    renderStructureSection(ctx),
    renderQuickStartSection(ctx),
  ];

  if (ctx.envVars.length > 0) sections.push(renderEnvSection(ctx));
  if (ctx.schemas.length > 0) sections.push(renderSchemaSection(ctx));
  sections.push(renderLicenseSection(ctx));
  sections.push(renderFooter());

  return sections.join("\n\n") + "\n";
}

function renderTitleSection(ctx: DocsContext): string {
  const title = titleCase(ctx.pkg?.name ?? ctx.rootName);
  const description = ctx.description ?? ctx.pkg?.description ?? `A ${ctx.techStack.primaryType} project.`;
  return [`# ${title}`, "", description].join("\n");
}

function renderTechStackSection(ctx: DocsContext): string {
  const lines = ["## 🛠️ Tech Stack", ""];

  for (const lang of ctx.techStack.languages) lines.push(`- **Language:** ${lang}`);
  for (const fw of ctx.techStack.frameworks) lines.push(`- **Framework:** ${fw}`);

  const nodeDepCount = Object.keys(ctx.pkg?.dependencies ?? {}).length;
  if (nodeDepCount > 0) lines.push(`- **Node dependencies:** ${nodeDepCount}`);
  if (ctx.pythonDeps) {
    lines.push(`- **Python dependencies:** ${ctx.pythonDeps.dependencies.length} (from \`${ctx.pythonDeps.sourceFile}\`)`);
  }

  return lines.join("\n");
}

function renderStructureSection(ctx: DocsContext): string {
  return ["## 📁 Project Structure", "", "```", renderTree(ctx.tree), "```"].join("\n");
}

function renderQuickStartSection(ctx: DocsContext): string {
  const lines = ["## 🚀 Quick Start", ""];

  ctx.quickStart.forEach((step) => {
    lines.push(`**${step.label}**`);
    lines.push("```bash");
    lines.push(step.command);
    lines.push("```");
    lines.push("");
  });

  return lines.join("\n").trimEnd();
}

function renderEnvSection(ctx: DocsContext): string {
  const lines = [
    "## 🔑 Environment Variables",
    "",
    "Copy `.env.example` to `.env` and fill in the values:",
    "",
    "| Variable | Purpose |",
    "|---|---|",
  ];
  for (const entry of ctx.envVars) lines.push(`| \`${entry.key}\` | ${entry.comment ?? "—"} |`);
  return lines.join("\n");
}

function renderSchemaSection(ctx: DocsContext): string {
  const lines = ["## 🗄️ Database Schema", ""];
  for (const schema of ctx.schemas) {
    lines.push(`- **${schema.sourceFile}:** ${schema.models.map((m) => `\`${m}\``).join(", ")}`);
  }
  return lines.join("\n");
}

function renderLicenseSection(ctx: DocsContext): string {
  return ["## 📄 License", "", ctx.license ?? "Not specified — consider adding a LICENSE file."].join("\n");
}

function renderFooter(): string {
  return [
    "---",
    "*README scaffolded by [ctx-gen](https://github.com/yourname/ctx-gen) `docs` — review, edit, and make it your own before publishing.*",
  ].join("\n");
}

function titleCase(name: string): string {
  return name.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
