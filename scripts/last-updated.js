// Last updated: the dates shown for a recipe and for the whole site
// - a recipe's date is Eleventy's own `git Last Modified`, set for every page in .eleventy.js: the date of the page's latest commit
// - the site's date is the latest commit to anything that changes what the site shows
// - Eleventy hides git errors and falls back to the time of the build, so git is checked first and a clone that can't give true dates stops the build

const { execFileSync } = require("node:child_process");

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// the files a reader can see the effect of: pages, layout, styles, data, and the code that builds them; a README, workflow or dependency change isn't a site update
const SITE_PATHS = ["src", "scripts", ".eleventy.js"];

// stops the build when git can't give each file its own date, needed so pages can show the "last updated" field
function assertFullHistory() {
  let shallow;
  try {
    shallow = execFileSync("git", ["rev-parse", "--is-shallow-repository"], { encoding: "utf8" }).trim();
  } catch (error) {
    console.error("[last-updated] git isn't available or this isn't a git repository, so there are no commit dates to show");
    throw error;
  }

  if (shallow !== "true" || process.env.ALLOW_SHALLOW_GIT) {
    return;
  }

  console.error("[last-updated] this is a shallow git clone, so every page would show the date of the newest commit; fetch the full history (git fetch --unshallow, or fetch-depth: 0 for actions/checkout), or set ALLOW_SHALLOW_GIT=1 to build with wrong dates");
  throw new Error("shallow git clone");
}

// the day is worked out in this time zone, not the build machine's, so a build gives the same page anywhere and a commit made on the morning of the 31st reads as the 31st (it is still the 30th in UTC, where CI runs)
const SITE_TIME_ZONE = "Australia/Melbourne";

const DAY_PARTS = new Intl.DateTimeFormat("en-US", { timeZone: SITE_TIME_ZONE, year: "numeric", month: "numeric", day: "numeric" });

function formatLastUpdated(date) {
  const parts = Object.fromEntries(DAY_PARTS.formatToParts(date).map((part) => [part.type, part.value]));
  const iso = `${parts.year}-${parts.month.padStart(2, "0")}-${parts.day.padStart(2, "0")}`;
  return { iso, label: `${Number(parts.day)} ${MONTHS[Number(parts.month) - 1]} ${parts.year}` };
}

// the date a recipe was last updated, or null for any other page
function getRecipeLastUpdated({ page, searchable }) {
  if (!page.inputPath.endsWith(".md") || searchable === false) {
    return null;
  }

  return formatLastUpdated(page.date);
}

// the date the site as a whole was last updated
function getSiteLastUpdated() {
  const seconds = execFileSync("git", ["log", "-1", "--format=%at", "--", ...SITE_PATHS], { encoding: "utf8" }).trim();
  if (!seconds) {
    console.error(`[last-updated] no commit touches ${SITE_PATHS.join(", ")}, so there is no date for the site`);
    throw new Error("no commits for the site's files");
  }

  return formatLastUpdated(new Date(Number(seconds) * 1000));
}

module.exports = { assertFullHistory, getRecipeLastUpdated, getSiteLastUpdated };
