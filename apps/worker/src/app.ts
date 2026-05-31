import { Hono } from "hono";
import type { Env } from "./env";
import { securityHeaders } from "./http/security-headers";
import { toErrorResponse } from "./http/errors";
import { health } from "./routes/health";
import { auth } from "./routes/auth";
import { emailRoutes } from "./routes/emails";
import { accountRoutes } from "./routes/accounts";
import { adminRoutes } from "./routes/admin";

export function createApp() {
  const app = new Hono<{ Bindings: Env }>();

  app.use("*", securityHeaders());
  app.route("/api", health);
  app.route("/api/auth", auth);
  app.route("/api/emails", emailRoutes);
  app.route("/api/accounts", accountRoutes);
  app.route("/api/admin", adminRoutes);

  app.onError((err, c) => {
    const { status, body } = toErrorResponse(err);
    return c.json(body, status as 400);
  });

  app.notFound((c) =>
    c.json({ success: false, error: { code: "NOT_FOUND", message: "Not found" } }, 404),
  );

  return app;
}
