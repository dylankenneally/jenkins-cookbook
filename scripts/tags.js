// Tags: #docker, #security and friends
// - a page lists its tags in its front matter (`tags: [docker, aws]`)
// - the tags a page may use are listed in src/data/tagVocabulary.json, so `docker` and `containers` can't both drift in
// - every page, tag and vocabulary entry is checked on each build, so a typo fails instead of shipping a page nobody can find

const fs = require("node:fs");
const { relativeToContent, folderOf } = require("./content-paths.js");

// where the tag pages are served from; the pages' permalinks in src/content/tags.html and tag.html match
const TAGS_URL = "/tags/";

const TAG_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const COLLATOR = new Intl.Collator("en", { sensitivity: "base", numeric: true });

// the markdown pages that are recipes; the landing, browse, 404 and index pages opt out with `searchable: false`
function isTaggable(page) {
  return page.inputPath.endsWith(".md") && page.data.searchable !== false;
}

function vocabularyProblems(vocabulary) {
  const problems = [];
  const seen = new Set();

  for (const { id } of vocabulary) {
    if (!TAG_ID.test(id) || id === "all") {
      problems.push(`not a usable tag name (lower-case words joined by hyphens, and not "all"): ${id}`);
    }

    if (seen.has(id)) {
      problems.push(`listed twice: ${id}`);
    }

    seen.add(id);
  }

  return problems;
}

function pageProblems(page, known, contentDir) {
  const name = relativeToContent(page.inputPath, contentDir);
  const tags = page.data.tags;

  if (!Array.isArray(tags) || tags.length === 0) {
    return [`${name} has no tags`];
  }

  const problems = tags.filter((tag) => !known.has(tag)).map((tag) => `${name} uses a tag that isn't in the vocabulary: ${tag}`);
  if (new Set(tags).size !== tags.length) {
    problems.push(`${name} lists a tag twice`);
  }

  return problems;
}

// checks every recipe's tags against the vocabulary and returns the recipes
function validateTags(pages, vocabularyPath, contentDir) {
  const vocabulary = JSON.parse(fs.readFileSync(vocabularyPath, "utf8"));
  const known = new Set(vocabulary.map((tag) => tag.id));
  const taggable = pages.filter(isTaggable);

  const used = new Set(taggable.flatMap((page) => page.data.tags ?? []));
  const problems = [
    ...vocabularyProblems(vocabulary).map((problem) => `${vocabularyPath}: ${problem}`),
    ...taggable.flatMap((page) => pageProblems(page, known, contentDir)),
    ...vocabulary.filter((tag) => !used.has(tag.id)).map((tag) => `${vocabularyPath}: no page uses the tag ${tag.id}`)
  ];

  if (problems.length > 0) {
    console.error(`[tags] the tags have problems:\n${problems.join("\n")}`);
    throw new Error("tags don't match the vocabulary");
  }

  return taggable;
}

function tagUrl(id) {
  return `${TAGS_URL}${id}/`;
}

// every tag with how many recipes carry it, for the tags overview
function tagSummaries(pages, vocabulary) {
  return vocabulary
    .map(({ id, description }) => ({ id, description, url: tagUrl(id), count: pages.filter((page) => page.data.tags.includes(id)).length }))
    .sort((a, b) => COLLATOR.compare(a.id, b.id));
}

// a tag's recipes grouped by the part of the cookbook they sit in, in the order of src/data/sections.json
function groupBySection(pages, sections, contentDir) {
  const recipes = pages.map((page) => ({ url: page.url, title: page.data.docTitle, file: relativeToContent(page.inputPath, contentDir), tags: [...page.data.tags].sort(COLLATOR.compare) }));

  return sections
    .map(({ id, label }) => ({ id, label, recipes: recipes.filter((recipe) => folderOf(recipe.file) === id).sort((a, b) => COLLATOR.compare(a.title, b.title)) }))
    .filter((group) => group.recipes.length > 0);
}

module.exports = { validateTags, tagUrl, tagSummaries, groupBySection };
