# Jenkins Cookbook

[![Deploy to GitHub Pages](https://github.com/dylankenneally/jenkins-cookbook/actions/workflows/deploy-to-ghpages.yml/badge.svg)](https://github.com/dylankenneally/jenkins-cookbook/actions/workflows/deploy-to-ghpages.yml)

Recipes for Jenkins Declarative Pipelines, from a first `Jenkinsfile` through to deploying to AWS.

Pipelines tend to be copied from the last project and drift from there. This cookbook is one place to copy from instead: short, copyable recipes for the common jobs, so you don't have to dig through the Jenkins documentation to find the pattern you need.

The content is layered, so you can start at the level that suits you:

- **Tutorials and concepts** get you started: your first pipeline, how Jenkins runs it, and how to read a failed build.
- **Guides** walk through common tasks, such as onboarding a repo, adding a credential, releasing and rolling back.
- **Fundamentals** cover the pipeline features that work with any stack.
- **Build recipes** cover one stack each: Node.js, .NET, Java, C++, Android, React Native and Docker.
- **Shared library building blocks** are the Docker and AWS steps, each written once and called by everything else.
- **Composed pipelines** put those together end to end.

Press `Cmd+K` (or `Ctrl+K`) on any page to search. The search covers page titles, headings, prose and code, so you can look up a step name or an error message and jump straight to the section that explains it.

It's written as Markdown and built with [Eleventy](https://www.11ty.dev/). Changes to this repository are deployed automatically to GitHub Pages at [kenneally.dev/jenkins-cookbook](https://kenneally.dev/jenkins-cookbook).

## To build and run

### Prerequisites

- [Node.js](https://nodejs.org/en/) 24 or newer.

### Getting the source code

```bash
git clone git@github.com:dylankenneally/jenkins-cookbook.git
cd jenkins-cookbook
```

### Install dependencies and start a development server

```bash
npm install
npm start
# the site will be available at http://localhost:8080 (or the next available port)
```

### Available scripts

| Script | Action |
| - | - |
| `npm start` | **Starts the development server** with live reload at <http://localhost:8080>. |
| `npm run build` | Performs a **production build** of the site to `./dist/`, including the search index. |
| `npm run clean` | Deletes `./dist/`. |

## Contributing

Corrections, clearer explanations and new recipes are welcome. The [contributing guide](./CONTRIBUTING.md) covers how to write a page, what makes an example safe to copy, and how to submit a change.

## Security

The recipes are meant to be copied into real pipelines, so a recipe that leaks a secret or recommends an unsafe default counts as a security problem. To report one, or anything else, privately, see the [security policy](./SECURITY.md) rather than opening a public issue.

## License

This project is licensed under the [MIT License](./LICENSE).
