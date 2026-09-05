import { createClient, createAccount } from "genlayer-js";
import { readFileSync } from "fs";

const CHAIN = {
  id: 61999,
  name: "Genlayer Studio Network",
  rpcUrls: { default: { http: ["https://studio.genlayer.com/api"] } },
  nativeCurrency: { name: "GEN Token", symbol: "GEN", decimals: 18 },
};
const ENDPOINT = "https://studio.genlayer.com/api";
const CONTRACT = "0x4116cf085764E4E53d78408B488B8BAFb5cAE948";

function loadEnv() {
  try {
    const lines = readFileSync(".env.seed", "utf8").split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq > 0) process.env[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
    }
  } catch {
    console.error("Missing .env.seed — copy .env.seed.example to .env.seed and fill in keys");
    process.exit(1);
  }
}

loadEnv();

function normalizeKey(raw) {
  if (!raw) return null;
  let k = raw.trim().replace(/^["']|["']$/g, "");
  if (!k.startsWith("0x") && !k.startsWith("0X")) k = "0x" + k;
  return k.toLowerCase();
}

const pk1 = normalizeKey(process.env.PRIVATE_KEY_1);
const pk2 = normalizeKey(process.env.PRIVATE_KEY_2);
if (!pk1 || !pk2) {
  console.error("Set PRIVATE_KEY_1 and PRIVATE_KEY_2 in .env.seed");
  process.exit(1);
}

const account1 = createAccount(pk1);
const account2 = createAccount(pk2);
const client1 = createClient({ chain: CHAIN, endpoint: ENDPOINT, account: account1 });
const client2 = createClient({ chain: CHAIN, endpoint: ENDPOINT, account: account2 });

async function write(client, fn, args, value = 0n, label = "") {
  console.log(`\n>>> ${label || fn}...`);
  try {
    const result = await client.writeContract({
      address: CONTRACT,
      functionName: fn,
      args,
      value,
    });
    console.log(`    OK:`, JSON.stringify(result).slice(0, 200));
    return result;
  } catch (e) {
    console.error(`    FAIL:`, e.message?.slice(0, 200) || e);
    return null;
  }
}

async function read(fn, args) {
  try {
    const r = await client1.readContract({ address: CONTRACT, functionName: fn, args });
    return typeof r === "string" ? r : String(r);
  } catch (e) {
    return null;
  }
}

async function main() {
  console.log("=== Death of the Author — Seed Script ===");
  console.log(`Wallet 1: ${account1.address}`);
  console.log(`Wallet 2: ${account2.address}`);
  console.log(`Contract: ${CONTRACT}`);

  const countBefore = parseInt(await read("get_claim_count", []) || "0", 10);
  console.log(`\nExisting claims: ${countBefore}`);

  // Claim A: clearly similar works (expect SUBSTANTIALLY_SIMILAR)
  await write(client1, "file_claim", [
    "https://en.wikipedia.org/wiki/Copyright",
    "https://en.wikipedia.org/wiki/Copyright_law_of_the_United_States",
    "The accused work reproduces substantial portions of the original article's structure, phrasing, and legal analysis of copyright principles."
  ], 100n * 10n ** 18n, "Claim A — similar works (bond 100 GEN)");

  // Claim B: completely different works (expect INDEPENDENT)
  await write(client1, "file_claim", [
    "https://en.wikipedia.org/wiki/Python_(programming_language)",
    "https://en.wikipedia.org/wiki/Chocolate_cake",
    "Testing whether AI correctly identifies unrelated content as independent works."
  ], 100n * 10n ** 18n, "Claim B — unrelated works (bond 100 GEN)");

  // Claim C: related but not copied (for respond + adjudicate flow)
  await write(client1, "file_claim", [
    "https://en.wikipedia.org/wiki/Artificial_intelligence",
    "https://en.wikipedia.org/wiki/Machine_learning",
    "The accused work covers overlapping subject matter and may borrow from the original's explanations of AI concepts."
  ], 100n * 10n ** 18n, "Claim C — related works for response flow (bond 100 GEN)");

  // Wallet 2 responds to Claim C
  const claimCId = String(countBefore + 2);
  await write(client2, "respond", [
    claimCId,
    "Machine learning is a distinct subfield of AI. My work covers different algorithms and applications. Any overlap reflects shared foundational concepts in the public domain, not copying of expression."
  ], 0n, `Respond to Claim #${claimCId} from wallet 2`);

  // Adjudicate all three (nondet — 30-120s each)
  console.log("\n=== Adjudicating (AI consensus — may take 1-3 minutes each) ===");

  const claimAId = String(countBefore);
  const claimBId = String(countBefore + 1);

  await write(client1, "adjudicate", [claimAId], 0n, `Adjudicate Claim #${claimAId} (similar)`);
  await write(client1, "adjudicate", [claimBId], 0n, `Adjudicate Claim #${claimBId} (unrelated)`);
  await write(client1, "adjudicate", [claimCId], 0n, `Adjudicate Claim #${claimCId} (responded)`);

  // Verify
  console.log("\n=== Final state ===");
  const countAfter = parseInt(await read("get_claim_count", []) || "0", 10);
  for (let i = countBefore; i < countAfter; i++) {
    const raw = await read("get_claim", [String(i)]);
    if (raw) {
      const c = JSON.parse(raw);
      console.log(`Claim #${i}: status=${c.status} verdict=${c.verdict} similarity=${c.similarity_pct}%`);
    }
  }
  console.log("\nDone. Check https://death-of-the-author.vercel.app");
}

main().catch(console.error);
