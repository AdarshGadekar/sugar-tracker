// Writes public/config.js from SUPABASE_URL and SUPABASE_ANON_KEY env vars (Render build step).
import { writeFileSync } from "node:fs";

const { SUPABASE_URL, SUPABASE_ANON_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error("Set SUPABASE_URL and SUPABASE_ANON_KEY");
  process.exit(1);
}
writeFileSync(
  new URL("../public/config.js", import.meta.url),
  `window.SUGAR_CONFIG = ${JSON.stringify({ SUPABASE_URL, SUPABASE_ANON_KEY })};\n`,
);
console.log("public/config.js written");
