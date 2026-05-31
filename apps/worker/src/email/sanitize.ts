const DROP_TAGS = [
  "script",
  "iframe",
  "object",
  "embed",
  "link",
  "meta",
  "base",
  "form",
  "style",
] as const;

const URL_ATTRS = new Set(["href", "src", "action", "formaction", "background"]);

export async function sanitizeEmailHtml(html: string): Promise<string> {
  let rewriter = new HTMLRewriter();

  for (const tag of DROP_TAGS) {
    rewriter = rewriter.on(tag, {
      element(el) {
        el.remove();
      },
    });
  }

  rewriter = rewriter.on("*", {
    element(el) {
      const toRemove: string[] = [];
      for (const [name, value] of el.attributes) {
        if (!name) continue;
        const n = name.toLowerCase();
        if (n.startsWith("on")) {
          toRemove.push(name);
        } else if (URL_ATTRS.has(n) && /^\s*javascript:/i.test(value ?? "")) {
          toRemove.push(name);
        }
      }
      for (const a of toRemove) el.removeAttribute(a);
    },
  });

  const transformed = rewriter.transform(new Response(html));
  return await transformed.text();
}
