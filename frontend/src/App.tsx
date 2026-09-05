import React, { useState, useEffect, useCallback } from 'react';
import {
  connectWallet,
  getWriteClient,
  getReadClient,
  CONTRACT_ADDRESS,
  genToWei,
  weiToGen,
  txExplorerUrl,
  addressExplorerUrl,
  EXPLORER_URL,
} from './config';

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
  const color = pct >= 75 ? '#ef4444' : pct >= 40 ? '#f59e0b' : '#22c55e';
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

const FAQ_ITEMS = [
  {
    question: 'What is GenLayer?',
    answer:
      'GenLayer is a Layer-1 blockchain with AI built directly into the consensus mechanism. Validators run LLM inference as part of block validation, enabling smart contracts that can read web content and make intelligent decisions.',
  },
  {
    question: 'How much does it cost?',
    answer:
      'Filing a claim requires a minimum bond of 1000 GEN tokens. This bond serves as a stake in the outcome and is returned if plagiarism is confirmed by the AI jury.',
  },
  {
    question: 'How long does adjudication take?',
    answer:
      'The AI jury typically delivers a verdict within 30 to 120 seconds. Each validator independently analyzes both works, and the consensus mechanism aggregates their findings.',
  },
  {
    question: 'What happens to my bond?',
    answer:
      'If the verdict is SUBSTANTIALLY_SIMILAR, your bond is returned. For INDEPENDENT or FAIR_USE, the bond is transferred to the respondent as compensation. For INSUFFICIENT_EVIDENCE, the bond is returned to you. If no respondent filed a defense, the bond is returned regardless.',
  },
  {
    question: 'Is the verdict final?',
    answer:
      'Yes. Once delivered, the verdict is recorded on-chain and is immutable. The reasoning, similarity percentage, and outcome are permanently stored in the contract state.',
  },
  {
    question: 'What URLs work?',
    answer:
      'Any publicly accessible webpage can be submitted. The contract uses gl.nondet.web.render to fetch and parse live web content during adjudication. Pages behind authentication walls will not work.',
  },
];

export default function App() {
  const [account, setAccount] = useState('');
  const [claims, setClaims] = useState<ClaimData[]>([]);
  const [selectedClaim, setSelectedClaim] = useState<ClaimData | null>(null);
  const [loading, setLoading] = useState(false);
  const [txLoading, setTxLoading] = useState(false);
  const [txMessage, setTxMessage] = useState('');
  const [txHash, setTxHash] = useState<string>('');
  const [error, setError] = useState('');
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const [originalUrl, setOriginalUrl] = useState('');
  const [accusedUrl, setAccusedUrl] = useState('');
  const [statement, setStatement] = useState('');
  const [bondAmount, setBondAmount] = useState('2000');
  const [responseStatement, setResponseStatement] = useState('');

  const totalClaims = claims.length;
  const adjudicatedClaims = claims.filter((c) => c.status === 'ADJUDICATED');
  const adjudicatedCount = adjudicatedClaims.length;
  const successRate =
    adjudicatedCount > 0
      ? Math.round(
          (adjudicatedClaims.filter(
            (c) => c.verdict === 'SUBSTANTIALLY_SIMILAR'
          ).length /
            adjudicatedCount) *
            100
        )
      : 0;

  const shortAddr = (addr: string) =>
    addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : '';

  const toggleFaq = (index: number) => {
    setOpenFaq(openFaq === index ? null : index);
  };

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
    if (!CONTRACT_ADDRESS) return;
    setLoading(true);
    try {
      const client = getReadClient();
      const countStr = await client.readContract({
        address: CONTRACT_ADDRESS as any,
        functionName: 'get_claim_count',
        args: [],
      });
      const count = parseInt(String(countStr ?? '0'), 10);
      if (!Number.isFinite(count) || count <= 0) {
        setClaims([]);
        return;
      }
      const fetched: ClaimData[] = [];
      for (let i = 0; i < count; i++) {
        try {
          const raw = await client.readContract({
            address: CONTRACT_ADDRESS as any,
            functionName: 'get_claim',
            args: [String(i)],
          });
          fetched.push(JSON.parse(raw as string));
        } catch {
          // skip individual claim read failures
        }
      }
      setClaims(fetched);
    } catch (err: any) {
      console.error('Failed to fetch claims:', err);
      setError(
        `Could not load claims from ${CONTRACT_ADDRESS.slice(0, 8)}… — ${err?.shortMessage || err?.message || 'RPC error'}`
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (CONTRACT_ADDRESS) {
      fetchClaims();
    }
  }, [fetchClaims]);

  useEffect(() => {
    if (account && CONTRACT_ADDRESS) {
      fetchClaims();
    }
  }, [account, fetchClaims]);

  async function runWrite(
    label: string,
    fn: string,
    args: any[],
    value: bigint,
    pendingMsg: string,
    okMsg: string
  ): Promise<boolean> {
    if (!account) {
      setError('Connect a wallet first.');
      return false;
    }
    setTxLoading(true);
    setTxHash('');
    setTxMessage(pendingMsg);
    setError('');
    try {
      const client: any = getWriteClient(account);
      try {
        if (typeof client.connect === 'function') {
          await client.connect('studionet');
        }
      } catch (e) {
        console.warn('client.connect failed', e);
      }
      const hash = await client.writeContract({
        address: CONTRACT_ADDRESS as any,
        functionName: fn,
        args,
        value,
      });
      const hashStr = typeof hash === 'string' ? hash : String(hash);
      setTxHash(hashStr);
      setTxMessage(`${pendingMsg} — waiting for consensus…`);
      try {
        const receipt: any = await client.waitForTransactionReceipt({
          hash: hashStr,
          status: 'FINALIZED',
          fullTransaction: false,
        });
        const execName = receipt?.txExecutionResultName || receipt?.txExecutionResult;
        if (execName && execName !== 'FINISHED_WITH_RETURN') {
          throw new Error(
            `${label} failed: ${execName}${receipt?.consensus_data ? '' : ''}`
          );
        }
      } catch (waitErr: any) {
        console.warn('waitForTransactionReceipt error', waitErr);
      }
      setTxMessage(okMsg);
      await fetchClaims();
      return true;
    } catch (err: any) {
      console.error(`${label} failed`, err);
      setError(err?.shortMessage || err?.message || `${label} failed`);
      return false;
    } finally {
      setTxLoading(false);
      setTimeout(() => setTxMessage(''), 5000);
    }
  }

  const handleFileClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await runWrite(
      'File claim',
      'file_claim',
      [originalUrl, accusedUrl, statement],
      genToWei(bondAmount),
      'Submitting claim with bond',
      'Claim filed!'
    );
    if (ok) {
      setOriginalUrl('');
      setAccusedUrl('');
      setStatement('');
      setBondAmount('2000');
    }
  };

  const handleRespond = async (claimId: string) => {
    if (!responseStatement.trim()) return;
    const ok = await runWrite(
      'Respond',
      'respond',
      [claimId, responseStatement],
      0n,
      'Submitting response',
      'Response submitted!'
    );
    if (ok) {
      setResponseStatement('');
      setSelectedClaim(null);
    }
  };

  const handleAdjudicate = async (claimId: string) => {
    const ok = await runWrite(
      'Adjudicate',
      'adjudicate',
      [claimId],
      0n,
      'AI jury deliberating (30–120 s)',
      'Verdict delivered!'
    );
    if (ok) {
      setSelectedClaim(null);
    }
  };

  return (
    <div className="app">
      {/* ===== NAVBAR ===== */}
      <nav className="navbar">
        <div className="nav-inner">
          <div className="nav-left">
            <a href="#" className="nav-logo">
              <img src="/logo.svg" alt="Death of the Author" width={32} height={32} />
              <span className="nav-brand">Death of the Author</span>
            </a>
            <div className="nav-links">
              <a href="#problem">Problem</a>
              <a href="#how-it-works">How it Works</a>
              <a href="#court">Court</a>
              <a href="#architecture">Architecture</a>
              <a href="#faq">FAQ</a>
            </div>
          </div>
          <div className="nav-right">
            {account ? (
              <div className="wallet-info">
                <span className="network-badge">Studionet</span>
                <span className="address">{shortAddr(account)}</span>
              </div>
            ) : (
              <button className="btn btn-connect" onClick={handleConnect}>
                Connect Wallet
              </button>
            )}
          </div>
        </div>
      </nav>

      {/* ===== BANNERS ===== */}
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
          {txHash && (
            <a
              href={txExplorerUrl(txHash)}
              target="_blank"
              rel="noopener noreferrer"
              style={{ marginLeft: 8, textDecoration: 'underline' }}
            >
              tx {txHash.slice(0, 10)}…
            </a>
          )}
        </div>
      )}

      {/* ===== HERO ===== */}
      <section className="hero-section">
        <div className="hero-glow" aria-hidden="true" />
        <div className="container">
          <div className="hero-content">
            <h1 className="hero-title">On-Chain Copyright Court</h1>
            <p className="hero-subtitle">
              AI jury reads both works. Validators reach consensus. Plagiarism
              gets a verdict.
            </p>
            <div className="hero-actions">
              <a href="#court" className="btn btn-primary btn-lg">
                File a Claim
              </a>
              <a href="#how-it-works" className="btn btn-outline btn-lg">
                Learn More
              </a>
            </div>
          </div>
          <div className="hero-stats">
            <div className="stat-card">
              <span className="stat-value">
                {account ? totalClaims : '--'}
              </span>
              <span className="stat-label">Total Claims</span>
            </div>
            <div className="stat-card">
              <span className="stat-value">
                {account ? adjudicatedCount : '--'}
              </span>
              <span className="stat-label">Adjudicated</span>
            </div>
            <div className="stat-card">
              <span className="stat-value">
                {account ? `${successRate}%` : '--'}
              </span>
              <span className="stat-label">Success Rate</span>
            </div>
          </div>
        </div>
      </section>

      {/* ===== PROBLEM ===== */}
      <section id="problem" className="section-block">
        <div className="container">
          <h2 className="section-heading">The Problem</h2>
          <div className="card-grid card-grid-3">
            <div className="info-card">
              <div className="info-icon">
                <svg
                  width="32"
                  height="32"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 2L3 7v5c0 5.25 3.83 10.14 9 11.28C17.17 22.14 21 17.25 21 12V7l-9-5z" />
                  <path d="M9 9l6 6M15 9l-6 6" />
                </svg>
              </div>
              <h3>DMCA is Broken</h3>
              <p>
                Takedown abuse runs rampant. Legitimate content gets removed
                without due process while actual plagiarists game the system.
              </p>
            </div>
            <div className="info-card">
              <div className="info-icon">
                <svg
                  width="32"
                  height="32"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="2" y="6" width="20" height="12" rx="2" />
                  <circle cx="12" cy="12" r="3" />
                  <line x1="2" y1="10" x2="5" y2="10" />
                  <line x1="19" y1="10" x2="22" y2="10" />
                  <line x1="2" y1="14" x2="5" y2="14" />
                  <line x1="19" y1="14" x2="22" y2="14" />
                </svg>
              </div>
              <h3>Expensive Litigation</h3>
              <p>
                Lawyers cost $300 per hour. Most creators cannot afford to
                defend their work through the traditional legal system.
              </p>
            </div>
            <div className="info-card">
              <div className="info-icon">
                <svg
                  width="32"
                  height="32"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                  <line x1="4" y1="4" x2="20" y2="20" />
                </svg>
              </div>
              <h3>Opaque Verdicts</h3>
              <p>
                Courts deliver decisions without transparent reasoning. No
                similarity analysis, no public audit trail.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ===== HOW IT WORKS ===== */}
      <section id="how-it-works" className="section-block section-alt">
        <div className="container">
          <h2 className="section-heading">How It Works</h2>
          <div className="steps-flow">
            <div className="step-card">
              <div className="step-number">1</div>
              <h3>File</h3>
              <p>
                Submit the original and accused URLs with your statement and a
                bond deposit.
              </p>
            </div>
            <div className="step-arrow" aria-hidden="true">
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M5 12h14M13 5l7 7-7 7" />
              </svg>
            </div>
            <div className="step-card">
              <div className="step-number">2</div>
              <h3>Respond</h3>
              <p>
                The accused party files their defense statement to present
                their side.
              </p>
            </div>
            <div className="step-arrow" aria-hidden="true">
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M5 12h14M13 5l7 7-7 7" />
              </svg>
            </div>
            <div className="step-card">
              <div className="step-number">3</div>
              <h3>Adjudicate</h3>
              <p>
                AI reads both works, validators reach consensus, and a verdict
                is delivered on-chain.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ===== COURT ===== */}
      <section id="court" className="section-block">
        <div className="container">
          <div className="court-header">
            <h2 className="section-heading">Copyright Court</h2>
            {account && CONTRACT_ADDRESS && (
              <span className="claim-count">
                {claims.length} claims on-chain
              </span>
            )}
          </div>

          {!account ? (
            <div className="connect-prompt">
              <h3>Connect Your Wallet</h3>
              <p>
                Connect your MetaMask wallet to file plagiarism claims, respond
                to accusations, or request AI-powered adjudication.
              </p>
              <button className="btn btn-connect" onClick={handleConnect}>
                Connect MetaMask
              </button>
            </div>
          ) : !CONTRACT_ADDRESS ? (
            <div className="connect-prompt">
              <h3>Contract Not Configured</h3>
              <p>
                Set <code>VITE_CONTRACT_ADDRESS</code> in your{' '}
                <code>.env</code> file to connect to the deployed contract.
              </p>
            </div>
          ) : (
            <>
              <div className="court-panels">
                <div className="court-panel">
                  <h3 className="panel-title">File a Claim</h3>
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
                </div>

                <div className="court-panel">
                  <div className="panel-header">
                    <h3 className="panel-title">Claims</h3>
                    <button
                      className="btn btn-sm btn-secondary"
                      onClick={fetchClaims}
                      disabled={loading}
                    >
                      {loading ? 'Loading...' : 'Refresh'}
                    </button>
                  </div>
                  <div className="claims-list">
                    {loading && claims.length === 0 && (
                      <div className="loading-state">
                        <Spinner />
                        <span>Loading claims...</span>
                      </div>
                    )}
                    {!loading && claims.length === 0 && (
                      <p className="empty-state">
                        No claims filed yet. Be the first to submit a copyright
                        claim.
                      </p>
                    )}
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
                              {claim.original_url.length > 40
                                ? claim.original_url.slice(0, 40) + '...'
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
                              {claim.accused_url.length > 40
                                ? claim.accused_url.slice(0, 40) + '...'
                                : claim.accused_url}
                            </a>
                          </div>
                        </div>
                        <div className="claim-meta">
                          <span className="bond-amount">
                            Bond: {weiToGen(claim.bond)} GEN
                          </span>
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
                </div>
              </div>

              {selectedClaim && (
                <div className="claim-detail">
                  <div className="detail-header">
                    <h3>Claim #{selectedClaim.id} Details</h3>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => setSelectedClaim(null)}
                    >
                      Close
                    </button>
                  </div>
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
                      <span className="detail-value">
                        {weiToGen(selectedClaim.bond)} GEN
                      </span>
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
                          <SimilarityMeter
                            pct={selectedClaim.similarity_pct}
                          />
                        </div>
                        <div className="detail-item full-width">
                          <span className="detail-label">Reason</span>
                          <p className="detail-text">
                            {selectedClaim.reason}
                          </p>
                        </div>
                      </>
                    )}
                  </div>

                  <div className="detail-actions">
                    {selectedClaim.status === 'OPEN' && (
                      <div className="respond-form">
                        <h4>Respond to This Claim</h4>
                        <textarea
                          placeholder="Enter your defense statement..."
                          value={responseStatement}
                          onChange={(e) =>
                            setResponseStatement(e.target.value)
                          }
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
                      href={addressExplorerUrl(CONTRACT_ADDRESS)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-outline"
                    >
                      View on Explorer
                    </a>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </section>

      {/* ===== VERDICTS ===== */}
      <section id="verdicts" className="section-block section-alt">
        <div className="container">
          <h2 className="section-heading">Recent Verdicts</h2>
          {adjudicatedClaims.length === 0 ? (
            <p className="empty-text">
              {account
                ? 'No verdicts have been delivered yet.'
                : 'Connect your wallet to view on-chain verdicts.'}
            </p>
          ) : (
            <div className="card-grid card-grid-2">
              {adjudicatedClaims.map((claim) => (
                <div key={claim.id} className="verdict-card">
                  <div className="verdict-card-header">
                    <span className="verdict-claim-id">
                      Claim #{claim.id}
                    </span>
                    <VerdictBadge verdict={claim.verdict} />
                  </div>
                  <SimilarityMeter pct={claim.similarity_pct} />
                  <p className="verdict-reason">
                    {claim.reason && claim.reason.length > 200
                      ? claim.reason.slice(0, 200) + '...'
                      : claim.reason}
                  </p>
                  <p className="verdict-attribution">
                    This verdict was produced by on-chain AI consensus
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ===== ARCHITECTURE ===== */}
      <section id="architecture" className="section-block">
        <div className="container">
          <h2 className="section-heading">Architecture</h2>
          <div className="pipeline">
            {[
              'User Submits',
              'Contract Fetches URLs',
              'LLM Analyzes',
              'Validators Verify',
              'Consensus Verdict',
            ].map((label, i, arr) => (
              <React.Fragment key={label}>
                <div className="pipeline-box">{label}</div>
                {i < arr.length - 1 && (
                  <div className="pipeline-arrow" aria-hidden="true">
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M5 12h14M13 5l7 7-7 7" />
                    </svg>
                  </div>
                )}
              </React.Fragment>
            ))}
          </div>

          <div className="card-grid card-grid-3">
            <div className="tech-card">
              <code className="tech-name">gl.nondet.web.render</code>
              <p>
                Reads live web content directly on-chain. The contract fetches
                and parses both URLs during execution.
              </p>
            </div>
            <div className="tech-card">
              <code className="tech-name">gl.nondet.exec_prompt</code>
              <p>
                LLM inference at the consensus layer. Each validator
                independently analyzes both works for similarity.
              </p>
            </div>
            <div className="tech-card">
              <code className="tech-name">gl.vm.run_nondet</code>
              <p>
                Custom validator logic that compares verdict meaning, ensuring
                consensus on the substantive outcome.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ===== USE CASES ===== */}
      <section id="use-cases" className="section-block section-alt">
        <div className="container">
          <h2 className="section-heading">Use Cases</h2>
          <div className="card-grid card-grid-4">
            <div className="use-case-card">
              <h3>Writers & Bloggers</h3>
              <p>
                Protect original articles, blog posts, and written works from
                content scrapers and unauthorized reproduction.
              </p>
            </div>
            <div className="use-case-card">
              <h3>Visual Artists</h3>
              <p>
                Verify originality of visual works and establish on-chain proof
                of creative ownership.
              </p>
            </div>
            <div className="use-case-card">
              <h3>Musicians</h3>
              <p>
                Compare compositions and establish precedent for musical
                originality disputes.
              </p>
            </div>
            <div className="use-case-card">
              <h3>Open Source</h3>
              <p>
                Enforce license compliance and detect unauthorized use of open
                source code in proprietary projects.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ===== FAQ ===== */}
      <section id="faq" className="section-block">
        <div className="container">
          <h2 className="section-heading">Frequently Asked Questions</h2>
          <div className="faq-list">
            {FAQ_ITEMS.map((item, index) => (
              <div
                key={index}
                className={`faq-item ${openFaq === index ? 'faq-open' : ''}`}
              >
                <button
                  className="faq-question"
                  onClick={() => toggleFaq(index)}
                >
                  <span>{item.question}</span>
                  <span className="faq-chevron" aria-hidden="true" />
                </button>
                <div className="faq-answer">
                  <p>{item.answer}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== HOW TO USE ===== */}
      <section id="how-to-use" className="section-block section-alt">
        <div className="container">
          <h2 className="section-heading">How to Use</h2>
          <div className="card-grid card-grid-4">
            <div className="howto-card">
              <div className="howto-number">1</div>
              <h3>Install MetaMask</h3>
              <p>
                Download and install the MetaMask browser extension from
                metamask.io.
              </p>
            </div>
            <div className="howto-card">
              <div className="howto-number">2</div>
              <h3>Get GEN Tokens</h3>
              <p>
                Visit GenLayer Studio to get testnet GEN tokens for the
                Studionet network.
              </p>
              <a
                href="https://studio.genlayer.com"
                target="_blank"
                rel="noopener noreferrer"
                className="card-link"
              >
                Open GenLayer Studio
              </a>
            </div>
            <div className="howto-card">
              <div className="howto-number">3</div>
              <h3>Connect to Studionet</h3>
              <p>
                Click Connect Wallet above. The app will automatically add the
                Studionet network to MetaMask.
              </p>
            </div>
            <div className="howto-card">
              <div className="howto-number">4</div>
              <h3>File Your Claim</h3>
              <p>
                Navigate to the Court section, fill in the URLs and your
                statement, set your bond, and submit.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ===== FOOTER ===== */}
      <footer className="footer">
        <div className="container">
          <div className="footer-grid">
            <div className="footer-col footer-brand-col">
              <div className="footer-brand">
                <img src="/logo.svg" alt="Logo" width={24} height={24} />
                <span className="footer-brand-name">
                  Death of the Author
                </span>
              </div>
              <p className="footer-tagline">
                Decentralized copyright adjudication powered by AI consensus.
              </p>
            </div>
            <div className="footer-col">
              <h4>Product</h4>
              <a href="#court">File Claim</a>
              <a href="#verdicts">View Claims</a>
              <a href="#how-it-works">How It Works</a>
            </div>
            <div className="footer-col">
              <h4>Resources</h4>
              <a
                href="https://github.com/genlayer"
                target="_blank"
                rel="noopener noreferrer"
              >
                GitHub
              </a>
              <a
                href="https://docs.genlayer.com"
                target="_blank"
                rel="noopener noreferrer"
              >
                GenLayer Docs
              </a>
              <a
                href={EXPLORER_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                Explorer
              </a>
            </div>
            <div className="footer-col">
              <h4>Network</h4>
              <span>Studionet</span>
              {CONTRACT_ADDRESS && (
                <span>Contract: {shortAddr(CONTRACT_ADDRESS)}</span>
              )}
              <a
                href="https://genlayer.com"
                target="_blank"
                rel="noopener noreferrer"
              >
                GenLayer.com
              </a>
            </div>
          </div>
          <div className="footer-bottom">
            <span>Powered by GenLayer</span>
            <span>Copyright 2024 Death of the Author</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
