/**
 * Telegram Bot API transport.
 *
 * Server-only — it holds TELEGRAM_BOT_TOKEN, which is as good as the bot
 * itself. Import it from route handlers, lib/job-alerts.ts and scripts, never
 * from a component. The one browser-safe value here is the bot *username*,
 * which is public by definition; it lives in NEXT_PUBLIC_TELEGRAM_BOT_USERNAME
 * and is read directly in the component rather than through this module.
 *
 * Nothing in here throws on a delivery failure. A subscriber blocking the bot
 * must not take down a sync, so every call returns a result the caller can
 * branch on.
 */

const API_BASE = "https://api.telegram.org";

/** Telegram's hard cap on a single message. Longer bodies are rejected. */
const MAX_MESSAGE_CHARS = 4_096;

/** Per-request ceiling. Telegram is usually instant; a hang must not block a sync. */
const REQUEST_TIMEOUT_MS = 10_000;

export type TelegramSendOptions = {
  parse_mode?: "HTML" | "Markdown";
  /** Link previews are on by default and turn every alert into a giant card. */
  disablePreview?: boolean;
};

export type TelegramResult = {
  ok: boolean;
  /** Telegram's error_code, or the HTTP status when there was no JSON body. */
  status?: number;
  /** Telegram's `description`, verbatim — it is the only useful diagnostic. */
  description?: string;
  /**
   * The chat can never be reached again: blocked, deactivated, or the bot was
   * kicked. Distinct from a transient failure — the caller should stop writing
   * to this chat rather than retry it tomorrow.
   */
  unreachable?: boolean;
  /** Seconds Telegram asked us to wait, on a 429. */
  retryAfter?: number;
};

function botToken(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new Error(
      "Missing TELEGRAM_BOT_TOKEN. Add it to .env.local (see .env.example) and restart the dev server.",
    );
  }
  return token;
}

/** Whether alerts can be sent at all, without throwing to find out. */
export function telegramConfigured(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN);
}

/**
 * A Telegram chat ID is a 64-bit integer. Users are positive; groups and
 * channels are negative, and supergroup IDs run to 13 digits with the sign.
 *
 * Anything outside that is a typo, a username someone pasted instead of an ID,
 * or an injection attempt — and a bad ID costs an embedding request to find
 * out about, so it is worth rejecting before the expensive work.
 */
export function isValidChatId(value: string): boolean {
  return /^-?[1-9]\d{0,18}$/.test(value.trim());
}

/**
 * Escape text before it goes into an HTML-parsed message.
 *
 * Job titles and company names come from a scraped feed. An unescaped `&` or a
 * stray `<` makes Telegram reject the whole message with "can't parse entities"
 * — the alert silently never arrives — so this is a correctness fix, not just
 * hygiene.
 */
export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** One Bot API method call. Resolves to a result; never rejects. */
async function call(method: string, body: unknown): Promise<TelegramResult> {
  let token: string;
  try {
    token = botToken();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[telegram] ${method}: ${message}`);
    return { ok: false, description: message };
  }

  try {
    const response = await fetch(`${API_BASE}/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    const payload = (await response.json().catch(() => null)) as {
      ok?: boolean;
      error_code?: number;
      description?: string;
      parameters?: { retry_after?: number };
    } | null;

    if (payload?.ok) return { ok: true, status: response.status };

    const status = payload?.error_code ?? response.status;
    const description = payload?.description ?? `HTTP ${response.status}`;

    // 403 is always permanent: blocked, or the user deleted their account.
    // 400 covers both "chat not found" (permanent — wrong ID, or they never
    // pressed Start) and malformed-request cases, which are our bug; the
    // description is the only thing that separates them.
    const unreachable =
      status === 403 ||
      (status === 400 && /chat not found|user is deactivated|group chat was (upgraded|deleted)/i.test(description));

    return {
      ok: false,
      status,
      description,
      unreachable,
      retryAfter: payload?.parameters?.retry_after,
    };
  } catch (error) {
    // Timeout, DNS, TLS — transient by assumption, so not marked unreachable.
    const description = error instanceof Error ? error.message : String(error);
    console.error(`[telegram] ${method} request failed:`, description);
    return { ok: false, description };
  }
}

/** sendMessage with the full result, for callers that act on *why* it failed. */
export async function sendTelegramMessageResult(
  chatId: string,
  text: string,
  options: TelegramSendOptions = {},
): Promise<TelegramResult> {
  // Telegram rejects an over-long message outright rather than trimming it.
  // Cutting at a line break keeps a truncated alert readable, and the ellipsis
  // marks that something was dropped rather than the posting simply ending.
  let body = text;
  if (body.length > MAX_MESSAGE_CHARS) {
    const cut = body.lastIndexOf("\n", MAX_MESSAGE_CHARS - 2);
    body = `${body.slice(0, cut > MAX_MESSAGE_CHARS / 2 ? cut : MAX_MESSAGE_CHARS - 2)}…`;
  }

  const result = await call("sendMessage", {
    chat_id: chatId,
    text: body,
    parse_mode: options.parse_mode,
    link_preview_options: options.disablePreview ? { is_disabled: true } : undefined,
  });

  if (!result.ok) {
    console.error(
      `[telegram] sendMessage to ${chatId} failed (${result.status ?? "no status"}): ${result.description}`,
    );
  }
  return result;
}

/**
 * Send one message. `true` means Telegram accepted it.
 *
 * Use sendTelegramMessageResult when the failure reason matters — a blocked
 * subscriber should be deactivated, a rate limit should not be.
 */
export async function sendTelegramMessage(
  chatId: string,
  text: string,
  options: TelegramSendOptions = {},
): Promise<boolean> {
  const { ok } = await sendTelegramMessageResult(chatId, text, options);
  return ok;
}

/**
 * Whether the bot can write to this chat, before anything expensive happens.
 *
 * A bot cannot open a conversation — the person has to press Start first — so
 * the single most common subscription failure is a valid-looking ID the bot is
 * not allowed to message. Checking here costs one cheap call and saves an
 * embedding request plus a row that could never be delivered to.
 */
export async function checkTelegramChat(chatId: string): Promise<TelegramResult> {
  return call("getChat", { chat_id: chatId });
}

/* ------------------------------------------------------------------ *
 * Message templates
 * ------------------------------------------------------------------ */

export type MatchAlert = {
  jobTitle: string;
  company: string;
  location?: string;
  /** 0-100, the same number the match badge shows. */
  score: number;
  /** Plain-English reasons this posting fits. Rendered as bullets. */
  highlights: string[];
  /** Where to read the posting. Already resolved — never a dead path. */
  url: string;
  salary?: string;
};

/** 80% and up earns the green circle; everything else is a solid fit. */
function scoreIcon(score: number): string {
  return score >= 80 ? "🟢" : "🟡";
}

/**
 * One match, as an HTML-parsed Telegram message.
 *
 * Everything interpolated is escaped: titles, companies and salaries are
 * scraped strings, and a single raw `&` in a company name would make Telegram
 * reject the message rather than render it oddly.
 */
export function formatMatchAlert(alert: MatchAlert): string {
  const lines = [
    `${scoreIcon(alert.score)} <b>${alert.score}% match</b> — new posting`,
    "",
    `<b>${escapeHtml(alert.jobTitle)}</b>`,
    escapeHtml([alert.company, alert.location].filter(Boolean).join(" · ")),
  ];

  if (alert.salary) lines.push(`💰 ${escapeHtml(alert.salary)}`);

  if (alert.highlights.length) {
    lines.push("", "<b>Why it fits you</b>");
    for (const highlight of alert.highlights) {
      lines.push(`• ${escapeHtml(highlight)}`);
    }
  }

  lines.push("", `<a href="${escapeHtml(alert.url)}">View the posting →</a>`);
  return lines.join("\n");
}

/** Sent once, when someone subscribes. */
export function formatWelcome(minScore: number): string {
  return [
    "🚀 <b>You are now subscribed to Myanmar Tech Job Alerts!</b>",
    "",
    "We'll notify you whenever a job matching your skills is posted.",
    "",
    `Right now you'll hear about anything scoring <b>${Math.round(minScore * 100)}%</b> or higher ` +
      "against the resume you submitted. Postings are checked once a day.",
    "",
    "<i>Send /stop any time to turn alerts off.</i>",
  ].join("\n");
}
