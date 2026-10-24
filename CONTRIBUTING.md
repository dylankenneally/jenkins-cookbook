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

The site is served at <http://localhost:8080> and reloads as you edit. See the [README](./README.md) for the other scripts.

## Writing content

The pages live in `src/content/` as Markdown. Each one is published as its own page, with no front matter needed.

- **Start with a single `#` heading.** It becomes the page title.
- **Write headings that make sense on their own.** Every heading gets a link anchor and shows up as a section in search results, so "Roll back an ECS service" is more useful than "Steps".
- **Link between pages with relative `.md` paths**, for example `[Troubleshooting](../guides/troubleshooting.md)`. They are rewritten to the right URL when the site is built.
- **Tag every code fence with its language** (`groovy`, `bash`, `yaml` and so on) so it is highlighted.
- **Use callouts for asides**: `> [!NOTE]`, `> [!TIP]`, `> [!IMPORTANT]`, `> [!WARNING]` or `> [!CAUTION]`.
- **Draw diagrams with mermaid** in a ` ```mermaid ` fence rather than text art.
- **Add new pages to the index** in `src/content/index.md`, so people can find them.
- **Use British spelling**, as the rest of the cookbook does (colour, behaviour, organisation).

### Examples must be safe to copy

People copy these recipes into real pipelines, so keep the examples safe.

- Use placeholders, never real values: `jenkins.example.com`, `my-backend-service`, `aws-credentials-id`.
- Don't include real credentials, tokens, account IDs, internal hostnames or company names.
- Pin versions and image tags in examples rather than using `latest`.
- Show secrets being handled the safe way, as described in [Secrets in CI](./src/content/concepts/secrets-in-ci.md).

## Submitting a change

1. Fork the repository and create a branch from `master`.
2. Make your change and check it in the browser with `npm start`.
3. Run `npm run build` and make sure it finishes without errors.
4. Open a pull request that says what you changed and why. The site is built on every pull request, so check the result.

By contributing, you agree that your contribution is licensed under the [MIT License](./LICENSE).
