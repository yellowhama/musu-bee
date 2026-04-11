import fs from "node:fs";
import path from "node:path";

const sourcePath = "/home/hugh51/musu-functions/musu-bee/src/lib/templates/defaultCompanyTemplate.json";
const destinationPath = "/home/hugh51/musu_corp/templates/company-operating-system/default-company-template.json";

const source = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
fs.writeFileSync(destinationPath, `${JSON.stringify(source, null, 2)}\n`, "utf8");

console.log(`synced ${sourcePath} -> ${destinationPath}`);
