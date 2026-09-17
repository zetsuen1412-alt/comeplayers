import fs from "node:fs";
import path from "node:path";
import { adminLocaleContract } from "../../website/tests/helpers/adminLocaleContracts";

// Run from website, before applying translated UI copy.
const fixtures: Record<string, string[]> = {};
function walk(directory: string) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (/\.tsx?$/.test(file)) fixtures[file] = adminLocaleContract(fs.readFileSync(file, "utf8"), file);
  }
}
["app/admin", "components/admin", "features/payroll"].forEach(walk);
const wallet = "components/wallet/AdminWalletPayments.tsx";
fixtures[wallet] = adminLocaleContract(fs.readFileSync(wallet, "utf8"), wallet);
if (Object.keys(fixtures).length !== 110) throw new Error("Unexpected baseline file count; review new admin sources before applying.");
fs.mkdirSync("tests/fixtures", { recursive: true });
fs.writeFileSync("tests/fixtures/adminLocaleContracts.json", JSON.stringify(fixtures, null, 2) + "\n");
console.log(`Recorded ${Object.keys(fixtures).length} original machine contracts.`);
