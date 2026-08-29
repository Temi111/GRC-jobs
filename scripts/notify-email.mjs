import { Resend } from "resend";

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}

export async function emailStrongMatches(jobs, pagesUrl) {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.NOTIFY_EMAIL;

  if (!apiKey || !to) {
    console.warn(
      "[notify] Skipping email: RESEND_API_KEY or NOTIFY_EMAIL not set."
    );
    return;
  }

  const strong = jobs.filter((j) => j.titleMatch);
  if (strong.length === 0) {
    console.log("[notify] No strong matches today, skipping email.");
    return;
  }

  const resend = new Resend(apiKey);

  const textBlocks = strong.map((job) => {
    const lines = [
      `${job.title} — ${job.company} (${job.location})`,
      job.url,
    ];
    if (job.coverNote) lines.push("", "Draft cover note:", job.coverNote);
    return lines.join("\n");
  });

  const htmlBlocks = strong.map((job) => `
    <div style="margin-bottom:24px;padding-bottom:20px;border-bottom:1px solid #e2e0d8;">
      <p style="margin:0 0 4px;font-weight:600;font-size:15px;">
        <a href="${escapeHtml(job.url)}" style="color:#1b1b18;text-decoration:none;">${escapeHtml(job.title)}</a>
      </p>
      <p style="margin:0 0 10px;color:#6b6b63;font-size:13px;">${escapeHtml(job.company)} — ${escapeHtml(job.location)}</p>
      ${job.coverNote
        ? `<p style="margin:0;padding:10px 14px;background:#f7f7f5;border-radius:8px;font-size:13.5px;line-height:1.5;white-space:pre-wrap;">${escapeHtml(job.coverNote)}</p>`
        : ""}
    </div>`);

  await resend.emails.send({
    from: process.env.NOTIFY_FROM_EMAIL || "onboarding@resend.dev",
    to,
    subject: `${strong.length} strong-match job${strong.length === 1 ? "" : "s"} today — DevSecOps/GRC Ireland`,
    text: [
      `${strong.length} strong-match jobs found today.`,
      `Full list: ${pagesUrl}`,
      "",
      ...textBlocks,
    ].join("\n\n"),
    html: `
      <div style="font-family:-apple-system,sans-serif;max-width:600px;margin:0 auto;">
        <p style="font-size:14px;color:#6b6b63;">
          ${strong.length} strong-match job${strong.length === 1 ? "" : "s"} today.
          <a href="${escapeHtml(pagesUrl)}">See the full list</a>.
        </p>
        ${htmlBlocks.join("\n")}
      </div>`,
  });

  console.log(`[notify] Sent email with ${strong.length} strong matches.`);
}
