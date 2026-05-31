import { createApp } from "./app";
import type { Env } from "./env";
import { ingestEmail } from "./email/receive";

const app = createApp();

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext): Response | Promise<Response> {
    return app.fetch(request, env, ctx);
  },
  async email(message: ForwardableEmailMessage, env: Env): Promise<void> {
    const raw = await new Response(message.raw).arrayBuffer();
    await ingestEmail(env, message.to, raw);
  },
} satisfies ExportedHandler<Env>;
