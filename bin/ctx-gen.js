#!/usr/bin/env node
/**
 * bin/ctx-gen.js
 * ------------------------------------------------------------------
 * npm's "bin" entry. Kept as a tiny plain-JS shim so it works
 * immediately after `npm install` without requiring ts-node - it
 * simply requires the compiled output in dist/.
 * ------------------------------------------------------------------
 */
require("../dist/cli.js");
