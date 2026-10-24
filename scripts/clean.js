// cleans (erases) the build output directory

const { rmSync } = require("node:fs");
const path = require("node:path");

// keep in step with dir.output in .eleventy.js
const OUTPUT_DIR = path.resolve(__dirname, "..", "dist");

// force: a missing folder is fine, so clean is safe to run repeatedly
rmSync(OUTPUT_DIR, { recursive: true, force: true });
