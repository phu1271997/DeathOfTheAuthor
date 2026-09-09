# Death of the Author

**On-chain copyright and plagiarism adjudication powered by GenLayer's AI-native consensus.**

## Problem

Copyright disputes are expensive, slow, and centralized. Filing a DMCA takedown is trivial — but *proving* substantial similarity between two creative works requires subjective human judgment. Traditional smart contracts cannot read web content or reason about whether two poems, essays, or artworks are substantively similar. Courts take months. Platforms make opaque, unappealable decisions.

Artists need a faster, cheaper, transparent mechanism for resolving "did they copy my work?" disputes — one that reads the actual content, reasons about similarity in expression (not just ideas), and delivers a binding on-chain verdict.

## How It Works

```
1. CLAIM    Artist posts bond + submits two URLs (original + accused) + statement
                                    |
2. RESPOND  Accused party can file a defense statement (optional)
                                    |
3. ADJUDICATE  Anyone triggers adjudication -> GenLayer validators:
               - Fetch BOTH URLs (real web content via gl.nondet.web.render)
               - Read and compare the works
               - Apply copyright similarity analysis
               - Reach consensus on verdict
                                    |
4. VERDICT  One of four outcomes, each credits the bond to a winner in escrow:
            SUBSTANTIALLY_SIMILAR -> credited to claimant
            INDEPENDENT           -> credited to respondent (claimant if none)
            FAIR_USE              -> credited to respondent (claimant if none)
            INSUFFICIENT_EVIDENCE -> credited to claimant
                                    |
5. WITHDRAW The winner signs withdraw() to pull the credited bond out of
            escrow (pull-payment). Invariant: contract balance == total_escrow.
```

## Architecture

```
+------------------+     +-------------------+     +------------------+
|   React Frontend | --> | GenLayer Network  | --> | LLM Validators   |
|   (Vite + TS)    |     | (Studionet)       |     | (AI Jury)        |
+------------------+     +-------------------+     +------------------+
        |                        |                         |
   MetaMask            Intelligent Contract          Web Rendering
   genlayer-js         (Python on GenVM)            Content Analysis
                       Bond escrow                  Verdict Consensus
                       Claim storage
```

## Why This Dies Without GenLayer

"Is this work substantially similar?" is a **subjective aesthetic judgment** that requires:

1. **Reading real web content** from two arbitrary URLs at transaction time
2. **Reasoning about similarity** in creative expression, not just string matching
3. **Reaching consensus** among multiple independent AI validators on a verdict
4. **Deterministic finality** — the verdict is recorded on-chain and credits the bond in escrow for the winner to withdraw

Solidity cannot fetch web pages. Oracles cannot reason about aesthetics. Only GenLayer's Intelligent Contracts — with `gl.nondet.web.render` and `gl.nondet.exec_prompt` inside validator consensus — can perform this adjudication on-chain.

## Tech Stack

- **Smart Contract**: Python (GenLayer Intelligent Contract on GenVM)
- **Frontend**: React 18 + TypeScript + Vite
- **Chain Integration**: genlayer-js SDK + MetaMask
- **Network**: GenLayer Studionet
- **Testing**: pytest + gltest

## Deploy the Contract

### Prerequisites

- Python 3.11+
- GenLayer CLI or access to [GenLayer Studio](https://studio.genlayer.com)

### Via GenLayer Studio (Recommended)

1. Go to [studio.genlayer.com](https://studio.genlayer.com)
2. Click "New Contract"
3. Paste the contents of `contracts/contract.py`
4. Click "Deploy"
5. Copy the deployed contract address

### Via CLI

```bash
genlayer deploy contracts/contract.py --network studionet
```

## Run the Frontend

```bash
cd frontend
npm install

# Create .env from example
cp .env.example .env
# Edit .env and set VITE_CONTRACT_ADDRESS to your deployed address

npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

## Deploy Frontend to Vercel

```bash
cd frontend
npx vercel
# Set environment variable VITE_CONTRACT_ADDRESS in Vercel dashboard
```

Or connect the repo to Vercel with these settings:
- **Root Directory**: `frontend`
- **Build Command**: `npm run build`
- **Output Directory**: `dist`
- **Environment Variables**: `VITE_CONTRACT_ADDRESS=<your_address>`

## Run Tests

```bash
# Requires GenLayer simulator running
pip install gltest pytest
pytest tests/ -v
```

## Contract Address

```
Studionet: 0x249e80392A725fBdE23b09189D24339a79Bbdca3
```

Explorer: https://genlayer-explorer.vercel.app/address/0x249e80392A725fBdE23b09189D24339a79Bbdca3

Live app: https://deathoftheauthor.vercel.app

## Deploy the Contract (CLI / script)

The contract is deployed from `contracts/contract.py` with `scripts/deploy/deploy.mjs`:

```bash
cd frontend && npm install   # provides genlayer-js
source ~/.genlayer/env.sh     # exports GENLAYER_PRIVATE_KEY
node ../scripts/deploy/deploy.mjs
```

It prints the new contract address; paste it into
`frontend/src/config.ts` (`DEFAULT_CONTRACT_ADDRESS`) and rebuild.

## Recorded End-to-End Wallet Flow

`frontend/e2e.mjs` drives the exact contract calls the UI issues, signs each
with a funded wallet, and asserts the transaction result **and** the error
states (claimant self-response and double-withdraw both roll back with their
`UserError` payloads). It writes the run — real tx hashes, consensus result,
GenVM execution result, rollback payloads — to `deliverables/e2e-run.json`.

```bash
cd frontend
source ~/.genlayer/env.sh      # GENLAYER_PRIVATE_KEY (W1) + _2 (W2)
node e2e.mjs                   # exits non-zero if any assertion fails
```

The latest passing run is committed at
[`deliverables/e2e-run.json`](deliverables/e2e-run.json); every step links to
its transaction on the studionet explorer.

## License

MIT
