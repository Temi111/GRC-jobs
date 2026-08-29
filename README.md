# GRC Job Watch

A daily-updated list of GRC, AI compliance, risk management, cloud
assessment, and third-party risk jobs in Ireland — built by a GitHub Action
and published to GitHub Pages. No servers, no database; the whole thing is a
scheduled workflow that regenerates a static page.

## How it works

1. `.github/workflows/build.yml` runs once a day (and on every push to
   `main`, and on-demand via the Actions tab → "Run workflow").
2. It runs `scripts/fetch-jobs.mjs`, which queries the
   [Jooble](https://jooble.org/api/about) job search API for Ireland across
   a set of search phrases (GRC, AI compliance, risk management, third party
   risk, cloud security assessment, etc.), dedupes the results, and writes
   `dist/index.html` + `dist/data.json`.
3. The workflow publishes `dist/` to GitHub Pages.

Note: Adzuna (a common free job-search API) does not cover Ireland at all —
its supported countries are `at, au, be, br, ca, ch, de, es, fr, gb, in, it,
mx, nl, nz, pl, sg, us, za`. Jooble does have real Ireland coverage, which is
why it's used here.

## One-time setup

1. **Get a free Jooble API key**: sign up at
   https://jooble.org/api/about — takes a couple of minutes, no cost.
2. **Add it as a repo secret**: Settings → Secrets and variables → Actions →
   New repository secret:
   - `JOOBLE_KEY`
3. **Enable GitHub Pages with "GitHub Actions" as the source**: Settings →
   Pages → Build and deployment → Source → GitHub Actions.
4. Run the workflow once manually (Actions tab → "Build and deploy job list"
   → Run workflow) to publish the first version. After that it runs daily on
   its own.

## Editing the search terms

Edit `SEARCH_TERMS` in `scripts/fetch-jobs.mjs` — each entry is searched as
a keyword phrase against Jooble's Ireland listings. Push to `main` and the
next run picks it up.

## Changing the schedule

Edit the `cron` line in `.github/workflows/build.yml`
(https://crontab.guru/ is handy for this). GitHub Actions cron always runs
in UTC.
