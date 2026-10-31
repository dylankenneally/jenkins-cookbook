// Absolute URLs: a page's full public address, built from the site's homepage in package.json
// - used where a relative url won't do: the sitemap, canonical links and link-preview (Open Graph) tags
// - built from the homepage rather than pathPrefix, since local and pull request builds use a prefix of /

function assertUsableHomepage(homepage) {
  if (typeof homepage !== "string" || !/^https?:\/\/[^/]+\/(?:.*\/)?$/.test(homepage)) {
    console.error(`[absolute-url] the homepage in package.json must be an absolute url ending in /, so page addresses can be built from it: ${homepage}`);
    throw new TypeError("unusable homepage for absolute urls");
  }
}

// "/guides/flaky-tests/" -> "https://kenneally.dev/jenkins-cookbook/guides/flaky-tests/"
function getAbsoluteUrl(url, homepage) {
  assertUsableHomepage(homepage);
  if (typeof url !== "string" || !url.startsWith("/")) {
    console.error(`[absolute-url] only a root-relative url can be made absolute, but got: ${url}`);
    throw new TypeError("absolute urls are built from urls that start with /");
  }

  return new URL(url.slice(1), homepage).href;
}

module.exports = { assertUsableHomepage, getAbsoluteUrl };
