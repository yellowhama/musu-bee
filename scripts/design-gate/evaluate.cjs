const UI_PATH_PREFIXES = [
  "musu-bee/src/app/",
  "musu-bee/src/components/",
  "musu-bee/src/pages/",
  "musu-bee/src/styles/",
  "musu-bee/public/",
];

const API_PATH_PREFIXES = ["musu-bee/src/app/api/"];

const NEXT_APP_ROUTE_HANDLER_RE =
  /^musu-bee\/src\/app\/(?:.*\/)?route\.[jt]sx?$/;
const TEST_FILE_RE = /(?:^|\/)[^/]+\.(?:test|spec)\.[jt]sx?$/;

// Approval must be an explicit status line. Mentions inside prose, checklists,
// or backticks such as "change this to `Design: Approved`" are instructions,
// not approval evidence.
const DESIGN_APPROVED_TOKEN_RE = /^\s*Design:\s*Approved\s*$/im;
const URL_RE = /https?:\/\/[^\s)]+/gi;
// Design-brief issue URL. musu uses its own trackers (musu-system / musu-brain /
// musu-website-co GitHub issues) — Paperclip was dropped, so a plain numeric
// GitHub `/issues/<n>` path is accepted alongside the legacy `MUS-<n>` and UUID
// forms. The gate's intent is unchanged: a real brief issue URL must be present.
const DESIGN_BRIEF_ISSUE_URL_RE =
  /\/issues\/(?:MUS-\d+|[0-9a-fA-F-]{36}|\d+)(?:[/?#]|$)/i;
const ARTIFACT_URL_RE = /\.(?:pen|png)(?:[?#][^\s)]*)?$/i;
const APPROVAL_COMMENT_URL_RE =
  /github\.com\/[^/\s)]+\/[^/\s)]+\/issues\/\d+#issuecomment-\d+(?:[/?#][^\s)]*)?$/i;

function extractUrls(text) {
  if (!text) {
    return [];
  }
  return Array.from(text.matchAll(URL_RE), (match) => match[0]);
}

function evaluateDesignGate({ changedFiles, prBody }) {
  const files = Array.isArray(changedFiles) ? changedFiles : [];
  const body = typeof prBody === "string" ? prBody : "";
  const urls = extractUrls(body);

  const matchedUiFiles = files.filter(
    (file) =>
      UI_PATH_PREFIXES.some((prefix) => file.startsWith(prefix)) &&
      !API_PATH_PREFIXES.some((prefix) => file.startsWith(prefix)) &&
      !NEXT_APP_ROUTE_HANDLER_RE.test(file) &&
      !TEST_FILE_RE.test(file)
  );
  const uiTouched = matchedUiFiles.length > 0;

  const checks = {
    hasDesignApprovedToken: DESIGN_APPROVED_TOKEN_RE.test(body),
    hasDesignBriefIssueReference: urls.some((url) =>
      DESIGN_BRIEF_ISSUE_URL_RE.test(url)
    ),
    hasArtifactLink: urls.some((url) => ARTIFACT_URL_RE.test(url)),
    hasApprovalCommentUrl: urls.some((url) =>
      APPROVAL_COMMENT_URL_RE.test(url)
    ),
  };

  const missingRequirements = [];
  if (!checks.hasDesignApprovedToken) {
    missingRequirements.push("`Design: Approved` token");
  }
  if (!checks.hasDesignBriefIssueReference) {
    missingRequirements.push("design brief issue URL");
  }
  if (!checks.hasArtifactLink) {
    missingRequirements.push("artifact URL ending in `.pen` or `.png`");
  }
  if (!checks.hasApprovalCommentUrl) {
    missingRequirements.push("approval issue comment URL");
  }

  const pass = !uiTouched || missingRequirements.length === 0;

  return {
    pass,
    uiTouched,
    matchedUiFiles,
    checks,
    missingRequirements,
  };
}

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
    return JSON.stringify({ changedFiles: [], prBody: "" });
  }

  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.on("end", () => {
      resolve(data);
    });
    process.stdin.on("error", reject);
  });
}

if (require.main === module) {
  (async () => {
    const args = process.argv.slice(2);
    const inputPath = parseInputArg(args);
    const raw = await readInput(inputPath);
    const payload = JSON.parse(raw || "{}");
    const result = evaluateDesignGate(payload);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exit(result.pass ? 0 : 1);
  })().catch((error) => {
    process.stderr.write(`design-gate evaluator failed: ${error.message}\n`);
    process.exit(2);
  });
}

module.exports = {
  API_PATH_PREFIXES,
  NEXT_APP_ROUTE_HANDLER_RE,
  TEST_FILE_RE,
  UI_PATH_PREFIXES,
  APPROVAL_COMMENT_URL_RE,
  evaluateDesignGate,
};
