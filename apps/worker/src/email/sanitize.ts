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

// Allowlist of URL schemes. Anything with another explicit scheme
// (javascript:, data:, vbscript:, blob:, file:, ...) is stripped. Relative and
// anchor URLs (no scheme) are allowed.
const ALLOWED_URL_SCHEMES = new Set(["http:", "https:", "mailto:"]);

function hasDisallowedScheme(value: string): boolean {
  const match = /^\s*([a-z][a-z0-9+.-]*:)/i.exec(value);
  if (!match) return false; // no scheme → relative/anchor URL, allowed
  return !ALLOWED_URL_SCHEMES.has(match[1]!.toLowerCase());
}

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
        } else if (URL_ATTRS.has(n) && hasDisallowedScheme(value ?? "")) {
          toRemove.push(name);
        }
      }
      for (const a of toRemove) el.removeAttribute(a);
    },
  });

  const transformed = rewriter.transform(new Response(html));
  return await transformed.text();
}
