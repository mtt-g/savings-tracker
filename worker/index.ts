import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { api } from "./api";
import { requireAccess } from "./auth";
import { syncAll } from "./t212";
import type { AppEnv } from "./types";

/** Must match the first entry in wrangler.jsonc triggers.crons. */
const FULL_SYNC_CRON = "15 6 * * *";

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
  async scheduled(controller, env, ctx) {
    // The 06:15 run is the full sync; the half-hourly market-hours runs only refresh prices.
    ctx.waitUntil(syncAll(env, { history: controller.cron === FULL_SYNC_CRON }));
  },
} satisfies ExportedHandler<Env>;
