# Savings Tracker

A personal savings dashboard for Monzo, Premium Bonds and Trading 212 (Invest, Stocks & Shares ISA, Cash ISA).
React + Material UI front end and a Hono API, running as a single Cloudflare Worker with a D1 (SQLite) database.
It costs nothing on Cloudflare's free plan.

## What it does

- **Dashboard**, filterable by date and defaulting to the current UK tax year (6 April onwards):
  - balance, amount saved, interest, Premium Bond prizes, dividends, investment growth and return
  - balance over time by account, and saved vs earned each month
  - **allowances**: ISA (£20k, plus the £12k Cash ISA limit from 2027/28), Personal Savings Allowance (taxable interest only) and dividend allowance
  - **Premium Bonds**: prizes, your actual rate compared with the prize fund rate, and the £50k limit
  - a per-account breakdown, plus goals
- **Trading 212 sync**: daily at 06:15 UTC, or on demand. It pulls account value, holdings, deposits, withdrawals, interest, fees, transfers and dividends, and backfills the full history over a few runs.
- **CSV import**: detects Trading 212 and Monzo exports automatically, and maps columns for anything else. You preview the rows and can retype them before importing, and re-importing a file doesn't create duplicates.
- Manual transactions and balances, dark mode, and an installable mobile app (PWA).

## How the numbers work

- Money is stored in pence. Dates are UK dates.
- **Balance on a date** = the most recent recorded balance (valuation) on or before that date, plus the transactions after it. Cash accounts don't need valuations. Investment accounts do, and the T212 sync records one every day.
- **Saved** = deposits − withdrawals ± transfers.
- **Growth** = end balance − start balance − saved. **From prices** = growth − interest/dividends/prizes + fees.
- **Return %** is a Modified Dietz return for the period: money-weighted, so deposits made part-way through don't distort it.
- **Rate earned** = (interest + prizes) ÷ average balance, annualised.

Logic lives in `shared/` (tested with `npm test`), the API in `worker/`, and the UI in `src/`.

## Local development

```sh
npm install
cp .dev.vars.example .dev.vars     # ENVIRONMENT=development skips the Access check locally
npm run db:migrate:local
npm run dev                        # http://localhost:5173
```

## Deploying to Cloudflare

1. **Create the database** and paste the printed `database_id` into `wrangler.jsonc`:
   ```sh
   npx wrangler login
   npx wrangler d1 create savings-tracker
   ```
2. **Connect the repo**: in the dashboard go to Workers & Pages → Create → Import a repository. Choose this repo with:
   - Build command: `npm run build`
   - Deploy command: `npm run deploy:ci` (applies any new D1 migrations, then deploys)
   - Production branch: `main`
3. **Lock it down with Cloudflare Access** (free for up to 50 users):
   - Go to Workers & Pages → savings-tracker → **Access** tab → **Protect this Worker behind Access**. Choose **All traffic**.
     Under **Authentication policy** choose **Cloudflare account**, then select **Apply Access**. This covers the `workers.dev`
     URL, preview URLs and any custom domains.
   - Copy the **Application Audience (AUD) Tag** from Zero Trust → Access controls → Applications → the application → Configure → Additional settings.
     Your team domain is the `<team>.cloudflareaccess.com` address on the login page.
   - Put both in the `vars` in `wrangler.jsonc` (`ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`), then push.
     **Until both are set, the API refuses every request.** The Worker checks the Access token on every API call, so
     your data stays private even if the Access setup is wrong.
4. **Add your Trading 212 API keys** as secrets. In the T212 app go to Settings → API, create one key per account, and give it the
   *Account data*, *History* and *Portfolio* read permissions. Don't enable order placement.
   ```sh
   npx wrangler secret put T212_INVEST_KEY
   npx wrangler secret put T212_INVEST_SECRET
   npx wrangler secret put T212_ISA_KEY
   npx wrangler secret put T212_ISA_SECRET
   ```
   Then open each T212 account in the app and press **Sync now**. A long history can take a few presses, because T212
   allows about 20 history requests a minute.

## Notes

- The T212 API covers Invest and Stocks ISA accounts but **not the Cash ISA**. Add its interest by hand or import a CSV.
- Monzo's API needs re-authorising every 90 days, so use CSV exports or add interest by hand.
- NS&I has no API. Add prizes with the + button. If prizes are reinvested, they're already part of the holding. If they're paid out, also add a withdrawal.
- Moving money between your own accounts: record a **transfer out** and a **transfer in**, so it doesn't count as new savings.
  T212 moves between Invest and ISA come through the sync as transfers automatically.
- **Backups**: Settings → Export JSON. D1 Time Travel also allows point-in-time restores for the last 7 days.
- Update the Premium Bonds prize fund rate in Settings when NS&I changes it.
