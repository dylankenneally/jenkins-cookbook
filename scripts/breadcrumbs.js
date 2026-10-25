// Breadcrumbs: jenkinsfile-cookbook/guides/flaky-tests.md
// - built from where a page sits under the content folder, so a page needs no front matter
// - the folder links to its heading on the browse page; the section list in src/data/sections.json maps one to the other
// - a page can override the last segment with `crumbName`, or the middle one with `crumbParent: { label, url }`

const fs = require("node:fs");
const path = require("node:path");
const { relativeToContent, folderOf } = require("./content-paths.js");

const HOME = { label: "jenkinsfile-cookbook", url: "/" };

// the browse page's address: it has no permalink, so it is served from its file name
const BROWSE_URL = "/browse/";

// "flaky-tests" -> "flaky-tests.md"; a page at the top is shown in capitals, like README.md and BROWSE.md
function fileNameFor(relative) {
  const base = path.posix.basename(relative, path.posix.extname(relative));
  return `${folderOf(relative) ? base : base.toUpperCase()}.md`;
}

function sectionCrumb(relative, sections) {
  const folder = folderOf(relative);
  if (!folder) {
    return null;
  }

  const section = sections.find((candidate) => candidate.id === folder);
  if (!section) {
    console.error(`[breadcrumbs] ${relative} is in a folder that isn't listed in src/data/sections.json: ${folder}`);
    throw new Error(`no section for the folder ${folder}`);
  }

  return { label: folder, url: `${BROWSE_URL}#${section.anchor}` };
}

function breadcrumbsFor({ page, crumbName, crumbParent }, sections, contentDir) {
  const relative = relativeToContent(page.inputPath, contentDir);
  const parent = crumbParent ?? sectionCrumb(relative, sections);

  return [HOME, ...(parent ? [parent] : []), { label: crumbName ?? fileNameFor(relative) }];
}

// checks sections.json against the content folder and the browse page, so a renamed heading fails the build instead of shipping a dead link
function validateSections(sectionsPath, contentDir, slugify) {
  const sections = JSON.parse(fs.readFileSync(sectionsPath, "utf8"));
  const problems = [];

  const folders = fs.readdirSync(contentDir, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  for (const folder of folders.filter((name) => !sections.some((section) => section.id === name))) {
    problems.push(`the folder ${folder} has no entry`);
  }

  for (const section of sections.filter((candidate) => !folders.includes(candidate.id))) {
    problems.push(`${section.id} is not a folder in ${contentDir}`);
  }

  const browse = fs.readFileSync(path.join(contentDir, "browse.md"), "utf8");
  const anchors = new Set([...browse.matchAll(/^##\s+(.+?)\s*$/gm)].map((heading) => slugify(heading[1])));
  for (const section of sections.filter((candidate) => !anchors.has(candidate.anchor))) {
    problems.push(`${section.id} links to #${section.anchor}, which is not a heading on browse.md`);
  }

  if (problems.length === 0) {
    return;
  }

  console.error(`[breadcrumbs] ${sectionsPath} has problems:\n${problems.join("\n")}`);
  throw new Error(`${sectionsPath} doesn't match the content folder and browse.md`);
}

module.exports = { breadcrumbsFor, validateSections };
