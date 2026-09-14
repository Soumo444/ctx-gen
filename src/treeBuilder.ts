/**
 * treeBuilder.ts
 * ------------------------------------------------------------------
 * Renders a FileNode tree as a clean, box-drawing ASCII tree, the
 * same visual style developers already recognize from `tree` CLI
 * output - but deliberately compact for token efficiency.
 * ------------------------------------------------------------------
 */
import { FileNode } from "./types";

const BRANCH = "├── ";
const LAST_BRANCH = "└── ";
const VERTICAL = "│   ";
const SPACE = "    ";

/**
 * Render the tree starting at `node`. The root name is printed once,
 * then children are rendered recursively with proper connector glyphs.
 */
export function renderTree(node: FileNode): string {
  const lines: string[] = [];
  const rootLabel = node.type === "directory" ? `${node.name}/` : node.name;
  lines.push(rootLabel);
  renderChildren(node.children ?? [], "", lines);
  return lines.join("\n");
}

function renderChildren(children: FileNode[], prefix: string, lines: string[]): void {
  children.forEach((child, index) => {
    const isLast = index === children.length - 1;
    const connector = isLast ? LAST_BRANCH : BRANCH;
    const label = child.type === "directory" ? `${child.name}/` : child.name;
    lines.push(`${prefix}${connector}${label}`);

    if (child.type === "directory" && child.children && child.children.length > 0) {
      const childPrefix = prefix + (isLast ? SPACE : VERTICAL);
      renderChildren(child.children, childPrefix, lines);
    }
  });
}
