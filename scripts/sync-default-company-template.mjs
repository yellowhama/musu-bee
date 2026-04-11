import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const musuFunctionsRoot = path.resolve(scriptDir, "..");
const musuCorpRoot = process.env.MUSU_CORP_ROOT
  ? path.resolve(process.env.MUSU_CORP_ROOT)
  : path.resolve(musuFunctionsRoot, "..", "musu_corp");

const sourcePath = path.join(
  musuFunctionsRoot,
  "musu-bee",
  "src",
  "lib",
  "templates",
  "defaultCompanyTemplate.json"
);
const destinationPath = path.join(
  musuCorpRoot,
  "templates",
  "company-operating-system",
  "default-company-template.json"
);
const checkOnly = process.argv.includes("--check");

const source = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
const nextContent = `${JSON.stringify(source, null, 2)}\n`;
const currentContent = fs.existsSync(destinationPath)
  ? fs.readFileSync(destinationPath, "utf8")
  : "";

if (checkOnly) {
  if (currentContent !== nextContent) {
    console.error(`template drift detected between ${sourcePath} and ${destinationPath}`);
    process.exit(1);
  }
  console.log(`template sync verified for ${destinationPath}`);
  process.exit(0);
}

fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
fs.writeFileSync(destinationPath, nextContent, "utf8");

console.log(`synced ${sourcePath} -> ${destinationPath}`);
