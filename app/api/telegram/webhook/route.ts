import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { escapeHtml, sendTelegramMessage } from "@/lib/telegram";

/**
 * Telegram webhook — what makes the bot answer /start with the chat ID the
 * subscribe form asks for.
 *
 * Without this the bot is mute: a Telegram bot has no outbound way to tell
 * someone their own chat ID, so the alternative is sending people to a
 * third-party bot to look it up, which is both worse and a thing nobody
 * should be taught to do with their account.
 *
 * Register it once per deployment:
 *
 *   curl -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
 *     -H "Content-Type: application/json" \
 *     -d '{"url":"https://<host>/api/telegram/webhook",
 *          "secret_token":"<TELEGRAM_WEBHOOK_SECRET>",
 *          "allowed_updates":["message"]}'
 *
 * Telegram only calls HTTPS URLs, so this does nothing on localhost. For local
 * work, read the chat ID from getUpdates after sending the bot a message:
 *
 *   curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getUpdates"
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Update = {
  message?: {
    chat?: { id?: number; type?: string };
    text?: string;
    from?: { first_name?: string };
  };
};

function secretMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;

  // Refuse rather than run open. The URL is guessable and the handler writes
  // to the database, so an unauthenticated version of this is an endpoint
  // anyone can use to unsubscribe other people.
  if (!expected) {
    console.error("[telegram/webhook] TELEGRAM_WEBHOOK_SECRET is not set; refusing to run.");
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  const provided = request.headers.get("x-telegram-bot-api-secret-token") ?? "";
  if (!provided || !secretMatches(provided, expected)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  let update: Update;
  try {
    update = (await request.json()) as Update;
  } catch {
    return NextResponse.json({ ok: true });
  }

  const chatId = update.message?.chat?.id;
  const text = update.message?.text?.trim() ?? "";
  // Commands arrive as "/start@mm_tech_job_alerts_bot" in groups.
  const command = text.split(/[\s@]/)[0].toLowerCase();

  if (typeof chatId !== "number") return NextResponse.json({ ok: true });
  const chat = String(chatId);

  try {
    if (command === "/stop") {
      await getSupabaseAdmin().from("job_alerts").update({ is_active: false }).eq("telegram_chat_id", chat);
      await sendTelegramMessage(
        chat,
        [
          "🔕 <b>Alerts are off.</b>",
          "",
          "Your resume stays on file. Subscribe again on the site whenever you want them back.",
        ].join("\n"),
        { parse_mode: "HTML", disablePreview: true },
      );
    } else if (command === "/start" || command === "/id") {
      const name = update.message?.from?.first_name;
      await sendTelegramMessage(
        chat,
        [
          `👋 <b>Hi${name ? ` ${escapeHtml(name)}` : ""}!</b>`,
          "",
          "Your Chat ID is:",
          // <code> makes it tap-to-copy in every Telegram client, which is the
          // whole point — this number has to get back into a web form.
          `<code>${chat}</code>`,
          "",
          "Paste it into the alerts form on the site, along with your resume, and I'll message you whenever a matching job is posted.",
        ].join("\n"),
        { parse_mode: "HTML", disablePreview: true },
      );
    } else {
      await sendTelegramMessage(
        chat,
        `Send /start to get your Chat ID, or /stop to turn alerts off.\n\nYour Chat ID is <code>${chat}</code>.`,
        { parse_mode: "HTML", disablePreview: true },
      );
    }
  } catch (error) {
    // Telegram retries anything that isn't a 200, which for a persistent bug
    // means the same update arriving over and over. Log and acknowledge.
    console.error("[telegram/webhook] handler failed:", error);
  }

  return NextResponse.json({ ok: true });
}
