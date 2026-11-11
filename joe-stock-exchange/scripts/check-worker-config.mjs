import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const config = JSON.parse(readFileSync(resolve(process.cwd(), "wrangler.jsonc"), "utf8"));
const databaseIds = (config.d1_databases ?? []).map((binding) => binding.database_id);
const invalidDatabase = databaseIds.length === 0 || databaseIds.some((id) => !id || /^0{8}-0{4}-0{4}-0{4}-0{12}$/.test(id));
if (invalidDatabase) {
  console.error("Cloudflare deployment stopped: replace the placeholder D1 database_id in this Worker configuration.");
  process.exit(1);
}
