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

Death of the Author is a decentralized copyright adjudication system built on GenLayer. Claimants file a bond and submit two URLs — original and accused work. The contract fetches both pages on-chain using gl.nondet.web.render, sends them to an LLM via gl.nondet.exec_prompt for analysis, and validators independently verify the verdict through gl.vm.run_nondet. Four outcomes are possible: SUBSTANTIALLY_SIMILAR, INDEPENDENT, FAIR_USE, or INSUFFICIENT_EVIDENCE. Bonds are returned when plagiarism is confirmed.

> 497 chars

---

## Contract Address

```
0x4116cf085764E4E53d78408B488B8BAFb5cAE948
```

Network: GenLayer Studionet (Chain ID 61999)

---

## Links

- **Frontend**: https://death-of-the-author.vercel.app
- **GitHub**: https://github.com/phu1271997/DeathOfTheAuthor
- **Explorer**: https://genlayer-explorer.vercel.app/address/0x4116cf085764E4E53d78408B488B8BAFb5cAE948

---

## GenLayer Features Used

| Feature | Method | Purpose |
|---------|--------|---------|
| `gl.nondet.web.render` | `adjudicate()` | Fetches original + accused work content on-chain |
| `gl.nondet.exec_prompt` | `adjudicate()` | LLM compares expression similarity, outputs structured verdict |
| `gl.vm.run_nondet` | `adjudicate()` | Validators independently verify verdict matches leader |
| `gl.public.write.payable` | `file_claim()` | Accepts bond payment with claim filing |
| `gl.get_contract_at().emit_transfer` | `adjudicate()` | Returns bond to claimant on SUBSTANTIALLY_SIMILAR verdict |

---

## Smart Contract Methods

| Method | Type | Description |
|--------|------|-------------|
| `file_claim(original_url, accused_url, statement)` | write/payable | File copyright claim with bond (min 1000 GEN) |
| `respond(claim_id, statement)` | write | Accused party files defense statement |
| `adjudicate(claim_id)` | write/nondet | AI reads both works, validators verify, delivers verdict |
| `get_claim(claim_id)` | view | Returns full claim data as JSON |
| `get_claim_count()` | view | Returns total number of claims |

---

## How It Works

1. **File** — Claimant submits original URL, accused URL, statement, and bond (min 1000 GEN)
2. **Respond** — Accused can file a defense statement (optional)
3. **Adjudicate** — Anyone triggers AI analysis:
   - Contract fetches both URLs via `gl.nondet.web.render`
   - LLM analyzes similarity in expression via `gl.nondet.exec_prompt`
   - Validators independently run the same analysis
   - Consensus determines verdict: SUBSTANTIALLY_SIMILAR, INDEPENDENT, FAIR_USE, or INSUFFICIENT_EVIDENCE
4. **Bond Return** — If SUBSTANTIALLY_SIMILAR, bond is returned to claimant

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

Coverage: 18 tests (10 fast, 8 slow) covering file_claim validation, respond flow (including claimant-blocked), all 4 verdict types, double-adjudicate prevention, bond custody, and full lifecycle.
