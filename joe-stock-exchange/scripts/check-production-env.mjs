import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function readEnvironmentFile() {
  try {
    return Object.fromEntries(
      readFileSync(resolve(process.cwd(), ".env.production"), "utf8")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("#") && line.includes("="))
        .map((line) => {
          const separator = line.indexOf("=");
          return [line.slice(0, separator).trim(), line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "")];
        }),
    );
  } catch {
    return {};
  }
}

const values = { ...readEnvironmentFile(), ...process.env };
const problems = [];
if (!String(values.VITE_API_BASE_URL ?? "").startsWith("https://")) {
  problems.push("VITE_API_BASE_URL must be the production HTTPS API URL.");
}
if (values.VITE_DEMO_MODE !== "false") {
  problems.push("VITE_DEMO_MODE must be false.");
}
if (!values.VITE_TURNSTILE_SITE_KEY || values.VITE_TURNSTILE_SITE_KEY === "replace-with-the-public-site-key") {
  problems.push("VITE_TURNSTILE_SITE_KEY must contain the production public site key.");
}
if (problems.length) {
  console.error(`Production environment check failed:\n- ${problems.join("\n- ")}`);
  process.exit(1);
}
