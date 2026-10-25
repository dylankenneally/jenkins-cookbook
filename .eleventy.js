const fs = require("node:fs");
const path = require("node:path");
const { InputPathToUrlTransformPlugin, HtmlBasePlugin } = require("@11ty/eleventy");
const syntaxHighlight = require("@11ty/eleventy-plugin-syntaxhighlight");
const markdownItAnchor = require("markdown-it-anchor");
const { buildSearchIndex } = require("./scripts/search-index.js");
const { validateLanding, pageFor } = require("./scripts/landing.js");
const { buildSiteIndex } = require("./scripts/site-index.js");

const CONTENT_DIR = "src/content";
const LANDING_DATA = "src/data/landing.json";

// self-hosted fonts: only the weights the site uses are copied, with the licences the font licence asks to travel with them
const PLEX = "node_modules/@fontsource/ibm-plex-sans";
const MONO = "node_modules/@fontsource/jetbrains-mono";
const FONT_FILES = {
  [`${PLEX}/files/ibm-plex-sans-latin-400-normal.woff2`]: "assets/fonts/ibm-plex-sans-latin-400-normal.woff2",
  [`${PLEX}/files/ibm-plex-sans-latin-400-italic.woff2`]: "assets/fonts/ibm-plex-sans-latin-400-italic.woff2",
  [`${PLEX}/files/ibm-plex-sans-latin-600-normal.woff2`]: "assets/fonts/ibm-plex-sans-latin-600-normal.woff2",
  [`${PLEX}/files/ibm-plex-sans-latin-700-normal.woff2`]: "assets/fonts/ibm-plex-sans-latin-700-normal.woff2",
  [`${MONO}/files/jetbrains-mono-latin-400-normal.woff2`]: "assets/fonts/jetbrains-mono-latin-400-normal.woff2",
  [`${MONO}/files/jetbrains-mono-latin-700-normal.woff2`]: "assets/fonts/jetbrains-mono-latin-700-normal.woff2",
  [`${PLEX}/LICENSE`]: "assets/fonts/ibm-plex-sans-LICENSE.txt",
  [`${MONO}/LICENSE`]: "assets/fonts/jetbrains-mono-LICENSE.txt"
};

// gets the first heading from the supplied markdown document
function firstHeading(inputPath) {
  if (typeof inputPath !== "string" || !inputPath.endsWith(".md")) {
    return null;
  }

  try {
    const content = fs.readFileSync(inputPath, "utf8");

    // skip YAML frontmatter if present (starts and ends with '---'); prevents YAML comments starting with '#' from being matched as headings
    let markdownBody = content;
    if (content.startsWith("---")) {
      const endFrontmatterIndex = content.indexOf("\n---", 3);
      if (endFrontmatterIndex !== -1) {
        markdownBody = content.slice(endFrontmatterIndex + 4);
      }
    }

    // match the first valid heading (note headings can include the `#` char with this, so we can have headings that include "... c#" or "... #123")
    const heading = markdownBody.match(/^#{1,6}\s+(.+?)(?:\s+#+)?\s*$/m);
    return heading ? plainText(heading[1]).trim() : null;
  } catch (error) {
    console.error(`[error] Failed to get the first heading from ${inputPath}`, error);
    throw error;
  }
}

// stands in for a backslash-escaped character while the markup around it is stripped
const ESCAPED = (char) => `\uE000${char.charCodeAt(0)}\uE001`;

// a heading's inline markdown reduced to the plain text a <title> can show
//  - links and images keep their text, html tags go
//  - backticks always go, escaped or not, since a plain-text title can't show code formatting
//  - emphasis and strikethrough markers go; intraword underscores (NODE_ENV) stay
//  - any other escaped character (\*) comes back as its literal self
function plainText(markdown) {
  return markdown
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/\\?`/g, "")
    .replace(/\\([!-/:-@[-`{-~])/g, (_, char) => ESCAPED(char))
    .replace(/(\*{1,3})(\S(?:.*?\S)?)\1/g, "$2")
    .replace(/(?<!\w)(_{1,3})(\S(?:.*?\S)?)\1(?!\w)/g, "$2")
    .replace(/~~(\S(?:.*?\S)?)~~/g, "$1")
    .replace(/\uE000(\d+)\uE001/g, (_, code) => String.fromCharCode(Number(code)));
}

// safety net for a file with no heading: "when-conditions" reads as "When conditions"
function humanisedFilename(inputPath) {
  if (typeof inputPath !== "string" || !inputPath.trim()) {
    return "";
  }

  const base = path.basename(inputPath, path.extname(inputPath)); // base name without the file extension
  const cleaned = base
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2") // insert spaces before capital letters (camelCase/PascalCase support)
    .replace(/[-_.]+/g, " ")                // replace hyphens, underscores, and dots with spaces
    .replace(/\s+/g, " ")                   // collapse multiple spaces into a single space
    .trim();

  if (!cleaned) {
    return "";
  }

  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function documentTitle(inputPath) {
  return firstHeading(inputPath) ?? humanisedFilename(inputPath);
}

function escapeHtml(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ```mermaid fences skip prism and become <pre class="mermaid"> for the browser-side renderer
function renderMermaidFences(md) {
  const fallback = md.renderer.rules.fence;

  md.renderer.rules.fence = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    if (token.info.trim().split(/\s+/)[0] !== "mermaid") {
      return fallback(tokens, idx, options, env, self);
    }

    return `<pre class="mermaid">${escapeHtml(token.content)}</pre>\n`;
  };
}

// github-style callout markers, `> [!NOTE]` and friends, keyed to the label shown above the callout
const CALLOUT_LABELS = { note: "Note", tip: "Tip", important: "Important", warning: "Warning", caution: "Caution" };
const CALLOUT_MARKER = /^\[!(note|tip|important|warning|caution)\][ \t]*/i;

// a blockquote opening with a callout marker becomes a labelled <div class="callout">; any text after the marker stays as normal markdown
function renderCallouts(md) {
  md.core.ruler.after("block", "callouts", (state) => {
    const tokens = state.tokens;
    for (let i = 0; i < tokens.length; ++i) {
      const open = tokens[i];
      const inline = tokens[i + 2];
      if (open.type !== "blockquote_open" || tokens[i + 1]?.type !== "paragraph_open" || inline?.type !== "inline") {
        continue;
      }

      const marker = inline.content.match(CALLOUT_MARKER);
      if (!marker) {
        continue;
      }

      const kind = marker[1].toLowerCase();
      inline.content = inline.content.slice(marker[0].length).replace(/^\r?\n/, "");

      // a marker on a line of its own would otherwise leave an empty paragraph behind
      if (inline.content.trim() === "") {
        tokens[i + 1].hidden = true;
        tokens[i + 3].hidden = true;
      }

      const close = tokens.slice(i + 1).find((token) => token.type === "blockquote_close" && token.level === open.level);
      open.type = "callout_open";
      open.meta = { kind };
      close.type = "callout_close";
    }
  });

  md.renderer.rules.callout_open = (tokens, idx) => {
    const { kind } = tokens[idx].meta;
    return `<div class="callout callout--${kind}" role="note"><p class="callout__title">${CALLOUT_LABELS[kind]}</p>\n`;
  };
  md.renderer.rules.callout_close = () => "</div>\n";
}

module.exports = function (eleventyConfig) {
  eleventyConfig.addPlugin(syntaxHighlight);

  eleventyConfig.amendLibrary("md", renderMermaidFences);
  eleventyConfig.amendLibrary("md", renderCallouts);

  // headings get ids, so search can link straight to a section
  eleventyConfig.amendLibrary("md", (md) => md.use(markdownItAnchor, { slugify: eleventyConfig.getFilter("slugify"), tabIndex: false }));

  // the a to z index reads the pages with the site's own markdown instance, so the heading ids it links to are the ones rendered
  let markdown;
  eleventyConfig.amendLibrary("md", (md) => { markdown = md; });
  eleventyConfig.addFilter("siteIndex", (pages) => {
    if (!markdown) {
      console.error("[site-index] the markdown library isn't available, so the index can't read the pages");
      throw new Error("markdown library not initialised");
    }

    return buildSiteIndex(pages, { contentDir: CONTENT_DIR, parse: (source) => markdown.parse(source, {}) });
  });

  // the search index is built from the finished html, on every build including each rebuild under --serve
  eleventyConfig.on("eleventy.after", ({ dir }) => buildSearchIndex(dir.output));

  // the landing page is built from landing.json, so check its page references before every build
  eleventyConfig.on("eleventy.before", () => validateLanding(LANDING_DATA, CONTENT_DIR));
  eleventyConfig.addFilter("pageFor", (pages, ref) => pageFor(pages, ref, CONTENT_DIR));

  // prefixes root-relative urls with pathPrefix, so the site works under /jenkins-cookbook/ on github pages
  eleventyConfig.addPlugin(HtmlBasePlugin);

  // links between documents are written as source paths (../guides/foo.md) and rewritten to page urls
  eleventyConfig.addPlugin(InputPathToUrlTransformPlugin);

  // served from /assets/
  eleventyConfig.addPassthroughCopy({ "src/assets": "assets" });
  eleventyConfig.addPassthroughCopy(FONT_FILES);

  eleventyConfig.addGlobalData("layout", "default");

  // every page gets a title, so documents need no front matter
  eleventyConfig.addGlobalData("eleventyComputed", { docTitle: (data) => documentTitle(data.page.inputPath) });

  return {
    // local runs are served from the root; the deploy workflow sets the project page's sub-path
    pathPrefix: process.env.ELEVENTY_PATH_PREFIX || "/",
    dir: {
      input: CONTENT_DIR,
      output: "dist",
      // data, includes and layouts resolve relative to the input folder
      data: "../data",
      includes: "../includes",
      layouts: "../layouts"
    },
    templateFormats: ["md", "html"]
  };
};
