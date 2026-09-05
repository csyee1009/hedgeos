import React, { useState } from "react";
import {
  CandidateStrategy,
  ExecutionPreparation,
  ExecutionVerificationRecord,
  TypedRiskIntent,
  formatTokenAmount,
} from "../../types";

export type Track2State =
  | "TRACK2_NOT_STARTED"
  | "TRACK2_LIVE_ORDER_SELECTED"
  | "TRACK2_REVALIDATED"
  | "TRACK2_UNSIGNED_TX_READY"
  | "TRACK2_AWAITING_EXTERNAL_AUTHORIZATION"
  | "TRACK2_TX_HASH_PROVIDED"
  | "TRACK2_VERIFYING"
  | "TRACK2_VERIFIED_REAL_TRADE"
  | "TRACK2_VERIFICATION_FAILED";

export function ExternalExecutionPanel(props: {
  intent: TypedRiskIntent;
  candidate: CandidateStrategy;
  onBackToMarket?: () => void;
}) {
  const [beneficiary, setBeneficiary] = useState("");
  const [preparation, setPreparation] = useState<ExecutionPreparation>();
  const [preSignRevalidation, setPreSignRevalidation] = useState<any>();
  const [externalAuthorization, setExternalAuthorization] = useState<any>();
  const [transactionHash, setTransactionHash] = useState("");
  const [verification, setVerification] = useState<ExecutionVerificationRecord>();
  const [message, setMessage] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [messageType, setMessageType] = useState<"INFO" | "ERROR" | "SUCCESS">("INFO");
  const [track2State, setTrack2State] = useState<Track2State>("TRACK2_LIVE_ORDER_SELECTED");

  const resetExecutionEvidence = () => {
    setPreparation(undefined);
    setPreSignRevalidation(undefined);
    setExternalAuthorization(undefined);
    setVerification(undefined);
    setTransactionHash("");
    setTrack2State("TRACK2_LIVE_ORDER_SELECTED");
  };

  const prepare = async () => {
    setBusy(true);
    setMessage(undefined);
    setMessageType("INFO");
    setPreparation(undefined);
    setPreSignRevalidation(undefined);
    setExternalAuthorization(undefined);
    setVerification(undefined);
    setTransactionHash("");

    try {
      const response = await fetch("/api/v1/executions/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          intentId: props.intent.intentId,
          strategyId: props.candidate.strategyId,
          expectedBeneficiary: beneficiary,
        }),
      });

      const data: any = await response.json();

      if (!response.ok) {
        if (data.status === "REVALIDATION_REQUIRED") {
          setPreSignRevalidation(data.preSignRevalidation);
          setExternalAuthorization(data.externalAuthorization);
          setMessageType("ERROR");
          setMessage(
            data.explanation ||
              "Fresh Thetanuts evidence changed. HedgeOS did not release the old transaction for external authorization."
          );
          setTrack2State("TRACK2_VERIFICATION_FAILED");
          return;
        }
        throw new Error(data.error || data.explanation || "Exact transaction preparation failed");
      }

      if (!data.preparation) {
        throw new Error("The server did not return exact preparation evidence.");
      }

      if (data.preSignRevalidation?.status !== "REVALIDATED") {
        setPreSignRevalidation(data.preSignRevalidation);
        setMessageType("ERROR");
        setMessage("Exact preparation was not released because fresh pre-authorization revalidation did not pass.");
        setTrack2State("TRACK2_VERIFICATION_FAILED");
        return;
      }

      setPreparation(data.preparation);
      setPreSignRevalidation(data.preSignRevalidation);
      setExternalAuthorization(data.externalAuthorization);
      setMessageType("SUCCESS");
      setMessage(
        "The exact unsigned Thetanuts action passed fresh pre-authorization revalidation. HedgeOS does not sign or broadcast transactions."
      );

      // Transition through state machine cleanly:
      // TRACK2_REVALIDATED -> TRACK2_UNSIGNED_TX_READY -> TRACK2_AWAITING_EXTERNAL_AUTHORIZATION
      setTrack2State("TRACK2_AWAITING_EXTERNAL_AUTHORIZATION");
    } catch (error) {
      setMessageType("ERROR");
      setMessage(error instanceof Error ? error.message : "Preparation failed");
      setTrack2State("TRACK2_VERIFICATION_FAILED");
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    if (!preparation) return;

    setBusy(true);
    setMessage(undefined);
    setMessageType("INFO");
    setVerification(undefined);
    setTrack2State("TRACK2_VERIFYING");

    try {
      const response = await fetch("/api/v1/executions/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          preparationId: preparation.preparationId,
          transactionHash,
        }),
      });

      const data: any = await response.json();

      if (!response.ok && !data.verification) {
        throw new Error(data.error || "Verification failed");
      }

      if (!data.verification) {
        throw new Error("No verification evidence was returned.");
      }

      setVerification(data.verification);

      if (data.verification.status === "POSITION_CONFIRMED") {
        setMessageType("SUCCESS");
        setMessage(
          "The resulting protection position was independently confirmed from Base transaction, event, and option-contract evidence."
        );
        setTrack2State("TRACK2_VERIFIED_REAL_TRADE");
      } else {
        setMessageType("ERROR");
        setMessage(
          data.verification.explanation || "The transaction was observed but protection could not be verified."
        );
        setTrack2State("TRACK2_VERIFICATION_FAILED");
      }
    } catch (error) {
      setMessageType("ERROR");
      setMessage(error instanceof Error ? error.message : "Verification failed");
      setTrack2State("TRACK2_VERIFICATION_FAILED");
    } finally {
      setBusy(false);
    }
  };

  const selectedQuote = props.candidate.quotes[0];
  const strikeDisplay = selectedQuote?.strikePrice
    ? formatTokenAmount(selectedQuote.strikePrice)
    : "N/A";
  const expiryDisplay = selectedQuote?.expiryTimestampMs
    ? new Date(selectedQuote.expiryTimestampMs).toLocaleString()
    : "N/A";
  const quantityDisplay = formatTokenAmount(props.intent.exposureAmount.value);

  const unsignedTxPackage = preparation
    ? {
        chainId: preparation.transaction.chainId,
        to: preparation.transaction.to,
        data: preparation.transaction.data,
        value: preparation.transaction.value,
        selectedOrderId: selectedQuote?.quoteId || props.candidate.strategyId,
        quoteId: selectedQuote?.quoteId || "N/A",
        implementationAddress: preparation.transaction.order?.implementation || selectedQuote?.implementationAddress || "N/A",
        underlying: props.intent.asset.value,
        optionRight: "PUT",
        takerDirection: "BUY / LONG PUT",
        strike: strikeDisplay,
        expiry: expiryDisplay,
        quantity: quantityDisplay,
        expectedCost: formatTokenAmount(preparation.transaction.exactBuyerSpendUSDC),
        preparedAt: new Date(preparation.createdAtMs).toISOString(),
        freshnessDeadline: new Date(preparation.transaction.validUntilMs).toISOString(),
        proposalDigest: preparation.transaction.semanticDigest || preparation.proposalDigest,
      }
    : null;

  const handleCopyTxDetails = () => {
    if (unsignedTxPackage) {
      navigator.clipboard.writeText(JSON.stringify(unsignedTxPackage, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    }
  };

  const messageClass =
    messageType === "ERROR" ? "alert alert-danger" : messageType === "SUCCESS" ? "alert alert-success" : "alert alert-info";

  const isVerified = track2State === "TRACK2_VERIFIED_REAL_TRADE";

  return (
    <section className="card execution-panel" style={{ marginTop: "1.5rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
        <p className="eyebrow" style={{ margin: 0 }}>NON-CUSTODIAL EXECUTION & TRACK 2 VERIFICATION</p>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          {props.onBackToMarket && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={props.onBackToMarket}
              style={{ fontSize: "0.8rem", padding: "0.25rem 0.5rem" }}
            >
              ← Back to Market
            </button>
          )}
          <span
            className={
              isVerified
                ? "badge badge-success"
                : track2State === "TRACK2_AWAITING_EXTERNAL_AUTHORIZATION"
                ? "badge badge-warning"
                : track2State === "TRACK2_VERIFICATION_FAILED"
                ? "badge badge-danger"
                : "badge badge-neutral"
            }
          >
            TRACK 2 STATE: {track2State}
          </span>
        </div>
      </div>

      <h2 style={{ marginTop: "0.5rem" }}>Review Protection & External Authorization</h2>

      <p className="card-subtitle">
        HedgeOS verifies your selected outcome, prepares the exact unsigned Thetanuts transaction, and performs a second live market check immediately before an external authorization handoff.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "0.75rem", marginTop: "1rem", fontSize: "0.85rem" }}>
        <div>
          <strong>Asset & Quantity:</strong>
          <div>{quantityDisplay}</div>
        </div>
        <div>
          <strong>Maximum Spend:</strong>
          <div>{formatTokenAmount(props.intent.maxPremiumUSDC.value)}</div>
        </div>
        <div>
          <strong>Target Downside:</strong>
          <div>{props.intent.targetMaxLossPercent.value}%</div>
        </div>
        <div>
          <strong>Network:</strong>
          <div>Base Mainnet · Chain ID 8453</div>
        </div>
        <div>
          <strong>Protocol & Strategy:</strong>
          <div>Thetanuts · {props.candidate.strategyType}</div>
        </div>
      </div>

      <div style={{ marginTop: "1rem", padding: "0.75rem", background: "var(--surface-secondary)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)" }}>
        <span className="badge badge-info" style={{ marginBottom: "0.35rem" }}>
          RECORDED DEMO PORTFOLIO — NOT LIVE FUNDS
        </span>
        <p style={{ margin: "0.25rem 0 0", fontSize: "0.82rem", color: "var(--text-secondary)" }}>
          Synthetic demo portfolio mode is active for holdings display. Live OptionBook contract evaluation, deterministic intent verification, and unsigned transaction package preparation remain real Base Mainnet evidence.
        </p>
      </div>

      <div style={{ marginTop: "1.25rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.35rem", flexWrap: "wrap", gap: "0.5rem" }}>
          <label htmlFor="beneficiary" style={{ margin: 0, fontSize: "0.875rem" }}>
            <strong>External Beneficiary / Wallet Address (Base Mainnet 0x...)</strong>
          </label>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => {
              setBeneficiary("0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045");
              resetExecutionEvidence();
              setMessage(undefined);
            }}
            style={{ fontSize: "0.78rem", padding: "0.15rem 0.5rem" }}
          >
            Use Demo Beneficiary (0xd8d…)
          </button>
        </div>

        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <input
            id="beneficiary"
            value={beneficiary}
            onChange={(e) => {
              setBeneficiary(e.target.value.trim());
              resetExecutionEvidence();
              setMessage(undefined);
            }}
            placeholder="0x…"
            autoComplete="off"
            style={{ flex: 1, minWidth: "260px", padding: "0.45rem 0.75rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)" }}
          />

          <button
            className="btn btn-primary"
            type="button"
            disabled={busy || !/^0x[0-9a-fA-F]{40}$/.test(beneficiary)}
            onClick={prepare}
          >
            {busy ? "Checking exact action…" : "Prepare & Revalidate Unsigned Tx"}
          </button>
        </div>
      </div>

      <p className="disclosure" style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginTop: "0.5rem" }}>
        🛡️ HedgeOS has no private keys or internal signers and does not broadcast transactions. Financial authorization remains strictly external.
      </p>

      {message && <div className={messageClass} style={{ marginTop: "1rem" }}>{message}</div>}

      {/* UNSIGNED TRANSACTION PACKAGE */}
      {unsignedTxPackage && (
        <div style={{ marginTop: "1.25rem", padding: "1rem", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--surface-secondary)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
            <div>
              <span className="badge badge-info">UNSIGNED TRANSACTION</span>
              <strong style={{ marginLeft: "0.5rem", fontSize: "0.85rem", color: "var(--text-secondary)" }}>EXTERNAL AUTHORIZATION REQUIRED</strong>
            </div>
            <button type="button" className="btn btn-secondary btn-sm" onClick={handleCopyTxDetails}>
              {copied ? "✓ Copied to Clipboard!" : "📋 Copy Transaction Details"}
            </button>
          </div>

          <div style={{ marginTop: "0.75rem", fontSize: "0.82rem", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "0.5rem" }}>
            <div><strong>Chain ID:</strong> {unsignedTxPackage.chainId}</div>
            <div><strong>To Address:</strong> <code>{unsignedTxPackage.to}</code></div>
            <div><strong>Selected Order ID:</strong> {unsignedTxPackage.selectedOrderId}</div>
            <div><strong>Implementation:</strong> <code>{unsignedTxPackage.implementationAddress}</code></div>
            <div><strong>Asset & Right:</strong> {unsignedTxPackage.underlying} {unsignedTxPackage.optionRight} ({unsignedTxPackage.takerDirection})</div>
            <div><strong>Strike / Expiry:</strong> {unsignedTxPackage.strike} • {unsignedTxPackage.expiry}</div>
            <div><strong>Quantity:</strong> {unsignedTxPackage.quantity}</div>
            <div><strong>Expected Cost:</strong> {unsignedTxPackage.expectedCost}</div>
            <div><strong>Freshness Deadline:</strong> {unsignedTxPackage.freshnessDeadline}</div>
          </div>

          <p style={{ marginTop: "0.75rem", fontSize: "0.76rem", color: "var(--text-secondary)", fontStyle: "italic", margin: "0.75rem 0 0" }}>
            Notice: This package contains only safe/public execution metadata. Never includes private keys, seed phrases, signed raw transactions, or wallet secrets.
          </p>

          {/* EXTERNAL WALLET AUTHORIZATION HANDOFF */}
          <div style={{ marginTop: "1rem", padding: "0.85rem", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--surface)" }}>
            <strong style={{ fontSize: "0.88rem" }}>EXTERNAL WALLET AUTHORIZATION REQUIRED</strong>
            <p style={{ fontSize: "0.82rem", margin: "0.35rem 0 0.75rem" }}>
              HedgeOS has prepared and verified the exact transaction. Authorization and signing occur outside HedgeOS using a user-controlled wallet.
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "0.4rem", fontSize: "0.8rem" }}>
              <span>Network: <strong>Base Mainnet (8453)</strong></span>
              <span>Selected Order: <strong>{unsignedTxPackage.quoteId}</strong></span>
              <span>Strike: <strong>{unsignedTxPackage.strike}</strong></span>
              <span>Expiry: <strong>{unsignedTxPackage.expiry}</strong></span>
              <span>Quantity: <strong>{unsignedTxPackage.quantity}</strong></span>
              <span>Expected Cost: <strong>{unsignedTxPackage.expectedCost}</strong></span>
              <span>Contract: <code>{unsignedTxPackage.to.slice(0, 10)}...</code></span>
              <span>Freshness: <strong style={{ color: "var(--color-success, #10b981)" }}>REVALIDATED</strong></span>
            </div>
          </div>

          {/* TRANSACTION HASH RETURN & VERIFICATION */}
          <div style={{ marginTop: "1.25rem" }}>
            <label htmlFor="tx-hash" style={{ display: "block", marginBottom: "0.35rem", fontSize: "0.875rem" }}>
              <strong>Base Mainnet Transaction Hash (Returned after external wallet authorization)</strong>
            </label>

            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              <input
                id="tx-hash"
                value={transactionHash}
                onChange={(e) => {
                  const val = e.target.value.trim();
                  setTransactionHash(val);
                  if (/^0x[0-9a-fA-F]{64}$/.test(val)) {
                    setTrack2State("TRACK2_TX_HASH_PROVIDED");
                  }
                }}
                placeholder="0x... (64 hex characters)"
                autoComplete="off"
                style={{ flex: 1, minWidth: "260px", padding: "0.45rem 0.75rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)" }}
              />

              <button
                className="btn btn-primary"
                type="button"
                disabled={busy || !/^0x[0-9a-fA-F]{64}$/.test(transactionHash)}
                onClick={verify}
              >
                {busy ? "Verifying on Base..." : "Verify Real Trade"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* VERIFIED TRADE EVIDENCE CARD */}
      {verification && verification.status === "POSITION_CONFIRMED" && (
        <div style={{ marginTop: "1.25rem", padding: "1.1rem", border: "2px solid var(--color-success, #10b981)", borderRadius: "var(--radius-md)", background: "rgba(16, 185, 129, 0.08)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
            <h3 style={{ margin: 0, color: "var(--color-success, #10b981)" }}>TRACK 2 — REAL TRADE VERIFIED</h3>
            <span className="badge badge-success">VERIFIED REAL TRADE</span>
          </div>

          <div style={{ marginTop: "0.85rem", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "0.6rem", fontSize: "0.85rem" }}>
            <div>Network: <strong>Base Mainnet (8453)</strong></div>
            <div>Transaction Hash: <code>{verification.transactionHash.slice(0, 14)}...{verification.transactionHash.slice(-10)}</code></div>
            <div>Receipt Status: <strong style={{ color: "var(--color-success, #10b981)" }}>SUCCESS</strong></div>
            <div>Thetanuts Contract: <code>{verification.position?.optionAddress || preparation?.transaction.to}</code></div>
            <div>Selected Order: <strong>{unsignedTxPackage?.selectedOrderId || "N/A"}</strong></div>
            <div>Structure: <strong>VANILLA PUT · SINGLE STRIKE</strong></div>
            <div>Quantity: <strong>{quantityDisplay}</strong></div>
            <div>Verification Time: <strong>{new Date(verification.checkedAtMs).toLocaleString()}</strong></div>
          </div>

          <div style={{ marginTop: "1rem", paddingTop: "0.75rem", borderTop: "1px solid var(--border)", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "0.35rem", fontSize: "0.82rem" }}>
            <div>AI interpreted intent: <strong>YES</strong></div>
            <div>Live order selected: <strong>YES</strong></div>
            <div>Deterministic verification: <strong>PASS</strong></div>
            <div>Real mainnet transaction: <strong>VERIFIED</strong></div>
            <div>AI-held private key: <strong>NO</strong></div>
            <div>AI autonomous signing: <strong>NO</strong></div>
          </div>
        </div>
      )}

      {/* FAILURE EVIDENCE CARD */}
      {verification && verification.status !== "POSITION_CONFIRMED" && (
        <div style={{ marginTop: "1.25rem", padding: "1.1rem", border: "2px solid var(--color-danger, #ef4444)", borderRadius: "var(--radius-md)", background: "rgba(239, 68, 68, 0.08)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
            <h3 style={{ margin: 0, color: "var(--color-danger, #ef4444)" }}>TRACK 2 — NOT VERIFIED</h3>
            <span className="badge badge-danger">VERIFICATION FAILED</span>
          </div>

          <p style={{ marginTop: "0.5rem", fontSize: "0.875rem" }}>
            <strong>Exact reason:</strong> {verification.explanation}
          </p>

          <div style={{ marginTop: "0.5rem", fontSize: "0.82rem" }}>
            Status: <code>{verification.status}</code> • Transaction: <code>{verification.transactionHash}</code>
          </div>
        </div>
      )}

      {/* TRACK 1 / TRACK 2 STATUS FOOTER */}
      <div style={{ marginTop: "1.5rem", padding: "0.75rem 1rem", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--surface-secondary)", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem", fontSize: "0.85rem" }}>
        <span><strong>TRACK 1:</strong> <span style={{ color: "var(--color-success, #10b981)" }}>READY</span></span>
        <span>
          <strong>TRACK 2:</strong>{" "}
          {isVerified ? (
            <span style={{ color: "var(--color-success, #10b981)" }}>VERIFIED REAL TRADE</span>
          ) : (
            <span style={{ color: "var(--warning)" }}>READY FOR EXTERNAL AUTHORIZATION</span>
          )}
        </span>
      </div>
    </section>
  );
}