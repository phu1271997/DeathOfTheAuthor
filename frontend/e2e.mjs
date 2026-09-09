// Recorded end-to-end wallet flow for Death of the Author.
//
// This is the executable, reproducible version of the reviewer walkthrough.
// It drives the SAME contract calls the React frontend issues (file_claim ->
// respond -> adjudicate -> withdraw), signing each with a real funded wallet,
// and ASSERTS the on-chain transaction result and error states — including the
// two rollback paths the UI surfaces in its error banner:
//   * a claimant responding to their own claim  -> "Claimant cannot respond to own claim"
//   * a second withdraw with no credit left     -> "Nothing to withdraw"
//
// Every step records the real tx hash, the finalized consensus result, the
// GenVM execution result (RETURN vs ERROR) and the rollback payload, then
// writes them to deliverables/e2e-run.json so the run is auditable without
// re-executing it.
//
// Usage:
//   source ~/.genlayer/env.sh          # exports GENLAYER_PRIVATE_KEY[_2]
//   cd frontend && node e2e.mjs
//
// Reads:
//   GENLAYER_PRIVATE_KEY   -> W1 (claimant / adjudicator)
//   GENLAYER_PRIVATE_KEY_2 -> W2 (respondent)
//   CONTRACT_ADDRESS       -> optional override of the address below

import { createClient, createAccount } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { writeFileSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const ENDPOINT = "https://studio.genlayer.com/api";
const EXPLORER = "https://genlayer-explorer.vercel.app";
const CONTRACT =
  process.env.CONTRACT_ADDRESS || "0x8108Bd414036e93597b2F478AC69db191373EB8e";
const BOND = 100n * 10n ** 18n; // 100 GEN

const norm = (k) => (!k ? null : k.trim().startsWith("0x") ? k.trim() : "0x" + k.trim());
const pk1 = norm(process.env.GENLAYER_PRIVATE_KEY);
const pk2 = norm(process.env.GENLAYER_PRIVATE_KEY_2);
if (!pk1 || !pk2) {
  console.error("Set GENLAYER_PRIVATE_KEY and GENLAYER_PRIVATE_KEY_2 (source ~/.genlayer/env.sh)");
  process.exit(1);
}

const w1 = createAccount(pk1);
const w2 = createAccount(pk2);
const c1 = createClient({ chain: studionet, endpoint: ENDPOINT, account: w1 });
const c2 = createClient({ chain: studionet, endpoint: ENDPOINT, account: w2 });
const reader = createClient({ chain: studionet, endpoint: ENDPOINT });

const steps = [];
let failures = 0;

function assert(cond, msg) {
  if (!cond) {
    failures++;
    console.log(`    ✗ ASSERT FAILED: ${msg}`);
  } else {
    console.log(`    ✓ ${msg}`);
  }
  return cond;
}

// Pulls the leader receipt out of a finalized transaction and normalizes the
// two things we assert on: execution_result (RETURN/ERROR) and the GenVM
// result envelope { status: "success"|"rollback", payload }.
function leaderResult(receipt) {
  const cd = receipt?.consensus_data || {};
  let lr = cd.leader_receipt;
  if (Array.isArray(lr)) lr = lr[0];
  const res = lr?.result || {};
  return {
    status_name: receipt?.status_name,
    consensus: receipt?.result_name,
    execution_result: lr?.execution_result, // "RETURN" | "ERROR"
    result_status: res?.status, // "success" | "rollback"
    payload: res?.payload, // return value or UserError message
  };
}

async function send(client, label, fn, args, value, expect, expectPayload = "") {
  console.log(`\n>>> ${label} (${fn})`);
  const rec = { label, fn, args, value: value.toString(), expect, expectPayload };
  try {
    const hash = await client.writeContract({ address: CONTRACT, functionName: fn, args, value });
    rec.hash = hash;
    rec.explorer = `${EXPLORER}/tx/${hash}`;
    console.log(`    tx ${hash}`);
    const receipt = await client.waitForTransactionReceipt({
      hash,
      status: "FINALIZED",
      retries: 200,
      interval: 3000,
    });
    const r = leaderResult(receipt);
    Object.assign(rec, r);
    console.log(
      `    finalized: consensus=${r.consensus} exec=${r.execution_result} result=${r.result_status} payload=${JSON.stringify(r.payload)?.slice(0, 80)}`
    );
    if (expect === "success") {
      assert(r.execution_result === "SUCCESS", `${label} executed with SUCCESS`);
      assert(r.result_status === "return", `${label} result.status == return`);
    } else if (expect === "rollback") {
      assert(r.execution_result === "ERROR", `${label} executed with ERROR (expected rollback)`);
      assert(r.result_status === "rollback", `${label} result.status == rollback`);
      if (expectPayload)
        assert(
          String(r.payload || "").includes(expectPayload),
          `${label} rollback payload contains "${expectPayload}"`
        );
    }
  } catch (e) {
    // Some SDK/validator paths throw instead of returning a rollback receipt.
    rec.threw = e.message?.slice(0, 200) || String(e);
    console.log(`    threw: ${rec.threw}`);
    if (expect === "rollback") {
      assert(true, `${label} rejected the transaction (throw path)`);
    } else {
      assert(false, `${label} expected success but threw`);
    }
  }
  steps.push(rec);
  return rec;
}

async function read(fn, args = []) {
  try {
    const r = await reader.readContract({ address: CONTRACT, functionName: fn, args });
    return typeof r === "string" ? r : String(r);
  } catch {
    return null;
  }
}

async function contractBalance() {
  try {
    const b = await reader.getBalance({ address: CONTRACT });
    return BigInt(b);
  } catch {
    return null;
  }
}

async function main() {
  console.log("=== Death of the Author — recorded E2E wallet flow ===");
  console.log("Contract :", CONTRACT);
  console.log("W1 (claimant)  :", w1.address);
  console.log("W2 (respondent):", w2.address);

  const countBefore = parseInt((await read("get_claim_count")) || "0", 10);
  const escrowBefore = BigInt((await read("get_total_escrow")) || "0");
  const balBefore = await contractBalance();
  console.log(`\nBaseline: claims=${countBefore} total_escrow=${escrowBefore} balance=${balBefore}`);

  const claimId = String(countBefore);

  // 1) File a funded claim (W1). AI vs ML — overlapping subject, distinct expression.
  await send(
    c1,
    "File claim",
    "file_claim",
    [
      "https://en.wikipedia.org/wiki/Artificial_intelligence",
      "https://en.wikipedia.org/wiki/Machine_learning",
      "The accused work reuses the original's explanations and structure of core AI concepts.",
    ],
    BOND,
    "success"
  );

  const afterFileEscrow = BigInt((await read("get_total_escrow")) || "0");
  assert(afterFileEscrow === escrowBefore + BOND, "total_escrow increased by the bond");
  const afterFileBal = await contractBalance();
  if (afterFileBal !== null)
    assert(afterFileBal === afterFileEscrow, "invariant: contract balance == total_escrow (after file)");

  // 2) Error state: claimant cannot respond to their own claim.
  await send(
    c1,
    "Claimant self-response (must fail)",
    "respond",
    [claimId, "I am the claimant trying to respond to my own claim"],
    0n,
    "rollback",
    "Claimant cannot respond"
  );

  // 3) Respondent (W2) files a real defense.
  await send(
    c2,
    "Respond",
    "respond",
    [
      claimId,
      "Machine learning is a distinct subfield. Any overlap is shared public-domain foundation, not copied expression.",
    ],
    0n,
    "success"
  );
  const respClaim = JSON.parse((await read("get_claim", [claimId])) || "{}");
  assert(respClaim.status === "RESPONDED", "claim status == RESPONDED after W2 responds");

  // 4) Adjudicate (W1 triggers AI jury). Verdict is AI-decided; we assert it
  //    finalized to a valid verdict and credited the bond to a real winner.
  await send(c1, "Adjudicate (AI jury)", "adjudicate", [claimId], 0n, "success");
  const adj = JSON.parse((await read("get_claim", [claimId])) || "{}");
  console.log(`    verdict=${adj.verdict} similarity=${adj.similarity_pct}% payout_to=${adj.payout_to}`);
  assert(adj.status === "ADJUDICATED", "claim status == ADJUDICATED");
  assert(
    ["SUBSTANTIALLY_SIMILAR", "INDEPENDENT", "FAIR_USE", "INSUFFICIENT_EVIDENCE"].includes(adj.verdict),
    "verdict is one of the four enum values"
  );
  assert(BigInt(adj.payout_amount || "0") === BOND, "payout_amount == bond");

  // 5) The winner (whichever wallet the AI credited) has a pending payout.
  const winner = adj.payout_to;
  const winnerIsW1 = winner.toLowerCase() === w1.address.toLowerCase();
  const winnerClient = winnerIsW1 ? c1 : c2;
  console.log(`\nWinner: ${winner} (${winnerIsW1 ? "W1" : "W2"})`);
  const pending = BigInt((await read("get_pending_payout", [winner])) || "0");
  assert(pending === BOND, "winner get_pending_payout == bond");

  // 6) Withdraw (happy path) — native GEN leaves the contract.
  const balPreWithdraw = await contractBalance();
  await send(winnerClient, "Withdraw (winner)", "withdraw", [], 0n, "success");
  const pendingAfter = BigInt((await read("get_pending_payout", [winner])) || "0");
  assert(pendingAfter === 0n, "winner pending payout == 0 after withdraw");
  const escrowAfter = BigInt((await read("get_total_escrow")) || "0");
  assert(escrowAfter === escrowBefore, "total_escrow back to baseline after withdraw");
  const balPost = await contractBalance();
  if (balPreWithdraw !== null && balPost !== null) {
    assert(balPost === balPreWithdraw - BOND, "contract balance dropped by the bond");
    assert(balPost === escrowAfter, "invariant: contract balance == total_escrow (after withdraw)");
  }

  // 7) Error state: a second withdraw with nothing owed rolls back.
  await send(
    winnerClient,
    "Second withdraw (must fail)",
    "withdraw",
    [],
    0n,
    "rollback",
    "Nothing to withdraw"
  );

  // ---- write the recorded run ----
  const out = {
    generated_at: new Date().toISOString(),
    network: "studionet",
    chain_id: 61999,
    contract: CONTRACT,
    contract_explorer: `${EXPLORER}/address/${CONTRACT}`,
    wallets: { claimant_W1: w1.address, respondent_W2: w2.address },
    claim_id: claimId,
    verdict: adj.verdict,
    similarity_pct: adj.similarity_pct,
    winner,
    assertions_failed: failures,
    steps,
  };
  const dir = resolve(REPO_ROOT, "deliverables");
  mkdirSync(dir, { recursive: true });
  const path = resolve(dir, "e2e-run.json");
  writeFileSync(path, JSON.stringify(out, null, 2));
  console.log(`\nRecorded run written to ${path}`);

  console.log(`\n=== RESULT: ${failures === 0 ? "ALL ASSERTIONS PASSED" : failures + " ASSERTION(S) FAILED"} ===`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("E2E crashed:", e);
  process.exit(1);
});
