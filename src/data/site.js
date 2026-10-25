const pkg = require("../../package.json");

// the version and repository link in the header come from package.json, so there is one place to change them
module.exports = {
  title: "Jenkinsfile Cookbook",
  version: pkg.version,
  repoUrl: pkg.repository.url.replace(/^git\+/, "").replace(/\.git$/, "")
};
