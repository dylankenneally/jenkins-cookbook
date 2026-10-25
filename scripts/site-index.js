// A to Z index of the cookbook, built from the pages themselves
// - every page title, section heading and glossary term becomes an entry
// - identifiers in headings (steps, directives, variables) become entries of their own
// - nothing is kept by hand: a new page or heading is in the index on the next build

const fs = require("node:fs");
const path = require("node:path");

// a heading found on this many pages or more is boilerplate ("Usage", "Related"), not a topic
const BOILERPLATE_MIN_PAGES = 3;

// the page whose "**Term**: definition" paragraphs become entries
const GLOSSARY_PAGE = "concepts/glossary.md";

// h2 and h3 are topics; the h1 is the page title
const SECTION_LEVELS = [2, 3];

const COLLATOR = new Intl.Collator("en", { sensitivity: "base", numeric: true });

// content without its yaml front matter
function stripFrontMatter(content) {
  if (!content.startsWith("---")) {
    return content;
  }

  const end = content.indexOf("\n---", 3);
  return end === -1 ? content : content.slice(end + 4);
}

// merges neighbouring text, collapses whitespace and trims the ends
function tidy(parts) {
  const merged = [];
  for (const part of parts) {
    const last = merged[merged.length - 1];
    if (last && !last.code && !part.code) {
      last.text += part.text;
    } else {
      merged.push({ text: part.text, code: part.code });
    }
  }

  for (const part of merged) {
    if (!part.code) {
      part.text = part.text.replace(/\s+/g, " ");
    }
  }

  const first = merged[0];
  const last = merged[merged.length - 1];
  if (first && !first.code) {
    first.text = first.text.trimStart();
  }

  if (last && !last.code) {
    last.text = last.text.trimEnd();
  }

  return merged.filter((part) => part.text !== "");
}

// the text and code spans of an inline token's children; emphasis and link markup is dropped, its text kept
function inlineParts(children) {
  const parts = [];
  for (const child of children ?? []) {
    if (child.type === "code_inline") {
      parts.push({ text: child.content, code: true });
    } else if (child.type === "text" || child.type === "text_special") {
      parts.push({ text: child.content, code: false });
    } else if (child.type === "softbreak" || child.type === "hardbreak") {
      parts.push({ text: " ", code: false });
    }
  }

  return tidy(parts);
}

// "3. Quarantine the test" is a step in a guide; the number means nothing in an index
function withoutStepNumber(parts) {
  const [first, ...rest] = parts;
  if (!first || first.code) {
    return parts;
  }

  return tidy([{ text: first.text.replace(/^\d+\.\s+/, ""), code: false }, ...rest]);
}

function plainText(parts) {
  return parts.map((part) => part.text).join("");
}

// terms that differ only in case or spacing are the same entry
function keyOf(parts) {
  return plainText(parts).toLowerCase();
}

// a heading that is only a file path (`vars/withAws.groovy`, `build.gradle`) is a location, not a topic
function isPathLike(parts) {
  if (parts.length !== 1 || !parts[0].code) {
    return false;
  }

  const text = parts[0].text;
  return !/\s/.test(text) && (text.includes("/") || /\.[A-Za-z0-9]+$/.test(text));
}

function isIdentifier(text) {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(text);
}

// "`s3Sync` & `cloudFrontInvalidate`": a title that only lists code spans
function isCodeList(parts) {
  return parts.length >= 2 && parts.every((part) => part.code || /^[\s,&/]*(?:and)?[\s,&/]*$/.test(part.text));
}

// each identifier in a heading that also has other words, so `changeset` is found as well as "What `changeset` actually compares"
function identifierTerms(parts) {
  if (parts.length < 2) {
    return [];
  }

  return parts.filter((part) => part.code && isIdentifier(part.text)).map((part) => [{ text: part.text, code: true }]);
}

function withoutAnchor(url) {
  return url.split("#")[0];
}

// the page's folder under the content dir ("guides"), or "" for a page at the top
function sectionOf(relative) {
  return relative.includes("/") ? relative.split("/")[0] : "";
}

// reads a page and returns the page details plus its headings, with the ids the site renders them with
function readDocument(page, contentDir, parse) {
  const relative = path.posix.relative(contentDir, page.inputPath.replace(/^\.\//, ""));
  const tokens = parse(stripFrontMatter(fs.readFileSync(page.inputPath, "utf8")));

  const headings = [];
  tokens.forEach((token, i) => {
    if (token.type !== "heading_open") {
      return;
    }

    headings.push({
      level: Number(token.tag.slice(1)),
      id: token.attrGet("id"),
      parts: inlineParts(tokens[i + 1].children)
    });
  });

  const title = page.data.docTitle;
  const h1 = headings.find((heading) => heading.level === 1);

  return {
    relative,
    tokens,
    headings,
    page: { url: page.url, title, section: sectionOf(relative) },
    titleParts: h1 && h1.parts.length > 0 ? h1.parts : [{ text: title, code: false }]
  };
}

function entryFor(entries, parts) {
  const key = keyOf(parts);
  if (!entries.has(key)) {
    entries.set(key, { parts, href: null, section: "", locators: [] });
  }

  return entries.get(key);
}

// lists a page against an entry, once per page
function addLocator(entry, page, url) {
  const pageUrl = withoutAnchor(url);
  if (entry.href && withoutAnchor(entry.href) === pageUrl) {
    return;
  }
  if (entry.locators.some((locator) => withoutAnchor(locator.url) === pageUrl)) {
    return;
  }

  entry.locators.push({ label: page.title, url });
}

// the entry for a page's own title; a second page with the same title is listed like any other reference
function addTitleEntry(entries, parts, page) {
  const entry = entryFor(entries, parts);
  if (entry.href) {
    addLocator(entry, page, page.url);
    return;
  }

  entry.href = page.url;
  entry.section = page.section;
  entry.locators = entry.locators.filter((locator) => withoutAnchor(locator.url) !== page.url);
}

function addTitleEntries(entries, document) {
  const { titleParts, page } = document;
  if (isCodeList(titleParts)) {
    titleParts.filter((part) => part.code).forEach((part) => addTitleEntry(entries, [part], page));
    return;
  }

  addTitleEntry(entries, titleParts, page);
  identifierTerms(titleParts).forEach((parts) => addLocator(entryFor(entries, parts), page, page.url));
}

// headings that show up on many pages are the same boilerplate section repeated, so they say nothing about a topic
function boilerplateKeys(documents) {
  const pagesByKey = new Map();
  for (const document of documents) {
    for (const heading of document.headings.filter((candidate) => SECTION_LEVELS.includes(candidate.level))) {
      const key = keyOf(withoutStepNumber(heading.parts));
      pagesByKey.set(key, (pagesByKey.get(key) ?? new Set()).add(document.relative));
    }
  }

  return new Set([...pagesByKey].filter(([, relatives]) => relatives.size >= BOILERPLATE_MIN_PAGES).map(([key]) => key));
}

function addHeadingEntries(entries, document, boilerplate) {
  const { page } = document;
  for (const heading of document.headings.filter((candidate) => SECTION_LEVELS.includes(candidate.level))) {
    const parts = withoutStepNumber(heading.parts);
    if (parts.length === 0 || isPathLike(parts) || boilerplate.has(keyOf(parts))) {
      continue;
    }

    const url = heading.id ? `${page.url}#${heading.id}` : page.url;
    addLocator(entryFor(entries, parts), page, url);
    identifierTerms(parts).forEach((term) => addLocator(entryFor(entries, term), page, url));
  }
}

// "../fundamentals/agents-and-labels.md#anchor" -> the page it points at, resolved from the glossary's folder
function linkedPages(hrefs, pagesByRelative) {
  const found = [];
  for (const href of hrefs) {
    const [file, anchor] = href.split("#");
    if (!file.endsWith(".md")) {
      continue;
    }

    const target = pagesByRelative.get(path.posix.normalize(path.posix.join(path.posix.dirname(GLOSSARY_PAGE), file)));
    if (target) {
      found.push({ page: target, url: anchor ? `${target.url}#${anchor}` : target.url });
    }
  }

  return found;
}

// each "**Term**: definition" paragraph is an entry that points at the pages it links to, and at the glossary itself
function addGlossaryEntries(entries, documents) {
  const glossary = documents.find((document) => document.relative === GLOSSARY_PAGE);
  if (!glossary) {
    console.error(`[site-index] ${GLOSSARY_PAGE} is missing, so the index has no glossary terms`);
    throw new Error(`${GLOSSARY_PAGE} not found`);
  }

  const pagesByRelative = new Map(documents.map((document) => [document.relative, document.page]));
  let terms = 0;

  glossary.tokens.forEach((token, i) => {
    const inline = glossary.tokens[i + 1];
    if (token.type !== "paragraph_open" || inline?.type !== "inline") {
      return;
    }

    // markdown-it can leave an empty text token ahead of the opening bold marker
    const children = inline.children.filter((child) => child.type !== "text" || child.content !== "");
    const close = children.findIndex((child) => child.type === "strong_close");
    if (children[0]?.type !== "strong_open" || close === -1) {
      return;
    }

    const parts = inlineParts(children.slice(1, close));
    if (parts.length === 0) {
      return;
    }

    const hrefs = children.filter((child) => child.type === "link_open").map((child) => child.attrGet("href"));
    const entry = entryFor(entries, parts);
    linkedPages(hrefs, pagesByRelative).forEach(({ page, url }) => addLocator(entry, page, url));
    addLocator(entry, glossary.page, glossary.page.url);
    terms += 1;
  });

  if (terms === 0) {
    console.error(`[site-index] no "**Term**: definition" paragraphs found in ${GLOSSARY_PAGE}`);
    throw new Error(`${GLOSSARY_PAGE} has no glossary terms`);
  }
}

// "The queue" files under Q, ".NET" under N
function sortKeyOf(parts) {
  return plainText(parts).toLowerCase().replace(/^(?:the|a|an)\s+/, "").replace(/^[^a-z0-9]+/, "");
}

function letterOf(sortKey) {
  return /^[a-z]/.test(sortKey) ? sortKey[0].toUpperCase() : "#";
}

function groupByLetter(entries) {
  const sorted = [...entries.values()]
    .map((entry) => ({ ...entry, sortKey: sortKeyOf(entry.parts), locators: [...entry.locators].sort((a, b) => COLLATOR.compare(a.label, b.label)) }))
    .sort((a, b) => COLLATOR.compare(a.sortKey, b.sortKey));

  const groups = new Map();
  for (const { sortKey, ...entry } of sorted) {
    const letter = letterOf(sortKey);
    groups.set(letter, [...(groups.get(letter) ?? []), entry]);
  }

  // "#" (digits and symbols) goes last
  return [...groups].sort(([a], [b]) => (a === "#") - (b === "#") || COLLATOR.compare(a, b)).map(([letter, list]) => ({ letter, id: letterId(letter), entries: list }));
}

function letterId(letter) {
  return letter === "#" ? "letter-other" : `letter-${letter.toLowerCase()}`;
}

// builds the A to Z index from the site's markdown pages; skips `searchable: false` pages
function buildSiteIndex(pages, { contentDir, parse }) {
  const indexable = pages.filter((page) => page.inputPath.endsWith(".md") && page.data.searchable !== false);
  const documents = indexable.map((page) => readDocument(page, contentDir, parse));
  const boilerplate = boilerplateKeys(documents);
  const entries = new Map();

  // titles first, so a page's own title wins over a heading of the same name elsewhere
  documents.forEach((document) => addTitleEntries(entries, document));
  documents.forEach((document) => addHeadingEntries(entries, document, boilerplate));
  addGlossaryEntries(entries, documents);

  if (entries.size === 0) {
    console.error("[site-index] no entries were found in any page");
    throw new Error("the site index is empty");
  }

  const groups = groupByLetter(entries);
  const present = new Map(groups.map((group) => [group.letter, group.id]));
  const alphabet = Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i));
  const letters = [...alphabet, ...(present.has("#") ? ["#"] : [])].map((label) => ({ label, id: present.get(label) ?? null }));

  return { groups, letters, entryCount: entries.size, pageCount: documents.length };
}

module.exports = { buildSiteIndex };
