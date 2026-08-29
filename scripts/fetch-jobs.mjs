import fs from "node:fs/promises";
import path from "node:path";
import { draftCoverNotes } from "./cover-letter.mjs";
import { emailStrongMatches } from "./notify-email.mjs";

const PAGES_URL = "https://temi111.github.io/GRC-jobs/";

const JOOBLE_KEY = process.env.JOOBLE_KEY;

if (!JOOBLE_KEY) {
  console.error(
    "Missing JOOBLE_KEY environment variable. " +
      "Sign up free at https://jooble.org/api/about and set it as a repo secret."
  );
  process.exit(1);
}

// Search phrases tailored to a DevSecOps / Cloud Security / GRC profile:
// Kubernetes, AWS/Azure/GCP, Terraform, ArgoCD, ISO 27001/DORA/PCI DSS,
// CISA/AWS DevOps Professional background.
const SEARCH_TERMS = [
  "GRC",
  "GRC Analyst",
  "AI compliance",
  "risk management",
  "third party risk",
  "cloud security assessment",
  "DevOps Engineer",
  "DevSecOps",
  "Cybersecurity Engineer",
  "Cybersecurity Consultant",
  "Site Reliability Engineer",
  "Cloud Security Engineer",
  "IT Audit",
  "IT Auditor",
];

// Which section a job's matched terms place it in. A job can land in both
// sections (e.g. a DevSecOps role matching both "DevSecOps" and "IT Audit").
const GRC_TERMS = new Set([
  "GRC",
  "GRC Analyst",
  "AI compliance",
  "risk management",
  "third party risk",
  "cloud security assessment",
  "Cybersecurity Consultant",
  "IT Audit",
  "IT Auditor",
]);
const DEVOPS_TERMS = new Set([
  "DevOps Engineer",
  "DevSecOps",
  "Cybersecurity Engineer",
  "Site Reliability Engineer",
  "Cloud Security Engineer",
]);

function isGrcJob(job) {
  return job.matchedTerms.some((t) => GRC_TERMS.has(t));
}
function isDevopsJob(job) {
  return job.matchedTerms.some((t) => DEVOPS_TERMS.has(t));
}

const LOCATION = "Ireland";
const JOOBLE_ENDPOINT = `https://jooble.org/api/${JOOBLE_KEY}`;

function stripHtml(str) {
  return String(str ?? "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchTerm(term) {
  const res = await fetch(JOOBLE_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ keywords: term, location: LOCATION }),
  });

  if (!res.ok) {
    console.warn(`[warn] "${term}" search failed: ${res.status} ${res.statusText}`);
    return [];
  }

  const data = await res.json();
  return (data.jobs ?? []).map((job) => ({
    id: String(job.id),
    title: stripHtml(job.title),
    company: job.company?.trim() || "Unknown company",
    location: job.location?.trim() || "Ireland",
    url: job.link,
    created: job.updated,
    type: job.type?.trim() || "",
    salary: job.salary?.trim() || "",
    description: stripHtml(job.snippet),
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

// A job is a "strong" match if one of the terms that found it also appears
// in the job title, not just somewhere in the snippet text. Snippet-only
// matches (e.g. "risk" mentioned once in an unrelated role) are weaker.
function markMatchStrength(jobs) {
  return jobs.map((job) => {
    const title = job.title.toLowerCase();
    const titleMatch = job.matchedTerms.some((t) => title.includes(t.toLowerCase()));
    return { ...job, titleMatch };
  });
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

function renderCard(job) {
  const posted = job.created
    ? new Date(job.created).toLocaleDateString("en-IE", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "";
  const snippet = job.description.length > 220
    ? job.description.slice(0, 220).trim() + "…"
    : job.description;

  return `
  <article class="card" data-terms="${escapeHtml(job.matchedTerms.join("|"))}" data-type="${escapeHtml(job.type)}" data-title-match="${job.titleMatch ? "1" : "0"}">
    <div class="card-top">
      <h2><a href="${escapeHtml(job.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(job.title)}</a></h2>
      <span class="pill-group">
        ${job.titleMatch ? `<span class="pill pill-strong">Strong match</span>` : ""}
        ${job.type ? `<span class="pill">${escapeHtml(job.type)}</span>` : ""}
      </span>
    </div>
    <p class="meta">${escapeHtml(job.company)} — ${escapeHtml(job.location)}${posted ? ` · ${posted}` : ""}${job.salary ? ` · ${escapeHtml(job.salary)}` : ""}</p>
    <p class="snippet">${escapeHtml(snippet)}</p>
    <div class="card-bottom">
      <div class="tags">${job.matchedTerms.map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join("")}</div>
      <a class="apply-btn" href="${escapeHtml(job.url)}" target="_blank" rel="noopener noreferrer">Apply →</a>
    </div>
  </article>`;
}

function renderSection(id, title, jobs) {
  const cards = jobs.map(renderCard).join("\n");
  return `
  <section class="job-section" id="${id}">
    <h2 class="section-title">${escapeHtml(title)} <span class="section-count">${jobs.length}</span></h2>
    <div class="grid">
      ${cards || '<p class="empty">No matching jobs found in the latest run.</p>'}
    </div>
  </section>`;
}

function renderHtml(jobs, generatedAt) {
  const allTerms = [...new Set(jobs.flatMap((j) => j.matchedTerms))].sort();
  const allTypes = [...new Set(jobs.map((j) => j.type).filter(Boolean))].sort();

  const grcJobs = jobs.filter(isGrcJob);
  const devopsJobs = jobs.filter(isDevopsJob);

  const sections = [
    renderSection("grc-section", "GRC, IT Audit & Compliance", grcJobs),
    renderSection("devops-section", "DevOps, SRE & Cloud", devopsJobs),
  ].join("\n");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>DevSecOps, Cybersecurity & GRC Jobs — Ireland</title>
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
  .section-nav { display: flex; flex-wrap: wrap; gap: 0.6rem 1.25rem; margin: 0 0 1.25rem; }
  .section-nav a { color: var(--accent); font-size: 0.85rem; font-weight: 600; text-decoration: none; }
  .section-nav a:hover { text-decoration: underline; }
  .controls { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 0.5rem; }
  .controls input, .controls select {
    padding: 0.5rem 0.75rem; border-radius: 0.5rem; border: 1px solid var(--border);
    background: var(--surface); color: var(--fg); font-size: 0.9rem;
  }
  .controls input { flex: 1; min-width: 180px; }
  .count { color: var(--muted); font-size: 0.85rem; margin: 0 0 1.5rem; }
  main { max-width: 900px; margin: 0 auto; padding: 0 1.25rem 3rem; }
  .job-section { margin-bottom: 2.5rem; }
  .section-title {
    font-size: 1.15rem; margin: 0 0 1rem; padding-bottom: 0.6rem;
    border-bottom: 2px solid var(--border); display: flex; align-items: baseline; gap: 0.5rem;
  }
  .section-count {
    font-size: 0.8rem; font-weight: 600; color: var(--muted); background: var(--tag-bg);
    padding: 0.1rem 0.55rem; border-radius: 999px;
  }
  .grid { display: grid; gap: 0.9rem; }
  .card {
    background: var(--surface); border: 1px solid var(--border); border-radius: 0.9rem;
    padding: 1rem 1.15rem;
  }
  .card-top { display: flex; justify-content: space-between; align-items: start; gap: 0.75rem; }
  .card h2 { font-size: 1.05rem; margin: 0; line-height: 1.35; }
  .card h2 a { color: var(--fg); text-decoration: none; }
  .card h2 a:hover { color: var(--accent); text-decoration: underline; }
  .pill-group { display: flex; flex-wrap: wrap; gap: 0.35rem; flex-shrink: 0; }
  .pill {
    flex-shrink: 0; background: var(--tag-bg); color: var(--muted); font-size: 0.7rem;
    font-weight: 600; padding: 0.2rem 0.55rem; border-radius: 999px;
    white-space: nowrap;
  }
  .pill-strong { background: var(--accent); color: var(--accent-fg); }
  .controls label {
    display: flex; align-items: center; gap: 0.4rem; font-size: 0.85rem;
    color: var(--muted); padding: 0.5rem 0.25rem;
  }
  .meta { color: var(--muted); font-size: 0.85rem; margin: 0.35rem 0 0.5rem; }
  .snippet { font-size: 0.9rem; line-height: 1.5; margin: 0 0 0.6rem; color: var(--fg); opacity: 0.9; }
  .card-bottom {
    display: flex; align-items: center; justify-content: space-between;
    gap: 0.75rem; margin-top: 0.75rem; flex-wrap: wrap;
  }
  .tags { display: flex; flex-wrap: wrap; gap: 0.35rem; }
  .tag {
    background: var(--tag-bg); color: var(--muted); font-size: 0.7rem;
    padding: 0.15rem 0.5rem; border-radius: 999px;
  }
  .apply-btn {
    flex-shrink: 0; background: var(--accent); color: var(--accent-fg);
    font-size: 0.8rem; font-weight: 600; padding: 0.4rem 0.9rem;
    border-radius: 999px; text-decoration: none; white-space: nowrap;
  }
  .apply-btn:hover { opacity: 0.9; }
  footer { max-width: 900px; margin: 0 auto; padding: 0 1.25rem 3rem; color: var(--muted); font-size: 0.8rem; }
  .empty { color: var(--muted); padding: 2rem 0; text-align: center; }
</style>
</head>
<body>
<header>
  <h1>DevSecOps, Cybersecurity &amp; GRC Jobs — Ireland</h1>
  <p class="subtitle">Open roles in DevOps, DevSecOps, cybersecurity, cloud security, SRE, GRC, and risk management. Rebuilt daily by a GitHub Action.</p>
  <nav class="section-nav">
    <a href="#grc-section">Jump to GRC, IT Audit &amp; Compliance ↓</a>
    <a href="#devops-section">Jump to DevOps, SRE &amp; Cloud ↓</a>
  </nav>
  <div class="controls">
    <input id="search" type="search" placeholder="Filter by title, company, location…">
    <select id="typeFilter">
      <option value="">All types</option>
      ${allTypes.map((t) => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join("")}
    </select>
    <select id="termFilter">
      <option value="">All keywords</option>
      ${allTerms.map((t) => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join("")}
    </select>
    <label><input type="checkbox" id="strongOnly"> Strong matches only</label>
  </div>
  <p class="count" id="count"></p>
</header>
<main id="list">
${sections}
</main>
<footer>
  Last updated ${escapeHtml(generatedAt)} · Source: Jooble · ${jobs.length} jobs found
</footer>
<script>
  const search = document.getElementById('search');
  const typeFilter = document.getElementById('typeFilter');
  const termFilter = document.getElementById('termFilter');
  const strongOnly = document.getElementById('strongOnly');
  const cards = [...document.querySelectorAll('.card')];
  const count = document.getElementById('count');

  function applyFilters() {
    const q = search.value.trim().toLowerCase();
    const type = typeFilter.value;
    const term = termFilter.value;
    const onlyStrong = strongOnly.checked;
    let visible = 0;
    for (const card of cards) {
      const text = card.textContent.toLowerCase();
      const matchesQuery = !q || text.includes(q);
      const matchesType = !type || card.dataset.type === type;
      const terms = (card.dataset.terms || '').split('|');
      const matchesTerm = !term || terms.includes(term);
      const matchesStrength = !onlyStrong || card.dataset.titleMatch === '1';
      const show = matchesQuery && matchesType && matchesTerm && matchesStrength;
      card.style.display = show ? '' : 'none';
      if (show) visible++;
    }
    count.textContent = visible + ' of ' + cards.length + ' jobs shown';
  }

  search.addEventListener('input', applyFilters);
  typeFilter.addEventListener('change', applyFilters);
  strongOnly.addEventListener('change', applyFilters);
  termFilter.addEventListener('change', applyFilters);
  applyFilters();
</script>
</body>
</html>`;
}

async function main() {
  const results = await Promise.all(SEARCH_TERMS.map(fetchTerm));
  const jobs = markMatchStrength(dedupe(results.flat())).sort((a, b) => {
    if (a.titleMatch !== b.titleMatch) return a.titleMatch ? -1 : 1;
    return new Date(b.created) - new Date(a.created);
  });

  const generatedAt = new Date().toISOString();

  // The public site (dist/) never includes cover-letter drafts or anything
  // candidate-specific beyond the job listings themselves — it's served
  // publicly via GitHub Pages. Drafts only go out over private email below.
  await fs.mkdir("dist", { recursive: true });
  await fs.writeFile(
    path.join("dist", "data.json"),
    JSON.stringify({ generatedAt, count: jobs.length, jobs }, null, 2)
  );
  await fs.writeFile(path.join("dist", "index.html"), renderHtml(jobs, generatedAt));

  console.log(`Wrote ${jobs.length} jobs to dist/`);

  const jobsWithNotes = await draftCoverNotes(jobs, process.env.CANDIDATE_PROFILE);
  await emailStrongMatches(jobsWithNotes, PAGES_URL);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
