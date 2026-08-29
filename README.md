# GRC Job Watch

A daily-updated list of GRC, AI compliance, risk management, cloud
assessment, and third-party risk jobs in Ireland — built by a GitHub Action
and published to GitHub Pages. No servers, no database; the whole thing is a
scheduled workflow that regenerates a static page.

## How it works

1. `.github/workflows/build.yml` runs once a day (and on every push to
   `main`, and on-demand via the Actions tab → "Run workflow").
2. It runs `scripts/fetch-jobs.mjs`, which queries the
   [Adzuna](https://developer.adzuna.com/) job search API for Ireland across
   a set of search phrases (GRC, AI compliance, risk management, third party
   risk, cloud security assessment, etc.), dedupes the results, and writes
   `dist/index.html` + `dist/data.json`.
3. The workflow publishes `dist/` to GitHub Pages.

## One-time setup

1. **Get a free Adzuna API key**: sign up at
   https://developer.adzuna.com/ — takes a couple of minutes, no cost. You'll
   get an `App ID` and `App Key`.
2. **Add them as repo secrets**: Settings → Secrets and variables → Actions →
   New repository secret:
   - `ADZUNA_APP_ID`
   - `ADZUNA_APP_KEY`
3. **Enable GitHub Pages with "GitHub Actions" as the source**: Settings →
   Pages → Build and deployment → Source → GitHub Actions.
4. Run the workflow once manually (Actions tab → "Build and deploy job list"
   → Run workflow) to publish the first version. After that it runs daily on
   its own.

## Editing the search terms

Edit `SEARCH_TERMS` in `scripts/fetch-jobs.mjs` — each entry is searched as
an exact phrase against Adzuna's Ireland listings. Push to `main` and the
next run picks it up.

## Changing the schedule

Edit the `cron` line in `.github/workflows/build.yml`
(https://crontab.guru/ is handy for this). GitHub Actions cron always runs
in UTC.
