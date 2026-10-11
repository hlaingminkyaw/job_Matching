type Block = { type: "paragraph"; text: string } | { type: "list"; items: string[] };

/**
 * Posting text arrives as plain text from the database. Blank lines separate
 * blocks, consecutive lines starting with "-", "*" or "•" become a list, and
 * everything else joins into a paragraph.
 */
export function parseDescription(text: string): Block[] {
  const blocks: Block[] = [];

  for (const chunk of text.split(/\n{2,}/)) {
    let paragraph: string[] = [];
    let items: string[] = [];

    const flushParagraph = () => {
      if (paragraph.length) {
        blocks.push({ type: "paragraph", text: paragraph.join(" ") });
        paragraph = [];
      }
    };
    const flushList = () => {
      if (items.length) {
        blocks.push({ type: "list", items });
        items = [];
      }
    };

    for (const raw of chunk.split("\n")) {
      const line = raw.trim();
      if (!line) continue;

      const bullet = /^[-*•]\s+(.*)$/.exec(line);
      if (bullet) {
        flushParagraph();
        items.push(bullet[1]);
      } else {
        flushList();
        paragraph.push(line);
      }
    }

    flushParagraph();
    flushList();
  }

  return blocks;
}

/** The first paragraph, for the collapsed card. */
export function leadParagraph(text: string): string {
  const first = parseDescription(text).find((block) => block.type === "paragraph");
  return first?.type === "paragraph" ? first.text : text;
}

export function JobDescription({ text }: { text: string }) {
  const blocks = parseDescription(text);

  return (
    <div className="flex flex-col gap-4">
      {blocks.map((block, index) =>
        block.type === "list" ? (
          <ul key={index} className="flex flex-col gap-2">
            {block.items.map((item) => (
              <li key={item} className="flex gap-2.5 text-sm leading-6">
                <span
                  aria-hidden="true"
                  className="mt-[11px] size-1 shrink-0 rounded-full bg-line-strong"
                />
                <span className="min-w-0">{item}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p key={index} className="text-sm leading-6 text-muted">
            {block.text}
          </p>
        ),
      )}
    </div>
  );
}
