// Sitemap: the address and last-modified date of every page, for search engines
// - addresses are absolute, built from the site's homepage, since a sitemap can't use relative urls
// - a recipe's date is its latest commit; a page that lists recipes is as new as the newest recipe it lists
// - the tag pages are added from the tag vocabulary, as they're left out of the collections

const { tagUrl } = require("./tags.js");

// "/guides/flaky-tests/" -> "https://kenneally.dev/jenkins-cookbook/guides/flaky-tests/"
function getAbsoluteUrl(url, homepage) {
  if (typeof url !== "string" || !url.startsWith("/")) {
    console.error(`[sitemap] a page has no root-relative url to list: ${url}`);
    throw new TypeError("sitemap urls must start with /");
  }

  return new URL(url.slice(1), homepage).href;
}

function getNewestDate(dates) {
  return new Date(Math.max(...dates.map((date) => date.getTime())));
}

function assertUsableHomepage(homepage) {
  if (typeof homepage !== "string" || !/^https?:\/\/[^/]+\/(?:.*\/)?$/.test(homepage)) {
    console.error(`[sitemap] the homepage in package.json must be an absolute url ending in /, so page addresses can be built from it: ${homepage}`);
    throw new TypeError("unusable homepage for the sitemap");
  }
}

// the sitemap's entries, { loc, lastmod }, for every page in the collections plus one per tag
function buildSitemapEntries(collections, vocabulary, homepage) {
  assertUsableHomepage(homepage);

  const recipes = collections.taggable;
  if (!Array.isArray(recipes) || recipes.length === 0) {
    console.error("[sitemap] the taggable collection is empty, so there are no recipe dates to work from");
    throw new Error("no recipes for the sitemap");
  }

  const newestRecipeDate = getNewestDate(recipes.map((recipe) => recipe.date));
  const recipeSet = new Set(recipes);

  // a `permalink: false` page is never written out, so there's nothing to list
  const pageEntries = collections.all.filter((page) => page.url !== false).map((page) => {
    const date = recipeSet.has(page) ? page.date : getNewestDate([page.date, newestRecipeDate]);
    return { loc: getAbsoluteUrl(page.url, homepage), lastmod: date };
  });

  const tagEntries = vocabulary.map(({ id }) => {
    const tagged = collections[id];
    if (!Array.isArray(tagged) || tagged.length === 0) {
      console.error(`[sitemap] no recipe carries the tag ${id}, so its page has no date`);
      throw new Error(`no recipes for the tag ${id}`);
    }

    return { loc: getAbsoluteUrl(tagUrl(id), homepage), lastmod: getNewestDate(tagged.map((recipe) => recipe.date)) };
  });

  const entries = [...pageEntries, ...tagEntries];
  const locs = entries.map((entry) => entry.loc);
  const duplicates = locs.filter((loc, i) => locs.indexOf(loc) !== i);
  if (duplicates.length > 0) {
    console.error(`[sitemap] more than one page is served from the same address:\n${[...new Set(duplicates)].join("\n")}`);
    throw new Error("duplicate sitemap urls");
  }

  return entries
    .map(({ loc, lastmod }) => ({ loc, lastmod: lastmod.toISOString() }))
    .sort((a, b) => a.loc.localeCompare(b.loc));
}

module.exports = { buildSitemapEntries };
