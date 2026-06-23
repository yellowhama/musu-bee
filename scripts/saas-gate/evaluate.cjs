// SaaS Route Gate (B-3b) — machine enforcement of the self-contained-product
// invariant: musu must run from a user install alone; a NEW line in product code
// must not introduce a REQUIRED dependency on a paid third-party SaaS.
//
// Mirrors scripts/design-gate/evaluate.cjs in shape (a pure evaluator + a CLI
// harness + exports), but scans file CONTENT (added lines) rather than just paths
// — a required-SaaS signal lives in the code, not the filename.
//
// What it flags: an ADDED line in product code (musu-bee/src/**, musu-rs/src/**,
// excluding tests) that references a banned SaaS SDK import or a hardcoded SaaS
// hostname. What it ALLOWS: the two env-gated optional integrations this repo
// already ships (@supabase/supabase-js, @vercel/kv) — they degrade gracefully
// when their env vars are absent, so they are "installer optionality", not a
// required dependency. The OpenAI-COMPATIBLE local protocol (openai_compat,
// /v1/chat/completions against a local bridge) is NOT the SaaS and is not banned;
// only the literal hosted endpoint api.openai.com is.

// Product code surfaces the gate watches (the inverse of design-gate, which
// EXCLUDES route handlers — here API routes ARE the primary concern).
const PRODUCT_PATH_PREFIXES = ["musu-bee/src/", "musu-rs/src/"];

// Never scan test files / fixtures (they legitimately reference fake SaaS hosts).
const TEST_FILE_RE = /(?:^|\/)[^/]*\.(?:test|spec)\.[cm]?[jt]sx?$|(?:^|\/)__tests__\//i;

// Allowed env-gated optional SaaS already shipped (see src/lib/supabase.ts
// isSupabaseConfigured(), src/app/api/waitlist/route.ts isKvConfigured()). These
// import specifiers are NOT violations.
const ALLOWED_OPTIONAL_SPECIFIERS = [
  "@supabase/supabase-js",
  "@supabase/ssr",
  "@vercel/kv",
];

// Banned signals: a required SaaS SDK or a hardcoded hosted SaaS endpoint. Each
// has a label for the violation message. Hostnames are matched as substrings of
// a URL/string literal; SDK specifiers are matched as import/require targets.
const BANNED_SAAS_PATTERNS = [
  { label: "Sentry SDK", re: /["'`]@sentry\/[a-z-]+["'`]/i },
  { label: "AWS SDK", re: /["'`]@?aws-sdk(?:\/[a-z-]+)?["'`]|["'`]aws-sdk["'`]/i },
  { label: "PostHog SDK", re: /["'`]posthog(?:-js|-node)?["'`]/i },
  { label: "Datadog SDK", re: /["'`]@?datadog(?:\/[a-z-]+|-[a-z-]+)?["'`]|["'`]dd-trace["'`]/i },
  { label: "Amplitude SDK", re: /["'`]@?amplitude(?:\/[a-z-]+)?["'`]/i },
  { label: "Mixpanel SDK", re: /["'`]mixpanel(?:-browser)?["'`]/i },
  { label: "Segment SDK", re: /["'`]@segment\/[a-z-]+["'`]/i },
  { label: "OpenAI hosted endpoint", re: /\bapi\.openai\.com\b/i },
  { label: "Anthropic hosted endpoint", re: /\bapi\.anthropic\.com\b/i },
  { label: "Fly.io host", re: /\b[a-z0-9-]+\.fly\.dev\b/i },
  { label: "AWS host", re: /\b[a-z0-9.-]+\.amazonaws\.com\b|\b[a-z0-9-]+\.execute-api\.[a-z0-9-]+\.amazonaws\.com\b/i },
  { label: "Heroku host", re: /\b[a-z0-9-]+\.herokuapp\.com\b/i },
  { label: "Sentry host", re: /\b[a-z0-9-]+\.ingest\.sentry\.io\b|\bsentry\.io\b/i },
];

function isProductFile(file) {
  return (
    PRODUCT_PATH_PREFIXES.some((prefix) => file.startsWith(prefix)) &&
    !TEST_FILE_RE.test(file)
  );
}

// An added line that references an allowed optional specifier is exempt even if a
// banned pattern would otherwise match a substring of it.
function lineIsAllowed(line) {
  return ALLOWED_OPTIONAL_SPECIFIERS.some((spec) => line.includes(spec));
}

function scanLine(line) {
  if (lineIsAllowed(line)) {
    return null;
  }
  for (const { label, re } of BANNED_SAAS_PATTERNS) {
    if (re.test(line)) {
      return label;
    }
  }
  return null;
}

// files: [{ filename: string, addedLines: string[] }]
function evaluateSaasGate({ files }) {
  const list = Array.isArray(files) ? files : [];
  const productFiles = list.filter((f) => f && isProductFile(f.filename));
  const productFilesTouched = productFiles.length > 0;

  const violations = [];
  for (const f of productFiles) {
    const added = Array.isArray(f.addedLines) ? f.addedLines : [];
    for (const line of added) {
      const label = scanLine(line);
      if (label) {
        violations.push({ file: f.filename, token: label, line: line.trim().slice(0, 200) });
      }
    }
  }

  const pass = violations.length === 0;
  return { pass, productFilesTouched, scannedFiles: productFiles.map((f) => f.filename), violations };
}

// ---- CLI harness (mirrors design-gate) ------------------------------------

function parseInputArg(args) {
  const inputIndex = args.indexOf("--input");
  if (inputIndex === -1 || !args[inputIndex + 1]) {
    return null;
  }
  return args[inputIndex + 1];
}

async function readInput(pathArg) {
  if (pathArg) {
    const fs = require("node:fs/promises");
    return fs.readFile(pathArg, "utf8");
  }
  if (process.stdin.isTTY) {
    return JSON.stringify({ files: [] });
  }
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", reject);
  });
}

if (require.main === module) {
  (async () => {
    const args = process.argv.slice(2);
    const inputPath = parseInputArg(args);
    const raw = await readInput(inputPath);
    const payload = JSON.parse(raw || "{}");
    const result = evaluateSaasGate(payload);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exit(result.pass ? 0 : 1);
  })().catch((error) => {
    process.stderr.write(`saas-gate evaluator failed: ${error.message}\n`);
    process.exit(2);
  });
}

module.exports = {
  PRODUCT_PATH_PREFIXES,
  TEST_FILE_RE,
  ALLOWED_OPTIONAL_SPECIFIERS,
  BANNED_SAAS_PATTERNS,
  evaluateSaasGate,
};
