/**
 * Telegram alert dispatch, run at the tail of every job sync.
 *
 * Scoring is identical to /api/match — same similarity window, same seniority
 * adjustment, same keyword pass for the reasons — so the percentage in an
 * alert is the percentage the site would show for that posting. Two different
 * numbers for the same pair would be the kind of thing nobody ever trusts
 * again.
 *
 * Server-only: it reads resume text and chat IDs with the service role key.
 */

import { jobSourceUrl, type Job } from "./jobs.ts";
import { explainMatch, levelAdjustment, scoreFromSimilarity } from "./matching.ts";
import { getSupabaseAdmin } from "./supabase.ts";
import {
  formatMatchAlert,
  sendTelegramMessageResult,
  telegramConfigured,
} from "./telegram.ts";

/**
 * Alerts one subscriber can receive from a single sync.
 *
 * Someone who subscribes today has never been sent anything, so without a cap
 * their first sync delivers one message per matching posting in the batch —
 * up to 40 at once, which reads as spam and trips Telegram's per-chat flood
 * limit. Five is enough to be useful on day one; the rest arrive as the feed
 * moves on.
 */
const MAX_ALERTS_PER_RUN = 5;

/**
 * Gap between messages. Telegram allows roughly 30 per second across all
 * chats before it starts answering 429, and a sync can fan out to every
 * subscriber at once.
 */
const SEND_PACING_MS = 80;

/**
 * Subscribers read per sync. This is Supabase's default PostgREST row cap, not
 * a product decision — pick it up explicitly so going past it is visible in the
 * log rather than silent.
 */
const MAX_SUBSCRIBERS_PER_RUN = 1_000;

/**
 * Subscribers per delivery-log lookup. 20 × 40 jobs is 800 rows, comfortably
 * under the same 1000-row cap, which matters because a truncated log reads as
 * "nothing was ever sent" and re-alerts everyone in it.
 */
const ALERT_BATCH_SIZE = 20;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type AlertRow = {
  id: string;
  telegram_chat_id: string;
  resume_summary: string;
  /** PostgREST serialises `vector` as a JSON *string*, not an array. */
  resume_embedding: string | number[];
  min_match_score: number | string;
};

export type AlertDispatchResult = {
  subscribers: number;
  sent: number;
  failed: number;
  /** Subscribers switched off because they blocked the bot. */
  deactivated: number;
};

const EMPTY: AlertDispatchResult = { subscribers: 0, sent: 0, failed: 0, deactivated: 0 };

/**
 * pgvector over PostgREST arrives as "[0.1,0.2,…]". Parsing it is not
 * optional — a JSON string silently has a `.length` of its own, so skipping
 * this produces a similarity of 0 for everyone rather than an error.
 */
function parseEmbedding(value: string | number[]): number[] | null {
  if (Array.isArray(value)) return value;
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) && parsed.every((n) => typeof n === "number") ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Cosine similarity, matching what pgvector's `<=>` would return.
 *
 * Both sides come out of embeddings.ts already normalized, so the dot product
 * alone would do — but the magnitudes are computed anyway because a vector
 * written by an older build, or by hand, would otherwise produce a quietly
 * wrong score rather than a visibly wrong one.
 */
function cosineSimilarity(a: number[], b: number[]): number | null {
  if (a.length !== b.length || a.length === 0) return null;

  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }

  const denominator = Math.sqrt(magA) * Math.sqrt(magB);
  return denominator > 0 ? dot / denominator : null;
}

/**
 * Score every freshly synced posting against every active subscriber and send
 * what clears their threshold.
 *
 * `jobs` and `vectors` are index-aligned, exactly as syncJobs holds them.
 * The jobs must already be written to Supabase: job_alert_sends carries a
 * foreign key to jobs.id, so recording a send for a row that was never
 * upserted would fail.
 *
 * Candidates are the postings in this sync batch that this subscriber has not
 * already been sent — the batch is the most recent N postings from the feed,
 * so recency is already handled by the fetch, and job_alert_sends is the only
 * thing preventing a re-send. Matching on "new since last run" instead would
 * mean a transient Telegram failure dropped that alert permanently.
 */
export async function dispatchJobAlerts(
  jobs: Job[],
  vectors: number[][],
  log: (message: string) => void = () => {},
): Promise<AlertDispatchResult> {
  if (!jobs.length) return EMPTY;

  if (!telegramConfigured()) {
    log("  · TELEGRAM_BOT_TOKEN not set — skipping alerts");
    return EMPTY;
  }

  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("job_alerts")
    .select("id, telegram_chat_id, resume_summary, resume_embedding, min_match_score")
    .eq("is_active", true)
    // Supabase caps a PostgREST response at 1000 rows by default. Asking for
    // the cap explicitly, and saying so, beats silently serving the first 1000
    // subscribers and never the rest. Page this when it starts coming back
    // full — the count is in the sync log.
    .limit(MAX_SUBSCRIBERS_PER_RUN);

  if (error) {
    // 42P01: the table isn't there. Worth naming the migration rather than
    // letting a sync look broken over a feature that was never set up.
    if (error.code === "42P01") {
      log("  · job_alerts table missing — run supabase/migrations/0002_telegram_alerts.sql");
      return EMPTY;
    }
    throw new Error(`Could not read job_alerts: ${error.message}`);
  }

  const alerts = (data ?? []) as AlertRow[];
  if (!alerts.length) return EMPTY;

  if (alerts.length === MAX_SUBSCRIBERS_PER_RUN) {
    log(`  ! ${MAX_SUBSCRIBERS_PER_RUN} subscribers returned — the row cap. Some may be unserved.`);
  }

  const jobIds = jobs.map((job) => job.id);
  const result: AlertDispatchResult = { subscribers: alerts.length, sent: 0, failed: 0, deactivated: 0 };

  // Subscribers are processed in batches so the delivery-log lookup stays
  // bounded: `.in()` builds a GET query string, and one id per subscriber plus
  // one per job would eventually exceed both the URL length PostgREST accepts
  // and its 1000-row response cap. Exceeding the latter is the dangerous one —
  // it reads as "never sent" and re-alerts everybody.
  for (let start = 0; start < alerts.length; start += ALERT_BATCH_SIZE) {
    const batch = alerts.slice(start, start + ALERT_BATCH_SIZE);

    const { data: sentRows, error: sentError } = await supabase
      .from("job_alert_sends")
      .select("alert_id, job_id")
      .in("alert_id", batch.map((alert) => alert.id))
      .in("job_id", jobIds);

    if (sentError) throw new Error(`Could not read job_alert_sends: ${sentError.message}`);

    const alreadySent = new Set((sentRows ?? []).map((row) => `${row.alert_id}:${row.job_id}`));

    await dispatchBatch(batch, jobs, vectors, alreadySent, supabase, result, log);
  }

  return result;
}

async function dispatchBatch(
  alerts: AlertRow[],
  jobs: Job[],
  vectors: number[][],
  alreadySent: Set<string>,
  supabase: ReturnType<typeof getSupabaseAdmin>,
  result: AlertDispatchResult,
  log: (message: string) => void,
): Promise<void> {
  for (const alert of alerts) {
    const resumeVector = parseEmbedding(alert.resume_embedding);
    if (!resumeVector) {
      console.error(`[job-alerts] alert ${alert.id} has an unreadable embedding; skipping.`);
      continue;
    }

    const threshold = Number(alert.min_match_score);
    // A NaN threshold would compare false against everything and silently mute
    // the subscriber, so fall back to the column default instead.
    const minScore = Number.isFinite(threshold) ? threshold * 100 : 75;

    const candidates = jobs
      .map((job, index) => {
        if (alreadySent.has(`${alert.id}:${job.id}`)) return null;

        const similarity = cosineSimilarity(resumeVector, vectors[index]);
        if (similarity === null) return null;

        const score = scoreFromSimilarity(
          similarity,
          levelAdjustment(alert.resume_summary, job),
        );
        return score !== null && score >= minScore ? { job, score } : null;
      })
      .filter((candidate): candidate is { job: Job; score: number } => candidate !== null)
      // Best first, so a capped run sends the five that matter most.
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_ALERTS_PER_RUN);

    for (const { job, score } of candidates) {
      const { reasons } = explainMatch(alert.resume_summary, job);

      const sendResult = await sendTelegramMessageResult(
        alert.telegram_chat_id,
        formatMatchAlert({
          jobTitle: job.title,
          company: job.company,
          location: job.location,
          score,
          // The same lines the job card shows, minus the "worth addressing"
          // gap note — an alert is an invitation to apply, and leading with
          // what the reader lacks is a strange way to open one.
          highlights: reasons.filter((reason) => !reason.startsWith("Worth addressing")),
          // Resolved, not raw: a posting can carry a dead /jobs/<slug> path or
          // no link at all, and jobSourceUrl falls back to a live Myanmar
          // search. An alert whose only link 404s is worse than no alert.
          url: jobSourceUrl(job),
          salary: job.salary,
        }),
        { parse_mode: "HTML", disablePreview: true },
      );

      if (sendResult.ok) {
        result.sent++;
        // Recorded only after Telegram accepted it. The reverse order would
        // mark an undelivered alert as sent, and nothing would ever retry it.
        const { error: logError } = await supabase
          .from("job_alert_sends")
          .upsert(
            { alert_id: alert.id, job_id: job.id, score },
            { onConflict: "alert_id,job_id", ignoreDuplicates: true },
          );
        if (logError) {
          // The subscriber may see this one again tomorrow. That is the right
          // way to fail here — the alternative is losing it entirely.
          console.error(`[job-alerts] could not record send for ${alert.id}/${job.id}:`, logError.message);
        }
      } else {
        result.failed++;

        if (sendResult.unreachable) {
          // They blocked the bot or deleted the account. Keep the row — it
          // carries their settings if they ever come back — but stop paying
          // for sends that can only ever fail.
          await supabase.from("job_alerts").update({ is_active: false }).eq("id", alert.id);
          result.deactivated++;
          log(`  · ${alert.telegram_chat_id} unreachable (${sendResult.description}) — deactivated`);
          break;
        }

        // Rate limited: stop sending to this subscriber for this run rather
        // than burning the rest of their alerts against a closed window.
        if (sendResult.retryAfter) break;
      }

      await sleep(SEND_PACING_MS);
    }
  }
}
