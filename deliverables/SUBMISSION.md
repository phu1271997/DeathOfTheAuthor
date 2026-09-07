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

Death of the Author is a decentralized copyright adjudication system built on GenLayer. Claimants file a bond and submit two URLs — original and accused work. The contract fetches both pages on-chain using gl.nondet.web.render, sends them to an LLM via gl.nondet.exec_prompt for analysis, and validators independently verify the verdict through gl.vm.run_nondet. Four outcomes are possible: SUBSTANTIALLY_SIMILAR, INDEPENDENT, FAIR_USE, or INSUFFICIENT_EVIDENCE. Bonds are held in escrow with a contract-balance invariant.

> 499 chars

---

## Contract Address

```
0x7a311D1e991E7d60e8072Afdb4bB2b24F6A7FB5A
```

Network: GenLayer Studionet (Chain ID 61999). Address is hardcoded as `DEFAULT_CONTRACT_ADDRESS` in [frontend/src/config.ts](../frontend/src/config.ts) and shipped in the production bundle, so the repo alone identifies the live contract; `VITE_CONTRACT_ADDRESS` only exists as an override for redeployment.

---

## Links

- **Frontend**: https://deathoftheauthor.vercel.app
- **GitHub**: https://github.com/phu1271997/DeathOfTheAuthor
- **Explorer**: https://genlayer-explorer.vercel.app/address/0x7a311D1e991E7d60e8072Afdb4bB2b24F6A7FB5A

---

## GenLayer Features Used

| Feature | Method | Purpose |
|---------|--------|---------|
| `gl.nondet.web.render` | `adjudicate()` | Fetches original + accused work content on-chain |
| `gl.nondet.exec_prompt` | `adjudicate()` | LLM compares expression similarity, outputs structured verdict |
| `gl.vm.run_nondet` | `adjudicate()` | Validators independently verify verdict matches leader |
| `gl.public.write.payable` | `file_claim()` | Accepts bond payment with claim filing |
| `TreeMap[str, str]` + `u256` invariant | escrow state | Escrow bookkeeping: contract balance ≡ sum of unpaid credits |

---

## Smart Contract Methods

| Method | Type | Description |
|--------|------|-------------|
| `file_claim(original_url, accused_url, statement)` | write/payable | File copyright claim with bond (min 100 wei) |
| `respond(claim_id, statement)` | write | Accused party files defense statement |
| `adjudicate(claim_id)` | write/nondet | AI reads both works, validators verify, delivers verdict, credits winner in escrow |
| `get_claim(claim_id)` | view | Returns full claim data as JSON, including `payout_to` and `payout_amount` |
| `get_claim_count()` | view | Returns total number of claims |
| `get_pending_payout(addr)` | view | Returns wei owed to `addr` from adjudicated claims |
| `get_total_escrow()` | view | Returns sum of all unpaid credits — always equals contract balance |
| `get_min_bond()` | view | Returns filing threshold |

---

## Escrow Model (why no funds are ever lost)

The bond flow used to call `gl.get_contract_at(<claimant EOA>).emit_transfer(value=bond)` directly from inside `adjudicate()`. On the hosted studionet GenVM, that child transaction cannot resolve a contract at an EOA address — it aborts with `Contract 0x… not found` and the parent transaction has already been marked FINALIZED. Value that left the contract on the outbound message is destroyed on the way out. That was the failure mode flagged in the previous review.

The current design keeps bonds in a per-address escrow ledger and never calls `emit_transfer` to an EOA:

1. `file_claim` deposits `msg.value` into the contract's native balance.
2. `adjudicate` writes `escrow_credits[winner] += bond` and updates `total_escrow`.
3. The invariant `contract.balance == total_escrow == Σ escrow_credits[addr]` is maintained by construction on every write.
4. `get_pending_payout(addr)` and `get_total_escrow()` are public views so the invariant is verifiable on the explorer.

`withdraw()` is intentionally NOT deployed on studionet. The commented reference implementation in [contracts/contract.py](../contracts/contract.py) is exactly the shape it will take on chains whose GenVM supports EOA transfers (testnet-bradbury onwards). On studionet, bonds remain claimable as on-chain credits.

---

## Recorded End-to-End Test on Live Contract

All transactions below were sent to the contract at `0x7a311D1e991E7d60e8072Afdb4bB2b24F6A7FB5A` from two independent wallets. Every hash is clickable on the studionet explorer.

- **W1 (claimant)**: `0x8b563A8c9eeF530300e92E26457D1AB001daEcC7`
- **W2 (respondent)**: `0xFdc45874126A0580d9A9d034F2AA20d9bdad8235`

### Step 1 — File three funded claims from W1 (100 GEN bond each)

| # | Content | Tx |
|---|---------|----|
| 0 | `wiki/Python_(programming_language)` vs `wiki/Chocolate_cake` (unrelated) | [`0xcd23c788…6276ada8`](https://genlayer-explorer.vercel.app/tx/0xcd23c788ee471a7cc25912b11e67068af3385f8e7aec1c4fba5527136276ada8) |
| 1 | `wiki/Copyright` vs `wiki/Copyright_law_of_the_United_States` (adjacent topics) | [`0x82fddcfe…766336b4`](https://genlayer-explorer.vercel.app/tx/0x82fddcfef79d35d95c0c3476f7a6b14b2b329d13b9f515ac3e4d000c766336b4) |
| 2 | `wiki/Artificial_intelligence` vs `wiki/Machine_learning` (has respondent) | [`0xb7be59ea…608d46081`](https://genlayer-explorer.vercel.app/tx/0xb7be59eac62c545a62f8f1505a238c9280353c40785a3ca87a22fca608d46081) |

### Step 2 — W2 responds to claim #2

- [`0x92eaab1e…19a2b6`](https://genlayer-explorer.vercel.app/tx/0x92eaab1e0ddca9ff0cfa3c8198bd3d22b046fcea1c69c2a8f88692a11619a2b6): W2 files a defense statement. Contract enforces `msg.sender != claimant`.

### Step 3 — Adjudicate all three claims (AI consensus)

Each of these transactions triggers `gl.nondet.web.render` × 2 followed by `gl.nondet.exec_prompt`, then `gl.vm.run_nondet(leader_fn, validator_fn)` where the validator compares the verdict and enforces `|similarity_leader − similarity_mine| ≤ 20`.

| Claim | Verdict | Similarity | Payout target | Tx |
|-------|---------|------------|---------------|----|
| #0 | INDEPENDENT | 5% | W1 (no respondent → refund) | [`0x95ac0228…de6da3a2b`](https://genlayer-explorer.vercel.app/tx/0x95ac022809181735aab0aadd1744dbdb2d73456ed507504af47d1a7de6da3a2b) |
| #1 | INDEPENDENT | 24% | W1 (no respondent → refund) | [`0x71ad6412…04dbaedbc`](https://genlayer-explorer.vercel.app/tx/0x71ad6412e2e950682d83061e805c1a75ddc57c6be15710c59b9461e04dbaedbc) |
| #2 | INDEPENDENT | 30% | W2 (respondent wins) | [`0x1d543f17…62df50d5`](https://genlayer-explorer.vercel.app/tx/0x1d543f17462c457d666992b927f3c6350e005f35a870a71a2bc3c0b462df50d5) |

### Step 4 — Read escrow state (all values live on-chain)

```
$ genlayer view get_claim_count        -> "3"
$ genlayer view get_total_escrow       -> "300000000000000000000"       (= 300 GEN)
$ getBalance 0x7a311D1e991E7d60e8072Afdb4bB2b24F6A7FB5A  -> 300000000000000000000
$ genlayer view get_pending_payout <W1> -> "200000000000000000000"      (= 200 GEN, claims #0 + #1)
$ genlayer view get_pending_payout <W2> -> "100000000000000000000"      (= 100 GEN, claim #2)
```

**Invariant `contract.balance == total_escrow == Σ credits` holds after every state transition — nobody is losing funds.**

### Step 5 — UI verification against the live prod deployment

Executed inside `https://deathoftheauthor.vercel.app` (production bundle):

```js
> await fetch('https://studio.genlayer.com/api', { method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({jsonrpc:'2.0', id:1, method:'gen_getContractSchema',
      params:['0x7a311D1e991E7d60e8072Afdb4bB2b24F6A7FB5A']}) })
    .then(r => r.json()).then(j => Object.keys(j.result.methods))
< ['adjudicate','file_claim','get_claim','get_claim_count','get_min_bond',
   'get_pending_payout','get_total_escrow','respond']

> document.querySelectorAll('.verdict-card').length
< 3

> [...document.querySelectorAll('.verdict-card')].map(c => c.innerText.split('\n')[0])
< ['Claim #0','Claim #1','Claim #2']
```

The three verdict cards render on the deployed page against on-chain data with the real AI reason paragraphs.

---

## Test Suite

```bash
# Fast tests (no LLM, deterministic)
pytest tests/ -m fast -v

# Slow tests (mocked LLM + web)
pytest tests/ -m slow -v

# All tests
pytest tests/ -v
```

Coverage: 18 tests (10 fast, 8 slow) covering `file_claim` validation, respond flow (including claimant-blocked), all 4 verdict types, double-adjudicate prevention, bond custody, and full lifecycle.
