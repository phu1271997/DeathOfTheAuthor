import React, { useState, useEffect, useCallback } from 'react';
import { connectWallet, getClient, CONTRACT_ADDRESS } from './config';

interface ClaimData {
  id: string;
  claimant: string;
  original_url: string;
  accused_url: string;
  claimant_statement: string;
  respondent: string;
  respondent_statement: string;
  bond: string;
  status: string;
  verdict: string;
  similarity_pct: number;
  reason: string;
}

function StatusBadge({ status }: { status: string }) {
  const classMap: Record<string, string> = {
    OPEN: 'badge badge-open',
    RESPONDED: 'badge badge-responded',
    ADJUDICATED: 'badge badge-adjudicated',
  };
  return <span className={classMap[status] || 'badge'}>{status}</span>;
}

function VerdictBadge({ verdict }: { verdict: string }) {
  if (!verdict) return null;
  const classMap: Record<string, string> = {
    SUBSTANTIALLY_SIMILAR: 'verdict verdict-similar',
    INDEPENDENT: 'verdict verdict-independent',
    FAIR_USE: 'verdict verdict-fair-use',
    INSUFFICIENT_EVIDENCE: 'verdict verdict-insufficient',
  };
  const labelMap: Record<string, string> = {
    SUBSTANTIALLY_SIMILAR: 'Substantially Similar',
    INDEPENDENT: 'Independent',
    FAIR_USE: 'Fair Use',
    INSUFFICIENT_EVIDENCE: 'Insufficient Evidence',
  };
  return (
    <span className={classMap[verdict] || 'verdict'}>
      {labelMap[verdict] || verdict}
    </span>
  );
}

function SimilarityMeter({ pct }: { pct: number }) {
  const color =
    pct >= 75 ? '#ef4444' : pct >= 40 ? '#f59e0b' : '#22c55e';
  return (
    <div className="similarity-meter">
      <div className="similarity-bar">
        <div
          className="similarity-fill"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <span className="similarity-label">{pct}%</span>
    </div>
  );
}

function Spinner() {
  return <div className="spinner" />;
}

export default function App() {
  const [account, setAccount] = useState('');
  const [claims, setClaims] = useState<ClaimData[]>([]);
  const [selectedClaim, setSelectedClaim] = useState<ClaimData | null>(null);
  const [loading, setLoading] = useState(false);
  const [txLoading, setTxLoading] = useState(false);
  const [txMessage, setTxMessage] = useState('');
  const [error, setError] = useState('');

  // File claim form
  const [originalUrl, setOriginalUrl] = useState('');
  const [accusedUrl, setAccusedUrl] = useState('');
  const [statement, setStatement] = useState('');
  const [bondAmount, setBondAmount] = useState('2000');

  // Respond form
  const [responseStatement, setResponseStatement] = useState('');

  const shortAddr = (addr: string) =>
    addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : '';

  const explorerLink = (addr: string) =>
    `https://genlayer-explorer.vercel.app/address/${addr}`;

  const handleConnect = async () => {
    try {
      setError('');
      const addr = await connectWallet();
      setAccount(addr);
    } catch (err: any) {
      setError(err.message || 'Failed to connect wallet');
    }
  };

  const fetchClaims = useCallback(async () => {
    if (!account || !CONTRACT_ADDRESS) return;
    setLoading(true);
    try {
      const client = getClient(account);
      const countStr = await client.readContract({
        address: CONTRACT_ADDRESS as any,
        functionName: 'get_claim_count',
        args: [],
      });
      const count = parseInt(countStr as string, 10);
      const fetched: ClaimData[] = [];
      for (let i = 0; i < count; i++) {
        const raw = await client.readContract({
          address: CONTRACT_ADDRESS as any,
          functionName: 'get_claim',
          args: [String(i)],
        });
        fetched.push(JSON.parse(raw as string));
      }
      setClaims(fetched);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch claims');
    } finally {
      setLoading(false);
    }
  }, [account]);

  useEffect(() => {
    if (account && CONTRACT_ADDRESS) {
      fetchClaims();
    }
  }, [account, fetchClaims]);

  const handleFileClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!account) return;
    setTxLoading(true);
    setTxMessage('Submitting claim with bond...');
    setError('');
    try {
      const client = getClient(account);
      await client.writeContract({
        address: CONTRACT_ADDRESS as any,
        functionName: 'file_claim',
        args: [originalUrl, accusedUrl, statement],
        value: BigInt(bondAmount),
      });
      setOriginalUrl('');
      setAccusedUrl('');
      setStatement('');
      setBondAmount('2000');
      setTxMessage('Claim filed successfully!');
      await fetchClaims();
    } catch (err: any) {
      setError(err.message || 'Failed to file claim');
    } finally {
      setTxLoading(false);
      setTimeout(() => setTxMessage(''), 3000);
    }
  };

  const handleRespond = async (claimId: string) => {
    if (!account || !responseStatement.trim()) return;
    setTxLoading(true);
    setTxMessage('Submitting response...');
    setError('');
    try {
      const client = getClient(account);
      await client.writeContract({
        address: CONTRACT_ADDRESS as any,
        functionName: 'respond',
        args: [claimId, responseStatement],
        value: BigInt(0),
      });
      setResponseStatement('');
      setTxMessage('Response submitted!');
      await fetchClaims();
      setSelectedClaim(null);
    } catch (err: any) {
      setError(err.message || 'Failed to respond');
    } finally {
      setTxLoading(false);
      setTimeout(() => setTxMessage(''), 3000);
    }
  };

  const handleAdjudicate = async (claimId: string) => {
    if (!account) return;
    setTxLoading(true);
    setTxMessage('AI jury is deliberating...');
    setError('');
    try {
      const client = getClient(account);
      await client.writeContract({
        address: CONTRACT_ADDRESS as any,
        functionName: 'adjudicate',
        args: [claimId],
        value: BigInt(0),
      });
      setTxMessage('Verdict delivered!');
      await fetchClaims();
      setSelectedClaim(null);
    } catch (err: any) {
      setError(err.message || 'Adjudication failed');
    } finally {
      setTxLoading(false);
      setTimeout(() => setTxMessage(''), 3000);
    }
  };

  return (
    <div className="app">
      <header className="header">
        <div className="header-left">
          <h1 className="title">Death of the Author</h1>
          <p className="subtitle">On-Chain Copyright Court</p>
        </div>
        <div className="header-right">
          {account ? (
            <div className="wallet-info">
              <span className="network-badge">GEN Studionet</span>
              <span className="address">{shortAddr(account)}</span>
              <a
                href={explorerLink(account)}
                target="_blank"
                rel="noopener noreferrer"
                className="explorer-link"
              >
                Explorer
              </a>
            </div>
          ) : (
            <button className="btn btn-connect" onClick={handleConnect}>
              Connect Wallet
            </button>
          )}
        </div>
      </header>

      {error && (
        <div className="error-banner">
          <span>{error}</span>
          <button onClick={() => setError('')} className="error-dismiss">
            Dismiss
          </button>
        </div>
      )}

      {txMessage && (
        <div className="tx-banner">
          {txLoading && <Spinner />}
          <span>{txMessage}</span>
        </div>
      )}

      {!account && (
        <div className="connect-prompt">
          <h2>Welcome to the On-Chain Copyright Court</h2>
          <p>
            Connect your wallet to file plagiarism claims, respond to
            accusations, or request AI-powered adjudication.
          </p>
          <button className="btn btn-connect" onClick={handleConnect}>
            Connect MetaMask
          </button>
        </div>
      )}

      {account && !CONTRACT_ADDRESS && (
        <div className="connect-prompt">
          <h2>Contract Not Configured</h2>
          <p>
            Set <code>VITE_CONTRACT_ADDRESS</code> in your{' '}
            <code>.env</code> file to connect to the deployed contract.
          </p>
        </div>
      )}

      {account && CONTRACT_ADDRESS && (
        <main className="main">
          <section className="section">
            <h2 className="section-title">File a New Claim</h2>
            <form className="claim-form" onSubmit={handleFileClaim}>
              <div className="form-group">
                <label htmlFor="originalUrl">Original Work URL</label>
                <input
                  id="originalUrl"
                  type="url"
                  placeholder="https://example.com/my-original-work"
                  value={originalUrl}
                  onChange={(e) => setOriginalUrl(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="accusedUrl">Accused Work URL</label>
                <input
                  id="accusedUrl"
                  type="url"
                  placeholder="https://example.com/accused-copy"
                  value={accusedUrl}
                  onChange={(e) => setAccusedUrl(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="statement">Your Statement</label>
                <textarea
                  id="statement"
                  placeholder="Describe why you believe this work was plagiarized..."
                  value={statement}
                  onChange={(e) => setStatement(e.target.value)}
                  rows={4}
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="bond">Bond Amount (min 1000)</label>
                <input
                  id="bond"
                  type="number"
                  min="1000"
                  value={bondAmount}
                  onChange={(e) => setBondAmount(e.target.value)}
                  required
                />
              </div>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={txLoading}
              >
                {txLoading ? 'Submitting...' : 'File Claim'}
              </button>
            </form>
          </section>

          <section className="section">
            <div className="section-header">
              <h2 className="section-title">Claims</h2>
              <button
                className="btn btn-secondary"
                onClick={fetchClaims}
                disabled={loading}
              >
                {loading ? 'Loading...' : 'Refresh'}
              </button>
            </div>

            {loading && claims.length === 0 && (
              <div className="loading-state">
                <Spinner />
                <span>Loading claims...</span>
              </div>
            )}

            {!loading && claims.length === 0 && (
              <p className="empty-state">
                No claims filed yet. Be the first to submit a copyright claim.
              </p>
            )}

            <div className="claims-grid">
              {claims.map((claim) => (
                <div
                  key={claim.id}
                  className={`claim-card ${selectedClaim?.id === claim.id ? 'selected' : ''}`}
                  onClick={() =>
                    setSelectedClaim(
                      selectedClaim?.id === claim.id ? null : claim
                    )
                  }
                >
                  <div className="claim-card-header">
                    <span className="claim-id">Claim #{claim.id}</span>
                    <StatusBadge status={claim.status} />
                  </div>
                  <div className="claim-urls">
                    <div className="url-row">
                      <span className="url-label">Original:</span>
                      <a
                        href={claim.original_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {claim.original_url.length > 50
                          ? claim.original_url.slice(0, 50) + '...'
                          : claim.original_url}
                      </a>
                    </div>
                    <div className="url-row">
                      <span className="url-label">Accused:</span>
                      <a
                        href={claim.accused_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {claim.accused_url.length > 50
                          ? claim.accused_url.slice(0, 50) + '...'
                          : claim.accused_url}
                      </a>
                    </div>
                  </div>
                  <div className="claim-meta">
                    <span className="bond-amount">Bond: {claim.bond}</span>
                    <span className="claimant">
                      By: {shortAddr(claim.claimant)}
                    </span>
                  </div>
                  {claim.verdict && (
                    <div className="claim-verdict-row">
                      <VerdictBadge verdict={claim.verdict} />
                      <SimilarityMeter pct={claim.similarity_pct} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>

          {selectedClaim && (
            <section className="section claim-detail">
              <h2 className="section-title">
                Claim #{selectedClaim.id} Details
              </h2>
              <div className="detail-grid">
                <div className="detail-item">
                  <span className="detail-label">Status</span>
                  <StatusBadge status={selectedClaim.status} />
                </div>
                <div className="detail-item">
                  <span className="detail-label">Claimant</span>
                  <span className="detail-value">
                    {shortAddr(selectedClaim.claimant)}
                  </span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Bond</span>
                  <span className="detail-value">{selectedClaim.bond}</span>
                </div>
                <div className="detail-item full-width">
                  <span className="detail-label">Original Work</span>
                  <a
                    href={selectedClaim.original_url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {selectedClaim.original_url}
                  </a>
                </div>
                <div className="detail-item full-width">
                  <span className="detail-label">Accused Work</span>
                  <a
                    href={selectedClaim.accused_url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {selectedClaim.accused_url}
                  </a>
                </div>
                <div className="detail-item full-width">
                  <span className="detail-label">Claimant Statement</span>
                  <p className="detail-text">
                    {selectedClaim.claimant_statement}
                  </p>
                </div>
                {selectedClaim.respondent && (
                  <>
                    <div className="detail-item">
                      <span className="detail-label">Respondent</span>
                      <span className="detail-value">
                        {shortAddr(selectedClaim.respondent)}
                      </span>
                    </div>
                    <div className="detail-item full-width">
                      <span className="detail-label">
                        Respondent Statement
                      </span>
                      <p className="detail-text">
                        {selectedClaim.respondent_statement}
                      </p>
                    </div>
                  </>
                )}

                {selectedClaim.verdict && (
                  <>
                    <div className="detail-item">
                      <span className="detail-label">Verdict</span>
                      <VerdictBadge verdict={selectedClaim.verdict} />
                    </div>
                    <div className="detail-item">
                      <span className="detail-label">Similarity</span>
                      <SimilarityMeter pct={selectedClaim.similarity_pct} />
                    </div>
                    <div className="detail-item full-width">
                      <span className="detail-label">Reason</span>
                      <p className="detail-text">{selectedClaim.reason}</p>
                    </div>
                  </>
                )}
              </div>

              <div className="detail-actions">
                {selectedClaim.status === 'OPEN' && (
                  <div className="respond-form">
                    <h3>Respond to This Claim</h3>
                    <textarea
                      placeholder="Enter your defense statement..."
                      value={responseStatement}
                      onChange={(e) => setResponseStatement(e.target.value)}
                      rows={3}
                    />
                    <button
                      className="btn btn-secondary"
                      onClick={() => handleRespond(selectedClaim.id)}
                      disabled={txLoading || !responseStatement.trim()}
                    >
                      Submit Response
                    </button>
                  </div>
                )}

                {(selectedClaim.status === 'OPEN' ||
                  selectedClaim.status === 'RESPONDED') && (
                  <button
                    className="btn btn-primary"
                    onClick={() => handleAdjudicate(selectedClaim.id)}
                    disabled={txLoading}
                  >
                    {txLoading
                      ? 'AI Jury is Deliberating...'
                      : 'Request Adjudication'}
                  </button>
                )}

                <a
                  href={`https://genlayer-explorer.vercel.app/address/${CONTRACT_ADDRESS}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-outline"
                >
                  View on Explorer
                </a>

                <button
                  className="btn btn-ghost"
                  onClick={() => setSelectedClaim(null)}
                >
                  Close
                </button>
              </div>
            </section>
          )}
        </main>
      )}

      <footer className="footer">
        <p>
          Death of the Author — Decentralized copyright adjudication powered by{' '}
          <a
            href="https://genlayer.com"
            target="_blank"
            rel="noopener noreferrer"
          >
            GenLayer
          </a>
        </p>
      </footer>
    </div>
  );
}
