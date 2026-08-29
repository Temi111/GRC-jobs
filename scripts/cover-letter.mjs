import Anthropic from "@anthropic-ai/sdk";

const MAX_DRAFTS_PER_RUN = 15; // safety ceiling on API spend per run

const SYSTEM_PROMPT = `You write short, specific cover notes for a job candidate applying to
real job postings. You are given the candidate's real background and one job posting.

Rules:
- 100-150 words. No greeting ("Dear Hiring Manager") and no sign-off ("Sincerely, ...") —
  just the body paragraph(s), ready to drop into an application form or email.
- Reference 1-2 concrete specifics from the job posting and tie them to specific,
  real items from the candidate's background (a tool, certification, or achievement) —
  not generic enthusiasm.
- Natural, professional tone. No clichés ("passionate about", "team player", "fast-paced
  environment"). No made-up facts about the candidate — only use what's given.
- If the posting is a weak fit for the candidate's background, say so plainly in the
  note rather than forcing a connection (e.g. note the specific gap).`;

export async function draftCoverNotes(jobs, candidateProfile) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn("[cover-letter] Skipping: ANTHROPIC_API_KEY not set.");
    return jobs;
  }
  if (!candidateProfile) {
    console.warn("[cover-letter] Skipping: CANDIDATE_PROFILE not set.");
    return jobs;
  }

  const client = new Anthropic({ apiKey });
  const targets = jobs.filter((j) => j.titleMatch).slice(0, MAX_DRAFTS_PER_RUN);

  const drafted = await Promise.all(
    targets.map(async (job) => {
      try {
        const response = await client.messages.create({
          model: "claude-opus-5",
          max_tokens: 1024,
          system: SYSTEM_PROMPT,
          messages: [
            {
              role: "user",
              content: `Candidate background:\n${candidateProfile}\n\nJob posting:\nTitle: ${job.title}\nCompany: ${job.company}\nLocation: ${job.location}\nDescription: ${job.description}`,
            },
          ],
        });
        const text = response.content.find((b) => b.type === "text")?.text?.trim();
        return { id: job.id, coverNote: text ?? null };
      } catch (err) {
        console.warn(`[cover-letter] Failed for "${job.title}" @ ${job.company}:`, err.message);
        return { id: job.id, coverNote: null };
      }
    })
  );

  const notesById = new Map(drafted.map((d) => [d.id, d.coverNote]));
  return jobs.map((job) =>
    notesById.has(job.id) ? { ...job, coverNote: notesById.get(job.id) } : job
  );
}
