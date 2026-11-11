import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const config = JSON.parse(readFileSync(resolve(process.cwd(), "wrangler.jsonc"), "utf8"));
const databaseIds = (config.d1_databases ?? []).map((binding) => binding.database_id);
const invalidDatabase = databaseIds.length === 0 || databaseIds.some((id) => !id || /^0{8}-0{4}-0{4}-0{4}-0{12}$/.test(id));
if (invalidDatabase) {
  console.error("Cloudflare deployment stopped: replace the placeholder D1 database_id in this Worker configuration.");
  process.exit(1);
}

if (config.name === "joese-exchange-api") {
  const variables = config.vars ?? {};
  const maxLoan = Number(variables.JOE_BANK_MAX_LOAN_CENTS);
  const defaultRate = Number(variables.JOE_BANK_DEFAULT_RATE_BPS);
  const maxRate = Number(variables.JOE_BANK_MAX_RATE_BPS);
  const validJoeBank = Number.isSafeInteger(maxLoan) && maxLoan > 0
    && Number.isSafeInteger(defaultRate) && defaultRate >= 0
    && Number.isSafeInteger(maxRate) && maxRate >= defaultRate;
  if (!validJoeBank) {
    console.error("Cloudflare deployment stopped: configure valid Joe Bank loan and rate limits in the API Worker.");
    process.exit(1);
  }
}
