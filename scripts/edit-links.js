// Edit links: "Edit on GitHub" and "Report a problem" at the foot of each recipe
// - the addresses are worked out from the page's file, so a page needs nothing in its front matter
// - only recipes get them: the markdown pages that are searchable, the same set that carries tags

// the GitHub addresses for a recipe, or null for a page that isn't one
function editLinksFor({ page, searchable, docTitle, site }) {
  if (!page.inputPath.endsWith(".md") || searchable === false) {
    return null;
  }

  if (!site?.repoUrl || !site.editBranch || !site.homepage) {
    console.error("[edit-links] src/data/site.js needs repoUrl, editBranch and homepage to build the edit links");
    throw new Error("site data is missing what the edit links need");
  }

  const source = page.inputPath.replace(/^\.\//, "");
  const pageUrl = `${site.homepage.replace(/\/$/, "")}${page.url}`;
  const sourceUrl = `${site.repoUrl}/blob/${site.editBranch}/${source}`;

  const title = `Problem on the page "${docTitle}"`;
  const body = `**Page:** ${pageUrl}\n**Source:** ${sourceUrl}\n\n**What's wrong?**\n\n`;

  return {
    editUrl: `${site.repoUrl}/edit/${site.editBranch}/${source}`,
    reportUrl: `${site.repoUrl}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`
  };
}

module.exports = { editLinksFor };
