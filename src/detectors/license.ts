/**
 * detectors/license.ts
 * ------------------------------------------------------------------
 * Best-effort license detection: prefer an explicit package.json
 * "license" field, otherwise look for a LICENSE file and match its
 * opening text against a few common license names. Keeps this out
 * of docsGenerator.ts so that file stays focused on rendering.
 * ------------------------------------------------------------------
 */
import fs from "fs";
import { FileNode, PackageSummary } from "../types";
import { flattenFiles } from "../utils/treeUtils";

const LICENSE_FILENAMES = new Set(["license", "license.md", "license.txt"]);

const LICENSE_KEYWORDS: { pattern: RegExp; label: string }[] = [
  { pattern: /MIT License/i, label: "MIT" },
  { pattern: /Apache License/i, label: "Apache-2.0" },
  { pattern: /GNU GENERAL PUBLIC LICENSE.*Version 3/is, label: "GPL-3.0" },
  { pattern: /GNU GENERAL PUBLIC LICENSE.*Version 2/is, label: "GPL-2.0" },
  { pattern: /BSD 3-Clause/i, label: "BSD-3-Clause" },
  { pattern: /BSD 2-Clause/i, label: "BSD-2-Clause" },
  { pattern: /Mozilla Public License/i, label: "MPL-2.0" },
  { pattern: /ISC License/i, label: "ISC" },
];

export function detectLicense(tree: FileNode, pkg: PackageSummary | undefined): string | undefined {
  if (pkg?.license) return pkg.license;

  const licenseFile = flattenFiles(tree).find((f) => LICENSE_FILENAMES.has(f.name.toLowerCase()));
  if (!licenseFile) return undefined;

  try {
    const contents = fs.readFileSync(licenseFile.absPath, "utf-8");
    const match = LICENSE_KEYWORDS.find((k) => k.pattern.test(contents));
    return match?.label ?? "See LICENSE file";
  } catch {
    return "See LICENSE file";
  }
}
