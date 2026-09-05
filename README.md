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
4. VERDICT  One of four outcomes:
            SUBSTANTIALLY_SIMILAR -> bond returned to claimant
            INDEPENDENT          -> bond forfeited
            FAIR_USE             -> bond forfeited
            INSUFFICIENT_EVIDENCE -> bond forfeited
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
4. **Deterministic finality** — the verdict is recorded on-chain and triggers bond return

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
Studionet: 0x4116cf085764E4E53d78408B488B8BAFb5cAE948
```

Explorer: https://genlayer-explorer.vercel.app/address/0x4116cf085764E4E53d78408B488B8BAFb5cAE948

Live app: https://death-of-the-author.vercel.app

## Video Demo

See `deliverables/SUBMISSION.md` for the recorded end-to-end walkthrough
(connect wallet, file funded claim, respond from second wallet, adjudicate,
consensus verdict on-chain).

## License

MIT
