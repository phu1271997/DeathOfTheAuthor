# Deploying via GenLayer Studio

## Steps

1. Open [GenLayer Studio](https://studio.genlayer.com) in your browser.
2. Connect your wallet (MetaMask) and ensure you are on Studionet.
3. Click **"New Contract"** in the Studio dashboard.
4. Copy the entire contents of `contracts/contract.py` and paste it into the editor.
5. Click **"Deploy"**.
6. Wait for the deployment transaction to be confirmed.
7. Copy the contract address from the deployment result.
8. Set `VITE_CONTRACT_ADDRESS` in `frontend/.env` to the deployed address.

## Verifying

After deployment, you can test the contract directly in Studio:

- Call `get_claim_count()` — should return `"0"`.
- Call `file_claim("https://example.com/original", "https://example.com/accused", "Test claim")` with a value of at least 1000.
- Call `get_claim("0")` to see the filed claim.
- Call `adjudicate("0")` to trigger the AI jury (requires real web content at the URLs).

## Notes

- The minimum bond is 1000 (set in `__init__`).
- Adjudication fetches real web content, so use URLs that return readable text.
- The AI jury compares *expression*, not ideas — two articles about the same topic will likely get an `INDEPENDENT` verdict.
