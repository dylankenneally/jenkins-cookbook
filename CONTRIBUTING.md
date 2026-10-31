# Contributing

Thanks for helping improve the cookbook. Corrections, clearer explanations and new recipes are all welcome.

## What makes a good contribution

- **Fixes:** typos, broken links, outdated steps, or a recipe that doesn't work as written.
- **Improvements:** a clearer explanation, a missing caveat, or a better example.
- **New recipes:** open an issue first to check it fits. The cookbook is layered (tutorials and concepts, guides, fundamentals, build recipes, shared library building blocks and composed pipelines), so a new page needs to belong in one of those layers and link to the pages around it.

To report a security problem, please follow [SECURITY.md](./SECURITY.md) instead of opening a public issue.

## Running it locally

You need Node.js 24 or newer.

```bash
git clone git@github.com:dylankenneally/jenkins-cookbook.git
cd jenkins-cookbook
npm install
npm start
```

The site is served at <http://localhost:8080> (or the next available port) and reloads as you edit. See the [README](./README.md) for the other scripts.

## Writing content

The pages live in `src/content/` as Markdown. Each one is published as its own page. The only front matter a recipe needs is its [tags](#tagging-a-page). Pages that aren't recipes, such as the landing, browse and 404 pages, set `searchable: false` instead. That keeps them out of the search index and means they take no tags.

- **Start with a single `#` heading.** It becomes the page title.
- **Write headings that make sense on their own.** Every heading gets a link anchor and shows up as a section in search results, so "Roll back an ECS service" is more useful than "Steps".
- **Link between pages with relative `.md` paths**, for example `[Troubleshooting](../guides/troubleshooting.md)`. They are rewritten to the right URL when the site is built.
- **Tag every code fence with its language** (`groovy`, `bash`, `yaml` and so on) so it is highlighted. Use `bash` for shell commands (not `sh`), `jenkins-log` for output copied from a Jenkins console log, `email to="your Jenkins administrator"` for a message the reader sends (start it with a `Subject:` line if it has one, and write placeholders as `<…>`), and `plaintext` for other plain text (not `text`). The build fails on a language the highlighter doesn't know.
- **Use callouts for asides**: `> [!NOTE]`, `> [!TIP]`, `> [!IMPORTANT]`, `> [!WARNING]` or `> [!CAUTION]`.
- **Draw diagrams with mermaid** in a ` ```mermaid ` fence rather than text art.
- **Add new pages to the browse list** in `src/content/browse.md`, so people can find them. If the page deserves a spot on the landing page, add it to the matching card in `src/data/landing.json`. The build fails if that file points at a page that doesn't exist.
- **Make the first paragraph say what the page covers.** It becomes the page's description in search engines and link previews, cut to about 160 characters. Set `description` in the front matter to override it.
- **Add new Jenkins and CI/CD terms to the glossary** in `src/content/concepts/glossary.md`, as a bold term followed by a colon and its definition, in alphabetical order, with a link to the page that covers the term. The A to Z index builds its entries from these paragraphs.
- **Follow the [style guide](#style-guide)** for spelling, headings, voice and terminology.

### Style guide

The aim is one voice across every page, so a reader can't tell who wrote which.

**Spelling and punctuation**

- Use British spelling (colour, behaviour, organisation, -ise endings). Two exceptions: "artifact", which follows Jenkins (`archiveArtifacts`), and names that come from code, a library or a product, such as `NotSerializableException`.

**Headings and links**

- Write page titles (the `#` heading) in Title Case, and use `&` in them ("Agents & Labels"). Write every other heading in sentence case. Put code in backticks, as in "`when` Conditions".
- Make link text match the title of the page it points to. Inside a sentence, write "and" for "&". When the link is a whole list item or table cell, keep the title exactly.

**Voice and tone**

- Write to the reader as "you", in the active voice, and use the imperative for instructions ("Add a timeout", not "A timeout should be added").
- Be plain and direct. Say what something does rather than how good it is, and avoid words like "go-to", "drop-in" or "booster".
- Keep code comments short and lower-case, and say why rather than what. Capitalise product names in them (Groovy, Jenkins, macOS, SCM).

**Terminology**

Use the same word for the same thing on every page.

| Write | Not | Notes |
| --- | --- | --- |
| controller | master, built-in node | Mention "built-in node" once, in [Agents and Labels](./src/content/fundamentals/agents-and-labels.md), as another name for the controller. |
| agent | slave, runner | Use "node" only for the `node` step and the **Manage Jenkins → Nodes** page. |
| Declarative Pipeline, Scripted Pipeline | declarative pipeline | Capitalise them when they name the syntax. |
| Multibranch Pipeline | multi-branch pipeline | Use it for the job type, and "multibranch" as an adjective ("a multibranch job"). |
| pull request | merge request | Write "pull request (PR)" on first use on a page. Identifiers such as `PR-42` keep PR. |
| Git host | git host | Capital G. |
| `master` | `main` | The default branch in examples. |
| `Jenkinsfile` | jenkinsfile, Jenkinsfile in plain text | Always in code font. |
| `input` directive | `input` step | Say "directive" for the stage-level form. |
| `dockerCleanup` | `dockerCleanup()` | No brackets on a step name in prose. |
| Docker, Gradle, Maven, Linux, macOS | docker, gradle, maven, linux, macos | Capitalise the product, not the command (`docker build`). |
| Gradle Wrapper, Maven Wrapper | Gradle wrapper | |
| multi-architecture | multi-arch | |

Write interface labels and menu paths in bold, with an arrow between levels: **Manage Jenkins → System**, **Build with Parameters**.

### Tagging a page

Every recipe carries a few tags, shown as `#docker`-style links at the bottom of the page. Each tag links to a page listing every recipe that has it, and `/tags/` lists them all.

Put the tags in the page's front matter, above the `#` heading:

```markdown
---
tags: [docker, aws, deploy]
---

# Roll back an ECS service
```

- **Use one to four tags** for what the page is about: the tools, the stack and the task. Don't tag every service a page happens to mention.
- **Pick from the existing tags.** They are listed, with a description of each, in `src/data/tagVocabulary.json`, so `docker` and `containers` don't both creep in.
- **Need a new tag?** Add it to `src/data/tagVocabulary.json` in the same change, as lower-case words joined by hyphens (`static-analysis`), with a one-line description. Use it on at least one page, or the build fails.
- **Pages that opt out of search** (`searchable: false`), such as the landing, browse and 404 pages, don't take tags.

The build fails if a page has no tags, uses a tag that isn't in the vocabulary, or lists the same tag twice.

### Breadcrumbs

The trail above each page (`jenkinsfile-cookbook/guides/flaky-tests.md`) is built from where the file sits, so there is nothing to write. If you add a new folder under `src/content/`, add it to `src/data/sections.json` with the heading on the browse page it should link to. The build fails if the folder isn't listed or the heading doesn't exist.

### Examples must be safe to copy

People copy these recipes into real pipelines, so keep the examples safe.

- Use placeholders, never real values: `jenkins.example.com`, `my-backend-service`, `aws-credentials-id`.
- Don't include real credentials, tokens, account IDs, internal hostnames or company names.
- Pin versions and image tags in examples rather than using `latest`.
- Show secrets being handled the safe way, as described in [Secrets in CI](./src/content/concepts/secrets-in-ci.md).

## Submitting a change

Every change reaches `master` through a pull request, including the maintainer's own. Nobody pushes to `master` directly.

### Quick fixes from the page

Each recipe has two links at the bottom, next to its tags:

- **Edit on GitHub** opens that page's Markdown file in GitHub's editor. If you don't have write access, GitHub makes a fork for you and opens a pull request when you save. It suits typos, wrong steps and small rewrites.
- **Report a problem** opens a new issue that already names the page and links to its source. Use it when you've spotted a mistake but don't want to fix it yourself.

The links are worked out from each page's file, so a new recipe gets them without any setup.

### Larger changes

Anything bigger than a quick fix, such as a new page or a restructure, is easier to do locally:

1. Fork the repository and create a branch from `master`.
2. Make your change and check it in the browser with `npm start`.
3. Run `npm run build` and make sure it finishes without errors.
4. Open a pull request that says what you changed and why. The site is built on every pull request, so check the result.

By contributing, you agree that your contribution is licensed under the [MIT License](./LICENSE).
