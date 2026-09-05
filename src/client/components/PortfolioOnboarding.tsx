import React, { useState } from "react";
import { PortfolioTokenBalance, ReadOnlyPortfolioSnapshot } from "../../types";

export interface PortfolioOnboardingProps {
  onSelectManual: () => void;
  onSelectPrefilledAmount: (prompt: string, notice?: string) => void;
}

type OnboardingStep = "CHOICE" | "ADDRESS_INPUT" | "SNAPSHOT_RESULT";

const hasPositiveBaseUnits = (amountBaseUnits: string): boolean => {
  try {
    return BigInt(amountBaseUnits) > 0n;
  } catch {
    return false;
  }
};

export const PortfolioOnboarding: React.FC<PortfolioOnboardingProps> = ({
  onSelectManual,
  onSelectPrefilledAmount,
}) => {
  const [step, setStep] = useState<OnboardingStep>("CHOICE");
  const [addressInput, setAddressInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<ReadOnlyPortfolioSnapshot | null>(
    null
  );

  const handleAnalyze = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setErrorMsg(null);

    const trimmed = addressInput.trim();
    if (!/^0x[0-9a-fA-F]{40}$/.test(trimmed)) {
      setErrorMsg(
        "Invalid EVM address format. Must be 0x followed by 40 hexadecimal characters."
      );
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch("/api/v1/portfolio/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: trimmed }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(
          data.error || "Failed to analyze public Base address."
        );
      }

      setSnapshot(data);
      setStep("SNAPSHOT_RESULT");
    } catch (err: any) {
      setErrorMsg(err.message || "Network error analyzing address.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectToken = (b: PortfolioTokenBalance) => {
    if (b.asset === "USDC") return;

    if (!hasPositiveBaseUnits(b.amountBaseUnits)) return;

    let prefillPrompt = "";
    let normalizationNotice = "";

    if (b.asset === "ETH") {
      prefillPrompt = `Protect ${b.formattedAmount} ETH.`;
      normalizationNotice = `Amount selected from ${b.formattedAmount} ETH on the public address.`;
    } else if (b.asset === "WETH") {
      prefillPrompt = `Protect ${b.formattedAmount} ETH.`;
      normalizationNotice = `Selected from ${b.formattedAmount} WETH on the public address. WETH protection is modeled against ETH.`;
    } else if (b.asset === "CBBTC" || b.asset === "BTC") {
      prefillPrompt = `Protect ${b.formattedAmount} BTC.`;
      normalizationNotice = `Selected from ${b.formattedAmount} cbBTC on the public address. cbBTC protection is modeled against BTC.`;
    } else {
      prefillPrompt = `Protect ${b.formattedAmount} ${b.displaySymbol}.`;
      normalizationNotice = `Amount selected from ${b.formattedAmount} ${b.displaySymbol} on the public address.`;
    }

    onSelectPrefilledAmount(prefillPrompt, normalizationNotice);
  };

  const truncateAddress = (addr: string) =>
    addr.length > 10 ? `${addr.substring(0, 6)}...${addr.substring(addr.length - 4)}` : addr;

  return (
    <div className="portfolio-onboarding-container">
      {step === "CHOICE" && (
        <section className="card">
          <div className="portfolio-choice-header">
            <h1>Protect outcomes, not instruments.</h1>
            <p>What would you like to protect?</p>
          </div>

          <div className="choice-grid">
            <button
              type="button"
              className="choice-card"
              onClick={() => setStep("ADDRESS_INPUT")}
            >
              <h3 style={{ margin: "0 0 0.5rem 0", fontSize: "1.1rem" }}>
                Analyse a Base address
              </h3>
              <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--text-secondary, #64748b)" }}>
                Read balances from a public Base Mainnet address to pick an asset and amount.
              </p>
            </button>

            <button
              type="button"
              className="choice-card"
              onClick={onSelectManual}
            >
              <h3 style={{ margin: "0 0 0.5rem 0", fontSize: "1.1rem" }}>
                Enter holdings manually
              </h3>
              <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--text-secondary, #64748b)" }}>
                Describe what you want protected yourself in natural language.
              </p>
            </button>
          </div>

          <div className="security-notice-banner">
            🔒 Read-only by design. HedgeOS never asks for a seed phrase or private key.
          </div>
        </section>
      )}

      {step === "ADDRESS_INPUT" && (
        <section className="card">
          <div className="card-header" style={{ marginBottom: "1.25rem" }}>
            <h2 style={{ fontSize: "1.35rem", margin: "0 0 0.5rem 0" }}>
              Analyse a public Base address
            </h2>
            <p className="card-subtitle" style={{ margin: 0 }}>
              Enter a public Base Mainnet address to view supported balances. This does not connect a wallet.
            </p>
          </div>

          <form onSubmit={handleAnalyze}>
            <div style={{ marginBottom: "1.25rem" }}>
              <label
                htmlFor="base-address-input"
                style={{ display: "block", marginBottom: "0.5rem", fontWeight: 600, fontSize: "0.9rem" }}
              >
                Public Base Mainnet Address
              </label>
              <input
                id="base-address-input"
                type="text"
                className="input base-address-input"
                placeholder="0x..."
                value={addressInput}
                onChange={(e) => setAddressInput(e.target.value)}
                disabled={isLoading}
                style={{ width: "100%", fontFamily: "monospace" }}
              />
            </div>

            <div
              className="warning-notice"
              style={{
                marginBottom: "1.25rem",
                padding: "0.75rem",
                borderRadius: "6px",
                fontSize: "0.85rem",
                background: "var(--warning-bg, #fffbeb)",
                color: "var(--warning-text, #b45309)",
                border: "1px solid var(--warning-border, #fef3c7)",
              }}
            >
              ⚠️ Public address only — never enter a seed phrase or private key.
            </div>

            {errorMsg && (
              <div
                className="error-notice"
                style={{
                  marginBottom: "1.25rem",
                  padding: "0.75rem",
                  borderRadius: "6px",
                  fontSize: "0.85rem",
                  background: "var(--error-bg, #fef2f2)",
                  color: "var(--error-text, #b91c1c)",
                  border: "1px solid var(--error-border, #fecaca)",
                }}
              >
                {errorMsg}
              </div>
            )}

            <div className="action-row" style={{ display: "flex", gap: "0.75rem" }}>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={isLoading || !addressInput.trim()}
              >
                {isLoading ? "Reading Base Mainnet balances..." : "Analyse Address"}
              </button>

              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setErrorMsg(null);
                  setStep("CHOICE");
                }}
                disabled={isLoading}
              >
                Back
              </button>
            </div>
          </form>
        </section>
      )}

      {step === "SNAPSHOT_RESULT" && snapshot && (
        <section className="card">
          <div className="card-header" style={{ marginBottom: "1.25rem" }}>
            <div className="portfolio-result-header-row">
              <h2 style={{ fontSize: "1.35rem", margin: 0 }}>
                Balances for this public address
              </h2>
              {(() => {
                const isDemoPortfolio =
                  snapshot.warnings?.some(
                    (warning) =>
                      warning.includes(
                        "RECORDED DEMO PORTFOLIO"
                      )
                  );

                return (
                  <span className="badge badge-info">
                    {isDemoPortfolio
                      ? "RECORDED DEMO PORTFOLIO • NOT LIVE FUNDS"
                      : `Base Mainnet • Read-only snapshot${snapshot.status ===
                        "PARTIAL"
                        ? " • Partial"
                        : ""
                      }`}
                  </span>
                );
              })()}
            </div>

            <p style={{ margin: 0, fontFamily: "monospace", fontSize: "0.9rem", color: "var(--text-secondary, #64748b)" }}>
              {truncateAddress(snapshot.address)}
            </p>
          </div>

          {snapshot.warnings && snapshot.warnings.length > 0 && (
            <div style={{ marginBottom: "1.25rem" }}>
              {snapshot.warnings.map((w, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: "0.6rem 0.8rem",
                    borderRadius: "6px",
                    fontSize: "0.85rem",
                    background: "var(--warning-bg, #fffbeb)",
                    color: "var(--warning-text, #b45309)",
                    marginBottom: "0.5rem",
                  }}
                >
                  ⚠️ {w}
                </div>
              ))}
            </div>
          )}

          <div className="balances-list" style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginBottom: "1.5rem" }}>
            {snapshot.balances.map((b) => {
              const isZero = !hasPositiveBaseUnits(b.amountBaseUnits);
              const isUsdc = b.asset === "USDC";

              return (
                <div
                  key={b.asset}
                  className="balance-card"
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "1rem",
                    borderRadius: "8px",
                    border: "1px solid var(--border-color, #e2e8f0)",
                    background: "var(--bg-secondary, #f8fafc)",
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600, fontSize: "1rem" }}>
                      {b.formattedAmount} {b.displaySymbol}
                    </div>
                    <div style={{ fontSize: "0.8rem", color: "var(--text-secondary, #64748b)", marginTop: "0.2rem" }}>
                      {b.asset === "WETH" && "WETH protection is modeled against ETH."}
                      {(b.asset === "CBBTC" || b.asset === "BTC") && "cbBTC protection is modeled against BTC."}
                      {b.asset === "USDC" && "Protection budget denomination asset."}
                      {b.asset === "ETH" && "Native Base Asset."}
                    </div>
                  </div>

                  <div>
                    {!isUsdc ? (
                      <button
                        type="button"
                        className="btn btn-outline"
                        style={{ fontSize: "0.85rem", padding: "0.4rem 0.85rem" }}
                        disabled={isZero}
                        onClick={() => handleSelectToken(b)}
                      >
                        Use this amount
                      </button>
                    ) : (
                      <span
                        style={{
                          fontSize: "0.8rem",
                          color: "var(--text-secondary, #64748b)",
                          fontStyle: "italic",
                        }}
                      >
                        Budget Asset
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="action-row" style={{ display: "flex", gap: "0.75rem" }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setSnapshot(null);
                setStep("ADDRESS_INPUT");
              }}
            >
              Analyze Another Address
            </button>

            <button
              type="button"
              className="btn btn-secondary"
              onClick={onSelectManual}
            >
              Enter Holdings Manually
            </button>
          </div>
        </section>
      )}
    </div>
  );
};
