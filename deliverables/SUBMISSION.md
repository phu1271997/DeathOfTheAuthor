# Death of the Author — Explorer Submission

## Basic Info

- **Name**: Death of the Author
- **Category**: DeFi / Legal Tech
- **Logo**: `logo-1024.png` (1024x1024) + `logo-512.png` (512x512)

---

## Short Description (max 160 chars)

On-chain copyright court where AI reads both works, validators reach consensus, and plagiarism gets a binding verdict with bond enforcement.

> 138 chars

---

## Long Description (max 500 chars)

Death of the Author is a decentralized copyright adjudication system built on GenLayer. Claimants file a bond and submit two URLs — original and accused work. The contract fetches both pages on-chain using gl.nondet.web.render, sends them to an LLM via gl.nondet.exec_prompt for analysis, and validators independently verify the verdict through gl.vm.run_nondet. Four outcomes are possible: SUBSTANTIALLY_SIMILAR, INDEPENDENT, FAIR_USE, or INSUFFICIENT_EVIDENCE. Bonds escrow in-contract; winners withdraw().

> 496 chars

---

## Contract Address

```
0x249e80392A725fBdE23b09189D24339a79Bbdca3
```

Network: GenLayer Studionet (Chain ID 61999). Address is hardcoded as `DEFAULT_CONTRACT_ADDRESS` in [frontend/src/config.ts](../frontend/src/config.ts) and shipped in the production bundle, so the repo alone identifies the live contract; `VITE_CONTRACT_ADDRESS` only exists as an override for redeployment.

---

## Links

- **Frontend**: https://deathoftheauthor.vercel.app
- **GitHub**: https://github.com/phu1271997/DeathOfTheAuthor
- **Explorer (contract)**: https://genlayer-explorer.vercel.app/address/0x249e80392A725fBdE23b09189D24339a79Bbdca3

---

## GenLayer Features Used

| Feature | Method | Purpose |
|---------|--------|---------|
| `gl.nondet.web.render` | `adjudicate()` | Fetches original + accused work content on-chain |
| `gl.nondet.exec_prompt` | `adjudicate()` | LLM compares expression similarity, outputs structured verdict |
| `gl.vm.run_nondet` | `adjudicate()` | Validators independently verify verdict matches leader |
| `gl.public.write.payable` | `file_claim()` | Accepts bond payment with claim filing |
| `@gl.evm.contract_interface` + `emit_transfer` | `withdraw()` / `withdraw_to()` | External-message value transfer that delivers native GEN to an EOA on studionet |
| Escrow invariant | filing / adjudicate / withdraw | `contract.balance ≡ total_escrow ≡ Σ escrow_credits[addr]` verified live |

---

## Smart Contract Methods

| Method | Type | Description |
|--------|------|-------------|
| `file_claim(original_url, accused_url, statement)` | write / payable | File copyright claim, deposits bond into escrow pool |
| `respond(claim_id, statement)` | write | Accused party files defense; contract enforces `sender != claimant` |
| `adjudicate(claim_id)` | write / nondet | AI reads both URLs, validators verify, credits `escrow_credits[winner]` |
| `withdraw()` | write | Pull-payment for the caller. Native transfer via EVM external-message path |
| `withdraw_to(target)` | write | Pull-payment routed to a different address (contract or EOA) |
| `get_claim(claim_id)` | view | Full claim JSON incl `payout_to` + `payout_amount` |
| `get_claim_count()` | view | Number of filed claims |
| `get_pending_payout(addr)` | view | Wei this address can withdraw |
| `get_total_escrow()` | view | Sum of every unpaid bond — matches native balance |
| `get_min_bond()` | view | Filing threshold |

---

## How the Escrow Actually Delivers Funds

Earlier reviews flagged two bugs:

1. Payout via `gl.get_contract_at(<EOA>).emit_transfer(...)` failed silently — the child transaction aborts with `Contract 0x… not found` and value is destroyed on the way out. That was the "user losing funds" symptom.
2. Removing `withdraw()` entirely papered over the leak but left no callable withdrawal path.

The fix uses the external-message path documented under [Sending Value to an EOA or EVM Contract](https://docs.genlayer.com):

```python
@gl.evm.contract_interface
class _Payee:
    class View: pass
    class Write: pass

@gl.public.write
def withdraw(self) -> None:
    me = _addr_str(_sender_addr())
    owed = int(self.escrow_credits.get(me, "0") or "0")
    if owed <= 0:
        raise gl.vm.UserError("Nothing to withdraw")
    self.escrow_credits[me] = "0"
    self.total_escrow = u256(int(self.total_escrow) - owed)
    _Payee(_sender_addr()).emit_transfer(value=u256(owed))
```

Routing the transfer through an `@gl.evm.contract_interface` recipient dispatches it as an external message (via the chain-layer ghost contract) rather than an internal IC-to-IC method call. That is the path the GenVM uses to reach any address, including a plain EOA. It is verified against studionet by the reproducible run below.

The invariant `contract.balance == total_escrow == Σ escrow_credits[addr]` is enforced by construction:

- `file_claim` increments `total_escrow` by `msg.value`.
- `adjudicate` moves the bond amount from the general pool into `escrow_credits[winner]` (no net change to `total_escrow`).
- `withdraw` decrements both `total_escrow` and the caller's credit before emitting the transfer.

The invariant is checked at every state transition in the E2E run below.

---

## Recorded, Reproducible End-to-End Wallet Flow

The frontend wallet flow is **executable, not prose**. [`frontend/e2e.mjs`](../frontend/e2e.mjs) signs the same contract calls the React UI issues (`file_claim → respond → adjudicate → withdraw`) with two funded wallets, and **asserts the finalized transaction result and both error states**. Every run writes the real tx hashes, consensus result, GenVM execution result and rollback payloads to [`deliverables/e2e-run.json`](./e2e-run.json).

Reproduce it:

```bash
cd frontend
source ~/.genlayer/env.sh      # GENLAYER_PRIVATE_KEY (W1) + _2 (W2)
node e2e.mjs                   # exits non-zero if any assertion fails
```

Wallets in the committed run:

- **W1 (claimant / adjudicator)**: `0x8b563A8c9eeF530300e92E26457D1AB001daEcC7`
- **W2 (respondent)**: `0xFdc45874126A0580d9A9d034F2AA20d9bdad8235`

All six transactions hit `0x249e80392A725fBdE23b09189D24339a79Bbdca3` on studionet. Verdict: **INDEPENDENT (12%)** → bond credited to the respondent W2, who then withdraws it.

| Step | Call | Expected | GenVM result | Tx |
|------|------|----------|--------------|----|
| 1 File claim | `file_claim` (100 GEN bond) | success | `SUCCESS` / return | [`0xbc8c88ef…40124b07`](https://genlayer-explorer.vercel.app/tx/0xbc8c88ef6b28d570f9d687cd11c2bcbf072f6f85dffe65b4c875e8f040124b07) |
| 2 **Claimant self-response** | `respond` | **rollback** | `ERROR` / `"Claimant cannot respond to own claim"` | [`0x24db7a7a…311df473`](https://genlayer-explorer.vercel.app/tx/0x24db7a7afe49ff2b4c417d85765bf54ed8ef9083ca384ba8025e648e311df473) |
| 3 Respond (W2) | `respond` | success | `SUCCESS` / return | [`0x09ab7c77…06da18ac`](https://genlayer-explorer.vercel.app/tx/0x09ab7c77088021017a5857c6ddecf2b168bbf67ff6e11a531426f19d06da18ac) |
| 4 Adjudicate (AI jury) | `adjudicate` | success | `SUCCESS` / return | [`0xd2bad300…c9e3eaca`](https://genlayer-explorer.vercel.app/tx/0xd2bad3004d842be55bcb56ca2cdf61afad949d747214afa982efafcac9e3eaca) |
| 5 Withdraw (winner W2) | `withdraw` | success | `SUCCESS` / return | [`0xa86cd94c…d95b4951`](https://genlayer-explorer.vercel.app/tx/0xa86cd94cdc8642c5a225c87b71e070e4f5c7b4b65b5c7e440953000dd95b4951) |
| 6 **Second withdraw** | `withdraw` | **rollback** | `ERROR` / `"Nothing to withdraw"` | [`0x7dfda126…3150d8c6`](https://genlayer-explorer.vercel.app/tx/0x7dfda126982b2c5cbef15d48e9662755d28477f0ba9821421c0fe6bd3150d8c6) |

The script also asserts the escrow invariant at each transition: `total_escrow` rises by the bond on file, is unchanged by adjudication (the bond moves into the winner's credit inside the pool), and the contract's native balance drops by exactly the bond on withdraw — `contract.balance == total_escrow` throughout. Step 5 is the proof that native GEN actually leaves the contract to an EOA via the external-message path; steps 2 and 6 are the transaction error states.

### Live state left on-chain for the reviewer

| # | Content | Status | For the reviewer |
|---|---------|--------|------------------|
| 0 | AI vs ML | ADJUDICATED (INDEPENDENT) | the e2e cycle above — bond already withdrawn |
| 1 | DNA vs RNA | **OPEN** | connect a funded studionet wallet and click **Request Adjudication** to run the AI jury live |
| 2 | Bitcoin vs Ethereum | ADJUDICATED (INDEPENDENT) | a real 100 GEN escrow credit sits unpaid — `get_pending_payout` returns it non-zero; the escrow card shows it in **Total in escrow** |

---

## Frontend Wallet Flow — UI mapping

Live app: **https://deathoftheauthor.vercel.app**. Each UI action maps to the calls the e2e run above verifies ([frontend/src/App.tsx](../frontend/src/App.tsx)):

1. **Connect Wallet** — `wallet_switchEthereumChain` / `wallet_addEthereumChain` to studionet (Chain ID 61999), then `eth_requestAccounts`. Cancelling surfaces the wallet error in the banner.
2. **Escrow status card** — reads `get_total_escrow` and `get_pending_payout(connectedAddr)`; the **Withdraw** button is disabled at zero credit and calls `withdraw` otherwise.
3. **File a Claim** — validates the form, signs `file_claim` with the bond, shows `Submitting claim with bond — waiting for consensus…` and the tx hash + explorer link (verified by step 1).
4. **Claims panel** — lists on-chain claims with status, verdict, similarity meter and AI reason; the detail panel exposes Respond / Request Adjudication.
5. **Adjudicate** — signs `adjudicate`, shows `AI jury deliberating (30–120 s)…`, then renders verdict + reason (step 4). A revert renders in the error banner (step 2 is the same rollback path).
6. **Withdraw** — signs `withdraw`, drops `Owed to your wallet` to 0 on success (step 5); a second click renders `Nothing to withdraw` in the error banner (step 6).

The `.json` run is the machine-checkable record of items 3–6; the two `rollback` rows are the transaction error states the banner renders.

---

## Test Suite

```bash
pytest tests/ -m fast -v       # 13 deterministic tests
pytest tests/ -m slow -v       # 11 mocked-LLM/web tests
pytest tests/ -v               # 24 total: file_claim validation, respond flow
                               # (including claimant-blocked), all 4 verdicts,
                               # double-adjudicate prevention, escrow accounting,
                               # payout crediting (claimant + respondent),
                               # withdraw + withdraw-nothing revert, full lifecycle
```
