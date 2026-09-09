// Deploy contracts/contract.py to studionet.
//
// Usage:
//   source ~/.genlayer/env.sh          # exports GENLAYER_PRIVATE_KEY
//   node scripts/deploy/deploy.mjs
//
// Reads the deployer key from GENLAYER_PRIVATE_KEY (central keystore) and
// prints the freshly deployed contract address, which you then paste into
// frontend/src/config.ts (DEFAULT_CONTRACT_ADDRESS) and the READMEs.
//
// genlayer-js is resolved from frontend/node_modules, so run it after
// `npm install` inside frontend/.

import { readFileSync } from "fs";
import { fileURLToPath, pathToFileURL } from "url";
import { dirname, resolve } from "path";
import { createRequire } from "module";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..");

// genlayer-js lives in frontend/node_modules; resolve it from there so this
// script can sit under scripts/ without its own node_modules.
const req = createRequire(resolve(REPO_ROOT, "frontend", "package.json"));
const glMain = pathToFileURL(req.resolve("genlayer-js")).href;
const glChains = pathToFileURL(req.resolve("genlayer-js/chains")).href;
const { createClient, createAccount } = await import(glMain);
const { studionet } = await import(glChains);
const CONTRACT_PATH = resolve(REPO_ROOT, "contracts", "contract.py");
const ENDPOINT = "https://studio.genlayer.com/api";

function normalizeKey(raw) {
  if (!raw) return null;
  let k = raw.trim().replace(/^["']|["']$/g, "");
  if (!k.startsWith("0x") && !k.startsWith("0X")) k = "0x" + k;
  return k;
}

const pk = normalizeKey(process.env.GENLAYER_PRIVATE_KEY);
if (!pk) {
  console.error("GENLAYER_PRIVATE_KEY not set. Run: source ~/.genlayer/env.sh");
  process.exit(1);
}

const account = createAccount(pk);
const client = createClient({ chain: studionet, endpoint: ENDPOINT, account });

const code = readFileSync(CONTRACT_PATH, "utf8");

console.log("=== Deploy Death of the Author ===");
console.log("Deployer:", account.address);
console.log("Contract:", CONTRACT_PATH, `(${code.length} bytes)`);
console.log("Network : studionet", ENDPOINT);

const txHash = await client.deployContract({ code, args: [] });
console.log("\nDeploy tx:", txHash);

const receipt = await client.waitForTransactionReceipt({
  hash: txHash,
  status: "FINALIZED",
  retries: 200,
  interval: 3000,
});

const addr =
  receipt?.data?.contract_address ||
  receipt?.contract_address ||
  receipt?.data?.contractAddress ||
  receipt?.contractAddress ||
  receipt?.to_address ||
  null;

const execName = receipt?.txExecutionResultName || receipt?.status || "?";
console.log("Execution:", execName);

if (!addr) {
  console.log("\nCould not read contract address from receipt. Raw receipt:");
  console.log(JSON.stringify(receipt, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2).slice(0, 4000));
  process.exit(2);
}

console.log("\n✅ Deployed contract address:");
console.log(addr);
