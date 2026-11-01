import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { api } from "./api";
import { requireAccess } from "./auth";
import { syncAll } from "./t212";
import type { AppEnv } from "./types";

const app = new Hono<AppEnv>();

app.use("/api/*", requireAccess);
app.use("/api/*", async (c, next) => {
  await next();
  c.header("Cache-Control", "no-store");
});
app.route("/api", api);
app.all("/api/*", (c) => c.json({ error: "Not found" }, 404));

app.onError((err, c) => {
  if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
  console.error(err);
  return c.json({ error: "Internal error" }, 500);
});

export default {
  fetch: app.fetch,
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(syncAll(env));
  },
} satisfies ExportedHandler<Env>;
