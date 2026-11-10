# Legacy static site (archived)

The original `forcedowels-preview` site: static HTML pages plus Vercel serverless
functions in `api/`. It was replaced by the Next.js app in the repository root and
is kept here only for reference. Nothing in this folder is built, linted or deployed.

Full history of these files is preserved in git (`git log --follow -- legacy/<path>`).

To look at the old site locally, from this folder:

```bash
npx serve . -l 4173
```

The `api/` functions need the environment variables listed in the root `.env.example`
and are served by `vercel dev`; the Next.js app in `src/app/api` supersedes them.
`vercel.json` lives here (not at the root) on purpose: it configures the static site
and would break deploys of the Next.js app.
