const pkg = require("../../package.json");

// "Name <email> (url)" or { name }: the name alone, as shown in the footer
function authorName(author) {
  const name = (typeof author === "string" ? author : author?.name ?? "").replace(/\s*[<(].*$/, "").trim();
  if (!name) {
    console.error("[site] package.json has no author, so the footer has no name to put the copyright under");
    throw new Error("package.json needs an author");
  }

  return name;
}

module.exports = {
  title: "Jenkinsfile Cookbook",
  version: pkg.version,
  repoUrl: pkg.repository.url.replace(/^git\+/, "").replace(/\.git$/, ""),
  author: authorName(pkg.author),
  year: new Date().getFullYear(), // the year of the build, not of the last edit (used in the footer)
  contactEmail: "hello+jenkins-cookbook@dylankenneally.com"
};
