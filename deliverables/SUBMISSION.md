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
0x4e7D54930C9F510c3B690Dc531e2c6Ae1Ab60dD3
```

Network: GenLayer Studionet (Chain ID 61999). Address is hardcoded as `DEFAULT_CONTRACT_ADDRESS` in [frontend/src/config.ts](../frontend/src/config.ts) and shipped in the production bundle, so the repo alone identifies the live contract; `VITE_CONTRACT_ADDRESS` only exists as an override for redeployment.

---

## Links

- **Frontend**: https://deathoftheauthor.vercel.app
- **GitHub**: https://github.com/phu1271997/DeathOfTheAuthor
- **Explorer (contract)**: https://genlayer-explorer.vercel.app/address/0x4e7D54930C9F510c3B690Dc531e2c6Ae1Ab60dD3

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

Routing the transfer through an `@gl.evm.contract_interface` recipient dispatches it as an external message (via the chain-layer ghost contract) rather than an internal IC-to-IC method call. That is the path the GenVM uses to reach any address, including a plain EOA. It has been verified against studionet with the exact tx below.

The invariant `contract.balance == total_escrow == Σ escrow_credits[addr]` is enforced by construction:

- `file_claim` increments `total_escrow` by `msg.value`.
- `adjudicate` moves the bond amount from the general pool into `escrow_credits[winner]` (no net change to `total_escrow`).
- `withdraw` decrements both `total_escrow` and the caller's credit before emitting the transfer.

The invariant is checked at every state transition in the E2E run below.

---

## Recorded End-to-End Test on the Live Contract

All transactions below hit `0x4e7D54930C9F510c3B690Dc531e2c6Ae1Ab60dD3` on studionet, from two independent wallets:

- **W1 (claimant)**: `0x8b563A8c9eeF530300e92E26457D1AB001daEcC7`
- **W2 (respondent)**: `0xFdc45874126A0580d9A9d034F2AA20d9bdad8235`

The explorer captures every hash and every child transaction:

### Phase 1 — File three funded claims from W1 (100 GEN each)

| # | Content pair | Tx |
|---|-------------|----|
| 0 | Python vs Chocolate cake (unrelated) | [`0x328699cb…900d4a63`](https://genlayer-explorer.vercel.app/tx/0x328699cb017b414865887ad6550a352a2c2226cdb9d7fab425a4ad2c900d4a63) |
| 1 | Copyright vs US Copyright law (adjacent) | [`0x6d1a5121…36730ce7`](https://genlayer-explorer.vercel.app/tx/0x6d1a51215af21912c891ebfde92f31df0c5c9230cafe14448cc53ba536730ce7) |
| 2 | AI vs ML (has respondent) | [`0xc47cb917…dfee3ba60`](https://genlayer-explorer.vercel.app/tx/0xc47cb9176ce6b8db3f7d6d6d4d0f88f9ea2fb3b108c07d877250788dfee3ba60) |

Invariant check after phase 1: `contract.balance = 300 GEN, total_escrow = 300 GEN — match: true`.

### Phase 2 — W2 responds to claim #2

- [`0xf365f2aa…95196dde8`](https://genlayer-explorer.vercel.app/tx/0xf365f2aa22329ca3cae904a0150d8caada83cbba31effd7e7413df295196dde8): W2 files defense statement. Contract enforces `msg.sender != claimant`.

### Phase 3 — Adjudicate all three (AI consensus)

Each triggers `gl.nondet.web.render` × 2 → `gl.nondet.exec_prompt` → `gl.vm.run_nondet(leader_fn, validator_fn)` with the validator comparing verdict and enforcing `|sim_leader − sim_mine| ≤ 20`.

| Claim | Tx | Post-invariant |
|-------|----|-----|
| #0 | [`0x61257eee…ef3581a9`](https://genlayer-explorer.vercel.app/tx/0x61257eeebed80543e31aaa5af481de82bea861ba1a93cb67ddd76211ef3581a9) | 300 = 300 ✓ |
| #1 | [`0x7899ac25…0ab8a711`](https://genlayer-explorer.vercel.app/tx/0x7899ac25bfc3f2176808e78a71546b39f1e2ccb0743edd08161f77f40ab8a711) | 300 = 300 ✓ |
| #2 | [`0xeed1a40f…84d02d37`](https://genlayer-explorer.vercel.app/tx/0xeed1a40f3a152f62be1759e2d5954133e6360d8070fb3bd29e664c9e84d02d37) | 300 = 300 ✓ |

### Phase 4 — Withdrawals (real native GEN leaves the contract)

W2's wallet balance was snapshotted before and after each withdrawal:

| Wallet | Tx | On-chain effect |
|--------|----|-----------------|
| W2 | [`0x6f2ab7fe…f03a1122c`](https://genlayer-explorer.vercel.app/tx/0x6f2ab7fe83d2f39d6c40f2bdd881219dad48e3fb0a1e6b1930bce6ef03a1122c) | W2 balance +100 GEN, contract balance 300 → 200. Invariant: 200 = 200 ✓ |
| W1 | [`0xe9051501…9c5c65ef85`](https://genlayer-explorer.vercel.app/tx/0xe90515015807d13e842b00b470341b7641e2ef82932dd443f857a69c5c65ef85) | W1 balance +200 GEN, contract balance 200 → 0. Invariant: 0 = 0 ✓ |

### Phase 5 — Error-state proof

Second W2 withdraw with zero balance:

- [`0x4345f4de…91ead76f`](https://genlayer-explorer.vercel.app/tx/0x4345f4de5fab295951422b790bb537dfcc34a1f9275e37bca3d0de5e91ead76f)
- Parent tx status FINALIZED; `result.status = "rollback"`; payload = `"Nothing to withdraw"`.
- Contract state and balances unchanged — the UserError propagates back to the frontend where it renders in the error banner.

### Phase 6 — Fresh state left on-chain for the reviewer

| # | Tx | Status |
|---|----|--------|
| 3 | [`0x15e57c78…23e00e745`](https://genlayer-explorer.vercel.app/tx/0x15e57c78e943b660ad3591226444b5768b444fdc660823147105a8723e00e745) | OPEN — DNA vs RNA; reviewer can click **Request Adjudication** live |
| 4 | file [`0x16465874…1fb91d24`](https://genlayer-explorer.vercel.app/tx/0x16465874507d2df23afc1b0801d372ec841ee51f8fd426d70ff350dd1fb91d24) · respond [`0x9f7d0f7b…1330ff36`](https://genlayer-explorer.vercel.app/tx/0x9f7d0f7bd61f676d96e416b28f6d0c25b3229ce4da2e3f33ff875b071330ff36) · adjudicate [`0x37164137…eef6b17c`](https://genlayer-explorer.vercel.app/tx/0x37164137e90f9726d67ff811a896149d3b87b8e3905b1cf385f23158eef6b17c) | ADJUDICATED — Bitcoin vs Ethereum; **W2 has 100 GEN pending withdraw** |

So a reviewer opening the app, connecting W2, will see a live 100 GEN escrow credit and can click **Withdraw** to receive it in the wallet.

---

## Frontend Wallet Flow — What the Reviewer Sees

Live app: **https://deathoftheauthor.vercel.app**

1. **Connect Wallet** — MetaMask popup, network auto-switched/added to studionet (Chain ID 61999). If the user cancels, an error banner reads `User rejected the request.`
2. **Escrow status card** at the top of the Court section shows:
   - `Total in escrow` (reads `get_total_escrow`)
   - `Owed to your wallet` (reads `get_pending_payout(connectedAddr)`) plus a **Withdraw** button that's disabled when the balance is zero
   - Clickable link to the contract on the studionet explorer
3. **File a Claim** — form validates required URLs + minimum bond, then signs `file_claim`. While the tx pends the banner shows `Submitting claim with bond — waiting for consensus…` and reveals the tx hash + explorer link as soon as it lands.
4. **Claims panel** lists every on-chain claim with status badge, URL previews, bond amount, verdict + similarity meter, and AI reason. Clicking a card opens the detail panel with Respond / Request Adjudication actions.
5. **AI jury deliberating** — for `adjudicate` the banner shows `AI jury deliberating (30–120 s) — waiting for consensus…` and switches to `Verdict delivered!` on success, then the verdict + reason paragraph render inline. Failures show the raw revert message in the error banner (e.g. `Claim already adjudicated`).
6. **Withdraw** — clicking the Withdraw button signs `withdraw`, banner shows `Withdrawing your escrow credit — waiting for consensus…`, on success the wallet balance updates and the `Owed to your wallet` counter drops to 0. A second click with no balance renders `Nothing to withdraw` in the error banner.
7. **Explorer link** on the details panel opens the contract on the studionet explorer so the reviewer can cross-check every transaction and the escrow invariant.

The reviewer can independently reproduce every step above against the seeded on-chain state described in Phase 6 (claim #3 is OPEN and adjudicable; W2 has a real 100 GEN credit ready to withdraw).

---

## Test Suite

```bash
pytest tests/ -m fast -v       # 10 deterministic tests
pytest tests/ -m slow -v       # 8 mocked-LLM/web tests
pytest tests/ -v               # 18 total: file_claim validation, respond flow
                               # (including claimant-blocked), all 4 verdicts,
                               # double-adjudicate prevention, bond custody,
                               # full lifecycle
```
