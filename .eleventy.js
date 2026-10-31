const fs = require("node:fs");
const path = require("node:path");
const { InputPathToUrlTransformPlugin, HtmlBasePlugin } = require("@11ty/eleventy");
const syntaxHighlight = require("@11ty/eleventy-plugin-syntaxhighlight");
const markdownItAnchor = require("markdown-it-anchor");
const { buildSearchIndex } = require("./scripts/search-index.js");
const { validateLanding, pageFor } = require("./scripts/landing.js");
const { buildSiteIndex } = require("./scripts/site-index.js");
const { breadcrumbsFor, validateSections } = require("./scripts/breadcrumbs.js");
const { validateTags, tagUrl, tagSummaries, groupBySection } = require("./scripts/tags.js");
const { editLinksFor } = require("./scripts/edit-links.js");
const { assertFullHistory, getRecipeLastUpdated, getSiteLastUpdated } = require("./scripts/last-updated.js");
const { buildSitemapEntries } = require("./scripts/sitemap.js");

const CONTENT_DIR = "src/content";
const LANDING_DATA = "src/data/landing.json";
const SECTIONS_DATA = "src/data/sections.json";
const TAG_VOCABULARY_DATA = "src/data/tagVocabulary.json";

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

// the first paragraph of a markdown document as plain text, cut short enough for a search result's description
function firstParagraph(inputPath, maxLength = 160) {
  if (typeof inputPath !== "string" || !inputPath.endsWith(".md")) {
    return null;
  }

  try {
    const content = fs.readFileSync(inputPath, "utf8");

    // skip the front matter, then the code fences, so a blank line inside a snippet is never mistaken for a paragraph break
    let body = content;
    if (content.startsWith("---")) {
      const endFrontmatterIndex = content.indexOf("\n---", 3);
      if (endFrontmatterIndex !== -1) {
        body = content.slice(endFrontmatterIndex + 4);
      }
    }
    body = body.replace(/^```[\s\S]*?^```/gm, "");

    // the first block of plain prose: not a heading, quote, callout, table, list or html
    const block = body.split(/\n\s*\n/).map((candidate) => candidate.trim()).find((candidate) => candidate && !/^(#|>|\||[-*+]\s|\d+\.\s|<)/.test(candidate));
    if (!block) {
      return null;
    }

    const text = plainText(block).replace(/\s+/g, " ").trim();
    if (text.length <= maxLength) {
      return text;
    }

    // cut at a word boundary
    return `${text.slice(0, maxLength - 1).replace(/\s+\S*$/, "")}…`;
  } catch (error) {
    console.error(`[error] Failed to get the first paragraph from ${inputPath}`, error);
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

// a ```name fence skips prism and is rendered by render(token, env) instead; any other fence falls through to the next renderer
function customFence(name, render) {
  return (md) => {
    const fallback = md.renderer.rules.fence;

    md.renderer.rules.fence = (tokens, idx, options, env, self) => {
      const token = tokens[idx];
      if (token.info.trim().split(/\s+/)[0] !== name) {
        return fallback(tokens, idx, options, env, self);
      }

      return render(token, env);
    };
  };
}

// a code block with a bar above it; the bar stays out of the search index, and code-copy.js puts the copy button in it
function labelledBlock(kind, bar, code) {
  return `<figure class="code-figure ${kind}"><figcaption class="code-figure__bar" data-pagefind-ignore>${bar}</figcaption><pre><code>${code}</code></pre></figure>\n`;
}

// the page a fence came from, for build errors; eleventy passes the page data to markdown-it as its env
function fenceSource(env) {
  return env?.page?.inputPath ?? "a markdown page";
}

// ```mermaid fences become <pre class="mermaid"> for the browser-side renderer
function renderMermaid(token) {
  return `<pre class="mermaid">${escapeHtml(token.content)}</pre>\n`;
}

// how a line of a ```jenkins-log fence is styled; the first match wins and unmatched lines stay plain
const JENKINS_LOG_LINES = [
  // sh steps echo each command with a leading "+", which is how a reader finds what was running
  { kind: "command", pattern: /^\+ / },
  { kind: "error", pattern: /^(ERROR:|FAIL\b|script returned exit code [1-9])|^[\w.$]*(Exception|Error)\b/ },
  { kind: "warning", pattern: /^Warning:/ }
];

function jenkinsLogLine(line) {
  const rule = JENKINS_LOG_LINES.find(({ pattern }) => pattern.test(line));
  if (!rule) {
    return escapeHtml(line);
  }

  return `<span class="jenkins-log__${rule.kind}">${escapeHtml(line)}</span>`;
}

// ```jenkins-log fences become a labelled console excerpt; lines stay newline-separated so copy and search see the plain text
function renderJenkinsLog(token) {
  const lines = token.content.replace(/\n$/, "").split("\n").map(jenkinsLogLine).join("\n");
  return labelledBlock("jenkins-log", '<span class="code-figure__title">Console output</span>', lines);
}

// a line of a ```tree fence: the box-drawing branches, the entry (a folder ends in "/"), then an optional "# comment"
const TREE_LINE = /^([│├└─\s]*)(.*?)(\s+#.*)?$/;

// the branches are hidden from screen readers, which would otherwise read each box-drawing character aloud; copy still gets them
function treeLine(line) {
  const [, branch, entry, comment] = line.match(TREE_LINE);
  const kind = entry.endsWith("/") ? "folder" : "file";
  const parts = [branch && `<span class="tree__branch" aria-hidden="true">${escapeHtml(branch)}</span>`, entry && `<span class="tree__${kind}">${escapeHtml(entry)}</span>`, comment && `<span class="tree__comment">${escapeHtml(comment)}</span>`];
  return parts.filter(Boolean).join("");
}

// ```tree fences become a labelled directory listing
function renderTree(token) {
  const lines = token.content.replace(/\n$/, "").split("\n").map(treeLine).join("\n");
  return labelledBlock("tree", '<span class="code-figure__title">Directory tree</span>', lines);
}

// ```email to="your Jenkins administrator": who it's for is required; an optional "Subject: ..." first line is split out for the draft
const EMAIL_INFO = /^email\s+to="([^"]+)"$/;
const EMAIL_SUBJECT = /^Subject: (.+)\n+/;

// wraps each <placeholder> on a line in a span, treating nested ones as part of the outer; a "<" left open at the end of the line fails the build
function markPlaceholders(line, env) {
  let html = "";
  let depth = 0;
  for (const char of line) {
    if (char === "<") {
      html += depth === 0 ? '<span class="email__placeholder">&lt;' : "&lt;";
      depth++;
      continue;
    }

    if (char === ">" && depth > 0) {
      depth--;
      html += depth === 0 ? "&gt;</span>" : "&gt;";
      continue;
    }

    html += escapeHtml(char);
  }

  if (depth > 0) {
    console.error(`[email] ${fenceSource(env)}: a placeholder is never closed with ">" on this line of an email fence: ${line}`);
    throw new SyntaxError("unclosed placeholder in an email fence");
  }

  return html;
}

// a new draft with the subject and body filled in and no recipient; mailto bodies take CRLF line breaks (RFC 6068)
function mailtoHref(subject, body) {
  const params = [subject && `subject=${encodeURIComponent(subject)}`, `body=${encodeURIComponent(body.replace(/\n/g, "\r\n"))}`].filter(Boolean);
  return `mailto:?${params.join("&")}`;
}

// ```email fences become a labelled message: who it's for, a link to open it as a draft, and highlighted placeholders
function renderEmail(token, env) {
  const recipient = token.info.trim().match(EMAIL_INFO)?.[1];
  if (!recipient) {
    console.error(`[email] ${fenceSource(env)}: an email fence must say who it's for, e.g. \`\`\`email to="your Jenkins administrator", but it was \`\`\`${token.info.trim()}`);
    throw new SyntaxError("email fence without a recipient");
  }

  const text = token.content.replace(/\n+$/, "");
  const subject = text.match(EMAIL_SUBJECT)?.[1];
  const body = subject ? text.replace(EMAIL_SUBJECT, "") : text;

  const lines = text.split("\n").map((line, index) => {
    const html = markPlaceholders(line, env);
    const content = subject && index === 0 ? `<span class="email__subject">${html}</span>` : html;
    // the line's own indent, so the css can hang a wrapped line under its text; the newline stays inside so copy and search keep it
    const indent = line.match(/^ */)[0].length;
    const style = indent > 0 ? ` style="--indent: ${indent}ch"` : "";
    return `<span class="email__line"${style}>${content}\n</span>`;
  });

  const bar = `<span class="code-figure__title">Email to ${escapeHtml(recipient)}</span><a class="email__draft" href="${escapeHtml(mailtoHref(subject, body))}">Open in email</a>`;
  return labelledBlock("email", bar, lines.join(""));
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
  eleventyConfig.addPlugin(syntaxHighlight, { errorOnInvalidLanguage: true }); // otherwise we can have unescaped output

  eleventyConfig.amendLibrary("md", customFence("mermaid", renderMermaid));
  eleventyConfig.amendLibrary("md", customFence("jenkins-log", renderJenkinsLog));
  eleventyConfig.amendLibrary("md", customFence("email", renderEmail));
  eleventyConfig.amendLibrary("md", customFence("tree", renderTree));
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

  // each page's date is its latest commit, so git must be there and must have the full history
  eleventyConfig.on("eleventy.before", () => assertFullHistory());

  // breadcrumbs link each folder to its heading on the browse page, so check those headings are still there
  eleventyConfig.on("eleventy.before", () => validateSections(SECTIONS_DATA, CONTENT_DIR, eleventyConfig.getFilter("slugify")));

  // the recipes, once every one has been checked against the tag vocabulary
  eleventyConfig.addCollection("taggable", (api) => validateTags(api.getAll(), TAG_VOCABULARY_DATA, CONTENT_DIR));
  eleventyConfig.addFilter("tagUrl", tagUrl);
  eleventyConfig.addFilter("tagSummaries", tagSummaries);
  eleventyConfig.addFilter("groupBySection", (pages, sections) => groupBySection(pages, sections, CONTENT_DIR));

  // sitemap.xml lists every page and every tag page, with absolute urls and their last-modified dates
  eleventyConfig.addFilter("buildSitemapEntries", buildSitemapEntries);

  // prefixes root-relative urls with pathPrefix, so the site works under /jenkins-cookbook/ on github pages
  eleventyConfig.addPlugin(HtmlBasePlugin);

  // links between documents are written as source paths (../guides/foo.md) and rewritten to page urls
  eleventyConfig.addPlugin(InputPathToUrlTransformPlugin);

  // served from /assets/
  eleventyConfig.addPassthroughCopy({ "src/assets": "assets" });
  eleventyConfig.addPassthroughCopy(FONT_FILES);

  eleventyConfig.addGlobalData("layout", "default");
  eleventyConfig.addGlobalData("date", "git Last Modified");
  eleventyConfig.addGlobalData("siteLastUpdated", () => getSiteLastUpdated());
  eleventyConfig.addGlobalData("eleventyComputed", {
    docTitle: (data) => documentTitle(data.page.inputPath),
    metaDescription: (data) => data.description ?? firstParagraph(data.page.inputPath),
    breadcrumbs: (data) => breadcrumbsFor(data, data.sections, CONTENT_DIR),
    editLinks: (data) => editLinksFor(data),
    lastUpdated: (data) => getRecipeLastUpdated(data),
  });

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
    templateFormats: ["md", "html", "liquid"], // liquid is for output that isn't a page, such as sitemap.xml
  };
};
