import { NextResponse } from "next/server";
import {
  EmbeddingError,
  MAX_EMBED_CHARS,
  MAX_EMBED_TOKENS,
  charsThatFit,
  countEmbedTokens,
  embedText,
} from "@/lib/embeddings";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  checkTelegramChat,
  formatWelcome,
  isValidChatId,
  sendTelegramMessage,
  telegramConfigured,
} from "@/lib/telegram";

/**
 * Subscribe a Telegram chat to job alerts.
 *
 *   POST { chatId: string, resumeText: string, minScore?: number }
 *
 * Upserts on telegram_chat_id, so resubmitting with a newer resume replaces
 * the old one rather than creating a second subscription.
 *
 * KNOWN GAP: this is a public endpoint that spends a Gemini embedding request
 * per call, and nothing here rate-limits it. The Telegram pre-check ahead of
 * the embedding blunts the obvious abuse — you cannot burn quota without a
 * chat ID that has already pressed Start on the bot — but a determined caller
 * with one valid ID can still loop it. Put a limiter in front of this before
 * it is linked anywhere public.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Mirrors the column default in 0002_telegram_alerts.sql. */
const DEFAULT_MIN_SCORE = 0.75;

/**
 * Below this, nearly every posting qualifies: measured over this corpus the
 * median resume×job pair already scores in the sixties. A subscriber who sets
 * 0.3 has not asked for alerts, they have asked for the whole feed, daily.
 */
const MIN_ALLOWED_SCORE = 0.5;

function fail(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function POST(request: Request) {
  if (!telegramConfigured()) {
    console.error("[alerts/subscribe] TELEGRAM_BOT_TOKEN is not set.");
    return fail(500, "misconfigured", "Telegram alerts are not configured on this server.");
  }

  let body: { chatId?: unknown; resumeText?: unknown; minScore?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return fail(
      400,
      "invalid_body",
      "Request body must be JSON shaped like { chatId: string, resumeText: string }.",
    );
  }

  // --- chat id -------------------------------------------------------
  // Accepts a number too: JSON.stringify on a chat ID read from the Bot API
  // produces one, and rejecting that would be a pointless trap.
  const rawChatId =
    typeof body.chatId === "string"
      ? body.chatId.trim()
      : typeof body.chatId === "number" && Number.isInteger(body.chatId)
        ? String(body.chatId)
        : null;

  if (!rawChatId) {
    return fail(400, "missing_chat_id", "Include your Telegram chat ID.");
  }
  if (!isValidChatId(rawChatId)) {
    return fail(
      400,
      "invalid_chat_id",
      "That doesn't look like a Telegram chat ID. It's a number — send /start to the bot and it will reply with yours.",
    );
  }

  // --- resume --------------------------------------------------------
  const resumeText = typeof body.resumeText === "string" ? body.resumeText.trim() : "";
  if (!resumeText) {
    return fail(400, "empty_resume", "Add your resume before subscribing.");
  }
  if (resumeText.length > MAX_EMBED_CHARS) {
    return fail(
      413,
      "resume_too_long",
      `That resume is ${resumeText.length.toLocaleString()} characters, which is past anything this can read.`,
    );
  }

  // --- threshold -----------------------------------------------------
  // On the 0-1 display-score scale, the same one the match badge shows. See
  // the min_match_score comment in 0002_telegram_alerts.sql for why this is
  // not raw cosine similarity.
  let minScore = DEFAULT_MIN_SCORE;
  if (body.minScore !== undefined && body.minScore !== null) {
    const parsed = Number(body.minScore);
    if (!Number.isFinite(parsed) || parsed < MIN_ALLOWED_SCORE || parsed > 1) {
      return fail(
        400,
        "invalid_min_score",
        `minScore is a fraction between ${MIN_ALLOWED_SCORE} and 1 — 0.75 means "alert me at 75% and up".`,
      );
    }
    minScore = parsed;
  }

  // --- can we actually reach this chat? ------------------------------
  // First, because it is the failure everybody hits: a bot cannot open a
  // conversation, so until the person presses Start their perfectly valid chat
  // ID is unwritable. Finding that out here costs one cheap call; finding it
  // out after the embedding costs Gemini quota and leaves a row that can never
  // be delivered to.
  const reachable = await checkTelegramChat(rawChatId);
  if (!reachable.ok) {
    if (reachable.unreachable) {
      return fail(
        422,
        "chat_unreachable",
        "The bot can't message that chat yet. Open the bot on Telegram, press Start, then try again.",
      );
    }
    console.error(`[alerts/subscribe] getChat failed: ${reachable.description}`);
    return fail(502, "telegram_unavailable", "Telegram didn't respond. Try again in a moment.");
  }

  // --- embed ---------------------------------------------------------
  // Tokens, not characters: the same length runs ~1100 to ~5700 tokens
  // depending on script, and embedContent answers an over-long input by
  // truncating it silently. A subscriber would then be matched on their
  // resume's opening paragraph forever, with nothing to show that.
  let resumeTokens: number;
  try {
    resumeTokens = await countEmbedTokens(resumeText);
  } catch (error) {
    console.error("[alerts/subscribe] token count failed:", error);
    return fail(502, "upstream_error", "Could not measure that resume. Try again in a moment.");
  }

  if (resumeTokens > MAX_EMBED_TOKENS) {
    const fits = charsThatFit(resumeText, resumeTokens, MAX_EMBED_TOKENS);
    return fail(
      413,
      "resume_too_long",
      `That resume is too long for the embedding model — ${resumeTokens.toLocaleString()} units of ${MAX_EMBED_TOKENS.toLocaleString()}. Trim it to roughly ${fits.toLocaleString()} characters.`,
    );
  }

  let embedding: number[];
  try {
    // RETRIEVAL_QUERY, matching /api/match. Jobs are embedded as documents;
    // using one task type for both measurably hurts ranking, and a resume
    // embedded the wrong way here would score differently in an alert than it
    // does on the site.
    embedding = await embedText(resumeText, "RETRIEVAL_QUERY");
  } catch (error) {
    if (error instanceof EmbeddingError) {
      console.error(`[alerts/subscribe] embedding failed (${error.kind}):`, error.message);
      if (error.kind === "rate_limit") {
        return fail(429, "rate_limited", "Gemini is rate-limiting right now. Try again in a few seconds.");
      }
      if (error.kind === "config") return fail(500, "misconfigured", error.message);
      return fail(502, "embedding_failed", "Could not analyze the resume. Try again.");
    }
    console.error("[alerts/subscribe] unexpected embedding error:", error);
    return fail(500, "internal_error", "Something went wrong analyzing the resume.");
  }

  // --- upsert --------------------------------------------------------
  let alertId: string;
  try {
    const { data, error } = await getSupabaseAdmin()
      .from("job_alerts")
      .upsert(
        {
          telegram_chat_id: rawChatId,
          resume_summary: resumeText,
          resume_embedding: embedding,
          min_match_score: minScore,
          // Resubscribing revives a row that was switched off when the person
          // blocked the bot — otherwise they could never come back.
          is_active: true,
        },
        { onConflict: "telegram_chat_id", ignoreDuplicates: false },
      )
      .select("id")
      .single();

    if (error) {
      if (error.code === "42P01") {
        return fail(
          500,
          "missing_table",
          "The job_alerts table isn't there. Run supabase/migrations/0002_telegram_alerts.sql.",
        );
      }
      if (error.code === "42P10") {
        return fail(
          500,
          "missing_constraint",
          "job_alerts.telegram_chat_id has no UNIQUE constraint. Run supabase/migrations/0002_telegram_alerts.sql.",
        );
      }
      console.error("[alerts/subscribe] upsert failed:", error);
      return fail(502, "database_error", "Could not save the subscription. Try again.");
    }

    alertId = data.id as string;
  } catch (error) {
    console.error("[alerts/subscribe] supabase unreachable:", error);
    const message =
      error instanceof Error && /Missing [A-Z_]+/.test(error.message)
        ? error.message
        : "Could not reach the database. Try again.";
    return fail(503, "database_unreachable", message);
  }

  // --- welcome -------------------------------------------------------
  // Last, so the message is true when it says they are subscribed. If it
  // fails the subscription still stands, so this is reported rather than
  // rolled back — the next sync will reach them.
  const welcomed = await sendTelegramMessage(rawChatId, formatWelcome(minScore), {
    parse_mode: "HTML",
    disablePreview: true,
  });

  return NextResponse.json({
    ok: true,
    id: alertId,
    minScore,
    welcomed,
  });
}
