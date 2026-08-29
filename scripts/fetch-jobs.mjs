import fs from "node:fs/promises";
import path from "node:path";

const APP_ID = process.env.ADZUNA_APP_ID;
const APP_KEY = process.env.ADZUNA_APP_KEY;

if (!APP_ID || !APP_KEY) {
  console.error(
    "Missing ADZUNA_APP_ID / ADZUNA_APP_KEY environment variables. " +
      "Sign up free at https://developer.adzuna.com/ and set them as repo secrets."
  );
  process.exit(1);
}

// Search phrases covering the requested areas: GRC, AI compliance, risk
// management, GRC ops, cloud assessment, third-party risk.
const SEARCH_TERMS = [
  "GRC",
  "GRC analyst",
  "AI compliance",
  "risk management",
  "third party risk",
  "cloud security assessment",
  "compliance risk management",
];

const COUNTRY = "ie";
const RESULTS_PER_PAGE = 50;

async function fetchTerm(term) {
  const url = new URL(
    `https://api.adzuna.com/v1/api/jobs/${COUNTRY}/search/1`
  );
  url.searchParams.set("app_id", APP_ID);
  url.searchParams.set("app_key", APP_KEY);
  url.searchParams.set("results_per_page", String(RESULTS_PER_PAGE));
  url.searchParams.set("what_phrase", term);
  url.searchParams.set("sort_by", "date");
  url.searchParams.set("content-type", "application/json");

  const res = await fetch(url);
  if (!res.ok) {
    console.warn(`[warn] "${term}" search failed: ${res.status} ${res.statusText}`);
    return [];
  }
  const data = await res.json();
  return (data.results ?? []).map((job) => ({
    id: job.id,
    title: job.title?.trim(),
    company: job.company?.display_name?.trim() ?? "Unknown company",
    location: job.location?.display_name?.trim() ?? "Ireland",
    url: job.redirect_url,
    created: job.created,
    contractType: job.contract_type ?? null, // 'permanent' | 'contract' | null
    contractTime: job.contract_time ?? null, // 'full_time' | 'part_time' | null
    salaryMin: job.salary_min ?? null,
    salaryMax: job.salary_max ?? null,
    description: job.description?.trim() ?? "",
    matchedTerm: term,
  }));
}

function dedupe(jobs) {
  const byId = new Map();
  for (const job of jobs) {
    if (!byId.has(job.id)) {
      byId.set(job.id, { ...job, matchedTerms: [job.matchedTerm] });
    } else {
      const existing = byId.get(job.id);
      if (!existing.matchedTerms.includes(job.matchedTerm)) {
        existing.matchedTerms.push(job.matchedTerm);
      }
    }
  }
  return [...byId.values()];
}

function formatSalary(job) {
  if (!job.salaryMin && !job.salaryMax) return null;
  const fmt = (n) => `€${Math.round(n).toLocaleString("en-IE")}`;
  if (job.salaryMin && job.salaryMax && job.salaryMin !== job.salaryMax) {
    return `${fmt(job.salaryMin)} – ${fmt(job.salaryMax)}`;
  }
  return fmt(job.salaryMin || job.salaryMax);
}

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}

function renderHtml(jobs, generatedAt) {
  const allTags = [...new Set(jobs.flatMap((j) => j.matchedTerms))].sort();

  const cards = jobs
    .map((job) => {
      const salary = formatSalary(job);
      const posted = job.created
        ? new Date(job.created).toLocaleDateString("en-IE", {
            day: "numeric",
            month: "short",
            year: "numeric",
          })
        : "";
      const type = [job.contractType, job.contractTime]
        .filter(Boolean)
        .map((s) => s.replace("_", " "))
        .join(" · ");
      const snippet = job.description.length > 220
        ? job.description.slice(0, 220).trim() + "…"
        : job.description;

      return `
      <article class="card" data-terms="${escapeHtml(job.matchedTerms.join("|"))}" data-contract="${escapeHtml(job.contractType || "")}">
        <div class="card-top">
          <h2><a href="${escapeHtml(job.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(job.title)}</a></h2>
          ${type ? `<span class="pill">${escapeHtml(type)}</span>` : ""}
        </div>
        <p class="meta">${escapeHtml(job.company)} — ${escapeHtml(job.location)}${posted ? ` · ${posted}` : ""}${salary ? ` · ${escapeHtml(salary)}` : ""}</p>
        <p class="snippet">${escapeHtml(snippet)}</p>
        <div class="tags">${job.matchedTerms.map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join("")}</div>
      </article>`;
    })
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>GRC & Compliance Jobs — Ireland</title>
<style>
  :root {
    --bg: #f7f7f5; --fg: #1b1b18; --muted: #6b6b63; --border: #e2e0d8;
    --surface: #ffffff; --accent: #2a5d50; --accent-fg: #eafaf4;
    --tag-bg: #eef0ea;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #14150f; --fg: #f0efe8; --muted: #a7a597; --border: #33342a;
      --surface: #1c1d15; --accent: #6fd3b4; --accent-fg: #06231c;
      --tag-bg: #262719;
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--bg); color: var(--fg);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  }
  header { max-width: 900px; margin: 0 auto; padding: 2.5rem 1.25rem 1rem; }
  h1 { font-size: 1.75rem; margin: 0 0 0.25rem; }
  .subtitle { color: var(--muted); margin: 0 0 1.25rem; }
  .controls { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 0.5rem; }
  .controls input, .controls select {
    padding: 0.5rem 0.75rem; border-radius: 0.5rem; border: 1px solid var(--border);
    background: var(--surface); color: var(--fg); font-size: 0.9rem;
  }
  .controls input { flex: 1; min-width: 180px; }
  .count { color: var(--muted); font-size: 0.85rem; margin: 0 0 1.5rem; }
  main { max-width: 900px; margin: 0 auto; padding: 0 1.25rem 3rem; display: grid; gap: 0.9rem; }
  .card {
    background: var(--surface); border: 1px solid var(--border); border-radius: 0.9rem;
    padding: 1rem 1.15rem;
  }
  .card-top { display: flex; justify-content: space-between; align-items: start; gap: 0.75rem; }
  .card h2 { font-size: 1.05rem; margin: 0; line-height: 1.35; }
  .card h2 a { color: var(--fg); text-decoration: none; }
  .card h2 a:hover { color: var(--accent); text-decoration: underline; }
  .pill {
    flex-shrink: 0; background: var(--accent); color: var(--accent-fg); font-size: 0.7rem;
    font-weight: 600; padding: 0.2rem 0.55rem; border-radius: 999px; text-transform: capitalize;
    white-space: nowrap;
  }
  .meta { color: var(--muted); font-size: 0.85rem; margin: 0.35rem 0 0.5rem; }
  .snippet { font-size: 0.9rem; line-height: 1.5; margin: 0 0 0.6rem; color: var(--fg); opacity: 0.9; }
  .tags { display: flex; flex-wrap: wrap; gap: 0.35rem; }
  .tag {
    background: var(--tag-bg); color: var(--muted); font-size: 0.7rem;
    padding: 0.15rem 0.5rem; border-radius: 999px;
  }
  footer { max-width: 900px; margin: 0 auto; padding: 0 1.25rem 3rem; color: var(--muted); font-size: 0.8rem; }
  .empty { color: var(--muted); padding: 2rem 0; text-align: center; }
</style>
</head>
<body>
<header>
  <h1>GRC &amp; Compliance Jobs — Ireland</h1>
  <p class="subtitle">Open roles in GRC, AI compliance, risk management, cloud assessment, and third-party risk. Rebuilt daily by a GitHub Action.</p>
  <div class="controls">
    <input id="search" type="search" placeholder="Filter by title, company, location…">
    <select id="contractFilter">
      <option value="">All types</option>
      <option value="permanent">Permanent</option>
      <option value="contract">Contract</option>
    </select>
    <select id="termFilter">
      <option value="">All keywords</option>
      ${allTags.map((t) => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join("")}
    </select>
  </div>
  <p class="count" id="count"></p>
</header>
<main id="list">
${cards || '<p class="empty">No matching jobs found in the latest run.</p>'}
</main>
<footer>
  Last updated ${escapeHtml(generatedAt)} · Source: Adzuna · ${jobs.length} jobs found
</footer>
<script>
  const search = document.getElementById('search');
  const contractFilter = document.getElementById('contractFilter');
  const termFilter = document.getElementById('termFilter');
  const cards = [...document.querySelectorAll('.card')];
  const count = document.getElementById('count');

  function applyFilters() {
    const q = search.value.trim().toLowerCase();
    const contract = contractFilter.value;
    const term = termFilter.value;
    let visible = 0;
    for (const card of cards) {
      const text = card.textContent.toLowerCase();
      const matchesQuery = !q || text.includes(q);
      const matchesContract = !contract || card.dataset.contract === contract;
      const terms = (card.dataset.terms || '').split('|');
      const matchesTerm = !term || terms.includes(term);
      const show = matchesQuery && matchesContract && matchesTerm;
      card.style.display = show ? '' : 'none';
      if (show) visible++;
    }
    count.textContent = visible + ' of ' + cards.length + ' jobs shown';
  }

  search.addEventListener('input', applyFilters);
  contractFilter.addEventListener('change', applyFilters);
  termFilter.addEventListener('change', applyFilters);
  applyFilters();
</script>
</body>
</html>`;
}

async function main() {
  const results = await Promise.all(SEARCH_TERMS.map(fetchTerm));
  const jobs = dedupe(results.flat()).sort(
    (a, b) => new Date(b.created) - new Date(a.created)
  );

  const generatedAt = new Date().toISOString();

  await fs.mkdir("dist", { recursive: true });
  await fs.writeFile(
    path.join("dist", "data.json"),
    JSON.stringify({ generatedAt, count: jobs.length, jobs }, null, 2)
  );
  await fs.writeFile(path.join("dist", "index.html"), renderHtml(jobs, generatedAt));

  console.log(`Wrote ${jobs.length} jobs to dist/`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
