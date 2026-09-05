import React, { useEffect, useState } from "react";
import {
  CandidateStrategy,
  ExecutionPreparation,
  ExecutionVerificationRecord,
  TypedRiskIntent,
  formatTokenAmount,
} from "../../types";

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<any>;
      on?: (event: string, handler: (...args: any[]) => void) => void;
      removeListener?: (event: string, handler: (...args: any[]) => void) => void;
    };
  }
}

export type Track2State =
  | "TRACK2_NOT_STARTED"
  | "TRACK2_LIVE_ORDER_SELECTED"
  | "TRACK2_REVALIDATED"
  | "TRACK2_UNSIGNED_TX_READY"
  | "TRACK2_AWAITING_EXTERNAL_AUTHORIZATION"
  | "TRACK2_TX_HASH_PROVIDED"
  | "TRACK2_VERIFYING"
  | "TRACK2_VERIFIED_REAL_TRADE"
  | "TRACK2_DEMO_SIMULATED"
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
  const [walletAddress, setWalletAddress] = useState("");
  const [walletChainId, setWalletChainId] = useState<number | null>(null);
  const [walletMessage, setWalletMessage] = useState<string>();
  const [demoSimulation, setDemoSimulation] = useState(false);

  const readWalletState = async () => {
    if (!window.ethereum) {
      setWalletMessage("No injected browser wallet detected.");
      return;
    }

    try {
      const accounts = (await window.ethereum.request({
        method: "eth_accounts",
      })) as string[];

      const chainHex = (await window.ethereum.request({
        method: "eth_chainId",
      })) as string;

      const chainId = Number.parseInt(chainHex, 16);
      setWalletChainId(chainId);

      if (accounts?.[0]) {
        const account = accounts[0];
        setWalletAddress(account);
        setBeneficiary(account);
        setWalletMessage(
          chainId === 8453
            ? "Wallet connected on Base Mainnet."
            : `Wallet connected on chain ${chainId}. HedgeOS expects Base Mainnet (8453).`
        );
      }
    } catch (error) {
      setWalletMessage(
        error instanceof Error ? error.message : "Unable to read wallet state."
      );
    }
  };

  const connectWallet = async () => {
    if (!window.ethereum) {
      setWalletMessage("No injected browser wallet detected.");
      return;
    }

    try {
      const accounts = (await window.ethereum.request({
        method: "eth_requestAccounts",
      })) as string[];

      const chainHex = (await window.ethereum.request({
        method: "eth_chainId",
      })) as string;

      const chainId = Number.parseInt(chainHex, 16);
      setWalletChainId(chainId);

      const account = accounts?.[0] || "";
      setWalletAddress(account);

      if (account) {
        setBeneficiary(account);
        resetExecutionEvidence();
      }

      setWalletMessage(
        chainId === 8453
          ? "Wallet connected on Base Mainnet."
          : `Wallet connected on chain ${chainId}. HedgeOS expects Base Mainnet (8453).`
      );
    } catch (error) {
      setWalletMessage(
        error instanceof Error ? error.message : "Wallet connection was not completed."
      );
    }
  };

  useEffect(() => {
    void readWalletState();

    if (!window.ethereum?.on) return;

    const handleAccountsChanged = (accounts: string[]) => {
      const account = accounts?.[0] || "";
      setWalletAddress(account);
      if (account) {
        setBeneficiary(account);
        resetExecutionEvidence();
      }
    };

    const handleChainChanged = (chainHex: string) => {
      const chainId = Number.parseInt(chainHex, 16);
      setWalletChainId(chainId);
      setWalletMessage(
        chainId === 8453
          ? "Wallet connected on Base Mainnet."
          : `Wallet connected on chain ${chainId}. HedgeOS expects Base Mainnet (8453).`
      );
      resetExecutionEvidence();
    };

    window.ethereum.on("accountsChanged", handleAccountsChanged);
    window.ethereum.on("chainChanged", handleChainChanged);

    return () => {
      window.ethereum?.removeListener?.("accountsChanged", handleAccountsChanged);
      window.ethereum?.removeListener?.("chainChanged", handleChainChanged);
    };
  }, []);

  const resetExecutionEvidence = () => {
    setPreparation(undefined);
    setPreSignRevalidation(undefined);
    setExternalAuthorization(undefined);
    setVerification(undefined);
    setTransactionHash("");
    setDemoSimulation(false);
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
    setDemoSimulation(false);

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
        "The exact unsigned Thetanuts action passed fresh pre-authorization revalidation. HedgeOS will never sign it; a user-controlled wallet must explicitly authorize the transaction."
      );

      setTrack2State("TRACK2_AWAITING_EXTERNAL_AUTHORIZATION");
    } catch (error) {
      setMessageType("ERROR");
      setMessage(error instanceof Error ? error.message : "Preparation failed");
      setTrack2State("TRACK2_VERIFICATION_FAILED");
    } finally {
      setBusy(false);
    }
  };

  const runDemoSimulation = () => {
    setBusy(false);
    setPreparation(undefined);
    setPreSignRevalidation(undefined);
    setExternalAuthorization(undefined);
    setVerification(undefined);
    setTransactionHash("");
    setDemoSimulation(true);
    setMessageType("SUCCESS");
    setMessage(
      "Hackathon demo mode advanced the presentation without broadcasting a transaction. No Base transaction, transaction hash, or on-chain verification was created. The real wallet execution path remains implemented for a valid revalidated preparation and a funded user-controlled wallet."
    );
    setTrack2State("TRACK2_DEMO_SIMULATED");

    window.requestAnimationFrame(() => {
      document
        .getElementById("track2-demo-result")
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  };

  const verifyTransactionHash = async (hash: string) => {
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
          transactionHash: hash,
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

  const verify = async () => {
    if (!/^0x[0-9a-fA-F]{64}$/.test(transactionHash)) return;
    await verifyTransactionHash(transactionHash);
  };

  const toRpcQuantity = (value: unknown): string | undefined => {
    if (value === undefined || value === null) return undefined;

    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed) return undefined;
      if (/^0x[0-9a-fA-F]+$/.test(trimmed)) return trimmed;
      if (/^\d+$/.test(trimmed)) return `0x${BigInt(trimmed).toString(16)}`;
      return undefined;
    }

    if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
      return `0x${BigInt(Math.trunc(value)).toString(16)}`;
    }

    if (typeof value === "bigint" && value >= 0n) {
      return `0x${value.toString(16)}`;
    }

    return undefined;
  };

  const ensureBaseMainnet = async (): Promise<boolean> => {
    if (!window.ethereum) return false;

    const currentChainHex = (await window.ethereum.request({
      method: "eth_chainId",
    })) as string;

    const currentChainId = Number.parseInt(currentChainHex, 16);
    if (currentChainId === 8453) {
      setWalletChainId(8453);
      return true;
    }

    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: "0x2105" }],
      });
    } catch (error: any) {
      if (error?.code !== 4902) {
        throw error;
      }

      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: "0x2105",
            chainName: "Base Mainnet",
            nativeCurrency: {
              name: "Ether",
              symbol: "ETH",
              decimals: 18,
            },
            rpcUrls: ["https://mainnet.base.org"],
            blockExplorerUrls: ["https://basescan.org"],
          },
        ],
      });
    }

    const updatedChainHex = (await window.ethereum.request({
      method: "eth_chainId",
    })) as string;

    const updatedChainId = Number.parseInt(updatedChainHex, 16);
    setWalletChainId(updatedChainId);
    setWalletMessage(
      updatedChainId === 8453
        ? "Wallet connected on Base Mainnet."
        : `Wallet connected on chain ${updatedChainId}. HedgeOS expects Base Mainnet (8453).`
    );

    return updatedChainId === 8453;
  };

  const waitForTransactionReceipt = async (
    hash: string,
    attempts = 20,
    delayMs = 1500
  ): Promise<any | null> => {
    if (!window.ethereum) return null;

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const receipt = await window.ethereum.request({
        method: "eth_getTransactionReceipt",
        params: [hash],
      });

      if (receipt) {
        return receipt;
      }

      await new Promise((resolve) => window.setTimeout(resolve, delayMs));
    }

    return null;
  };

  const authorizeWithWallet = async () => {
    if (!preparation || !window.ethereum) {
      setMessageType("ERROR");
      setMessage("Connect a browser wallet and prepare a fresh exact transaction first.");
      return;
    }

    if (!walletAddress) {
      setMessageType("ERROR");
      setMessage("Connect the wallet that will authorize this transaction.");
      return;
    }

    if (walletAddress.toLowerCase() !== beneficiary.toLowerCase()) {
      setMessageType("ERROR");
      setMessage(
        "The connected wallet must match the beneficiary used during exact transaction preparation. Reconnect the intended wallet or prepare again."
      );
      return;
    }

    if (
      preparation.transaction.validUntilMs &&
      Date.now() >= preparation.transaction.validUntilMs
    ) {
      setMessageType("ERROR");
      setMessage(
        "This prepared transaction has passed its freshness deadline. Prepare and revalidate a fresh transaction before authorization."
      );
      setTrack2State("TRACK2_VERIFICATION_FAILED");
      return;
    }

    setBusy(true);
    setVerification(undefined);
    setMessageType("INFO");
    setMessage("Opening your wallet with the exact revalidated Thetanuts transaction…");
    setTrack2State("TRACK2_AWAITING_EXTERNAL_AUTHORIZATION");

    try {
      const onBase = await ensureBaseMainnet();
      if (!onBase) {
        throw new Error("Wallet must be on Base Mainnet (chain ID 8453).");
      }

      const accounts = (await window.ethereum.request({
        method: "eth_accounts",
      })) as string[];

      const activeAccount = accounts?.[0] || "";
      if (!activeAccount || activeAccount.toLowerCase() !== walletAddress.toLowerCase()) {
        throw new Error("The active wallet account changed. Reconnect the intended wallet and prepare again.");
      }

      const transactionRequest: {
        from: string;
        to: string;
        data: string;
        value?: string;
      } = {
        from: walletAddress,
        to: preparation.transaction.to,
        data: preparation.transaction.data,
      };

      const rpcValue = toRpcQuantity(preparation.transaction.value);
      if (rpcValue !== undefined) {
        transactionRequest.value = rpcValue;
      }

      const hash = (await window.ethereum.request({
        method: "eth_sendTransaction",
        params: [transactionRequest],
      })) as string;

      if (!/^0x[0-9a-fA-F]{64}$/.test(hash || "")) {
        throw new Error("The wallet did not return a valid Base transaction hash.");
      }

      setTransactionHash(hash);
      setTrack2State("TRACK2_TX_HASH_PROVIDED");
      setMessageType("SUCCESS");
      setMessage(
        "Wallet authorization submitted the exact prepared transaction. HedgeOS captured the transaction hash and is waiting for the Base receipt."
      );

      const receipt = await waitForTransactionReceipt(hash);

      if (!receipt) {
        setMessageType("INFO");
        setMessage(
          "Transaction submitted successfully, but the Base receipt is still pending. The captured hash is kept below; use Verify Real Trade once the transaction is mined."
        );
        return;
      }

      const receiptStatus =
        typeof receipt.status === "string"
          ? Number.parseInt(receipt.status, 16)
          : Number(receipt.status);

      if (Number.isFinite(receiptStatus) && receiptStatus === 0) {
        setMessageType("ERROR");
        setMessage("The wallet submitted the transaction, but the Base receipt shows that it reverted.");
        setTrack2State("TRACK2_VERIFICATION_FAILED");
        return;
      }

      setBusy(false);
      await verifyTransactionHash(hash);
    } catch (error: any) {
      setMessageType("ERROR");

      if (error?.code === 4001) {
        setMessage("Wallet authorization was rejected. No transaction was submitted by HedgeOS.");
        setTrack2State("TRACK2_AWAITING_EXTERNAL_AUTHORIZATION");
      } else {
        setMessage(
          error instanceof Error
            ? error.message
            : "Wallet authorization could not be completed."
        );
        setTrack2State("TRACK2_VERIFICATION_FAILED");
      }
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
  const isDemoSimulated = track2State === "TRACK2_DEMO_SIMULATED";
  const walletMatchesBeneficiary = Boolean(
    walletAddress &&
    beneficiary &&
    walletAddress.toLowerCase() === beneficiary.toLowerCase()
  );
  const preparationExpired = Boolean(
    preparation?.transaction.validUntilMs &&
    Date.now() >= preparation.transaction.validUntilMs
  );

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
                : isDemoSimulated
                  ? "badge badge-info"
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

      <h2 style={{ marginTop: "0.5rem" }}>Review Protection & Wallet Authorization</h2>

      <p className="card-subtitle">
        HedgeOS verifies the selected outcome, prepares the exact unsigned Thetanuts transaction, performs a fresh live-market revalidation, and then passes only that exact transaction to a user-controlled browser wallet for explicit approval.
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

      <div style={{ marginTop: "1.25rem", padding: "0.85rem", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--surface-secondary)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
          <div>
            <strong>Browser Wallet</strong>
            <div style={{ marginTop: "0.25rem", fontSize: "0.8rem", color: "var(--text-secondary)" }}>
              {walletAddress
                ? `${walletAddress.slice(0, 8)}...${walletAddress.slice(-6)}`
                : "Not connected"}
              {" · "}
              {walletChainId === null
                ? "Network unknown"
                : walletChainId === 8453
                  ? "Base Mainnet (8453)"
                  : `Chain ${walletChainId}`}
            </div>
          </div>

          <button
            type="button"
            className="btn btn-primary"
            onClick={connectWallet}
            disabled={busy}
          >
            {walletAddress ? "Reconnect Wallet" : "Connect Wallet"}
          </button>
        </div>

        {walletMessage && (
          <div
            className={walletChainId === 8453 ? "alert alert-success" : "alert alert-info"}
            style={{ marginTop: "0.75rem", marginBottom: 0 }}
          >
            {walletMessage}
          </div>
        )}
      </div>

      <div style={{ marginTop: "1.25rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.35rem", flexWrap: "wrap", gap: "0.5rem" }}>
          <label htmlFor="beneficiary" style={{ margin: 0, fontSize: "0.875rem" }}>
            <strong>External Beneficiary / Wallet Address (Base Mainnet 0x...)</strong>
          </label>
          {!walletAddress && (
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
              Use Demo Beneficiary (read-only flow)
            </button>
          )}
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
            readOnly={Boolean(walletAddress)}
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

          <button
            className="btn btn-secondary"
            type="button"
            disabled={busy}
            onClick={runDemoSimulation}
            title="Presentation-only bypass. No transaction is created or verified."
          >
            Hackathon Demo: Skip Live Tx
          </button>
        </div>

        <p style={{ margin: "0.55rem 0 0", fontSize: "0.76rem", color: "var(--text-secondary)" }}>
          Demo button is presentation-only. It does not bypass production checks, create a transaction hash, spend funds, or mark a real trade as verified.
        </p>
      </div>

      <p className="disclosure" style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginTop: "0.5rem" }}>
        🛡️ HedgeOS never receives private keys or seed phrases. The prepared transaction remains unsigned until the connected wallet shows its own approval prompt; only that wallet can sign and broadcast it.
      </p>

      {message && <div className={messageClass} style={{ marginTop: "1rem" }}>{message}</div>}

      {/* UNSIGNED TRANSACTION PACKAGE */}
      {unsignedTxPackage && (
        <div style={{ marginTop: "1.25rem", padding: "1rem", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--surface-secondary)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
            <div>
              <span className="badge badge-info">UNSIGNED TRANSACTION</span>
              <strong style={{ marginLeft: "0.5rem", fontSize: "0.85rem", color: "var(--text-secondary)" }}>WALLET AUTHORIZATION REQUIRED</strong>
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

          {/* USER-CONTROLLED WALLET AUTHORIZATION */}
          <div style={{ marginTop: "1rem", padding: "0.85rem", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--surface)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem", alignItems: "flex-start", flexWrap: "wrap" }}>
              <div>
                <strong style={{ fontSize: "0.88rem" }}>USER-CONTROLLED WALLET AUTHORIZATION</strong>
                <p style={{ fontSize: "0.82rem", margin: "0.35rem 0 0" }}>
                  HedgeOS will pass the exact server-prepared <code>to</code>, <code>data</code>, and <code>value</code> fields to the connected wallet. The wallet must show its own approval prompt before anything is signed or broadcast.
                </p>
              </div>

              <button
                type="button"
                className="btn btn-primary"
                onClick={authorizeWithWallet}
                disabled={
                  busy ||
                  !walletAddress ||
                  !walletMatchesBeneficiary ||
                  preparationExpired
                }
              >
                {busy
                  ? "Waiting for Wallet / Base…"
                  : walletChainId === 8453
                    ? "Authorize Exact Tx in Wallet →"
                    : "Switch to Base & Authorize →"}
              </button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "0.4rem", fontSize: "0.8rem", marginTop: "0.75rem" }}>
              <span>Network: <strong>Base Mainnet (8453)</strong></span>
              <span>Selected Order: <strong>{unsignedTxPackage.quoteId}</strong></span>
              <span>Strike: <strong>{unsignedTxPackage.strike}</strong></span>
              <span>Expiry: <strong>{unsignedTxPackage.expiry}</strong></span>
              <span>Quantity: <strong>{unsignedTxPackage.quantity}</strong></span>
              <span>Expected Cost: <strong>{unsignedTxPackage.expectedCost}</strong></span>
              <span>Contract: <code>{unsignedTxPackage.to.slice(0, 10)}...</code></span>
              <span>Freshness: <strong style={{ color: preparationExpired ? "var(--color-danger, #ef4444)" : "var(--color-success, #10b981)" }}>{preparationExpired ? "EXPIRED — PREPARE AGAIN" : "REVALIDATED"}</strong></span>
            </div>

            {!walletAddress && (
              <div className="alert alert-info" style={{ marginTop: "0.75rem", marginBottom: 0 }}>
                Connect the wallet that will authorize the transaction.
              </div>
            )}

            {walletAddress && !walletMatchesBeneficiary && (
              <div className="alert alert-danger" style={{ marginTop: "0.75rem", marginBottom: 0 }}>
                Connected wallet and prepared beneficiary do not match. Prepare again using the connected wallet before authorization.
              </div>
            )}
          </div>

          {/* AUTOMATIC HASH CAPTURE + MANUAL VERIFICATION FALLBACK */}
          <div style={{ marginTop: "1.25rem" }}>
            <label htmlFor="tx-hash" style={{ display: "block", marginBottom: "0.35rem", fontSize: "0.875rem" }}>
              <strong>Base Mainnet Transaction Hash</strong>
            </label>
            <p style={{ fontSize: "0.78rem", color: "var(--text-secondary)", margin: "0 0 0.5rem" }}>
              Automatically captured after wallet submission. You can still paste a valid hash here as a fallback and run verification again.
            </p>

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
                className="btn btn-secondary"
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

      {/* HACKATHON DEMO SIMULATION CARD */}
      {demoSimulation && (
        <div
          id="track2-demo-result"
          style={{
            marginTop: "1.25rem",
            padding: "1.1rem",
            border: "2px solid var(--border)",
            borderRadius: "var(--radius-md)",
            background: "var(--surface-secondary)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
            <h3 style={{ margin: 0 }}>TRACK 2 — DEMO FLOW COMPLETE</h3>
            <span className="badge badge-info">SIMULATED — NO ON-CHAIN TRANSACTION</span>
          </div>

          <p style={{ margin: "0.65rem 0 0", fontSize: "0.86rem" }}>
            This presentation path skips the live transaction because no funded transaction is being submitted during the demo. HedgeOS does not fabricate a transaction hash or claim that a real trade was verified.
          </p>

          <div style={{ marginTop: "0.85rem", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: "0.6rem", fontSize: "0.85rem" }}>
            <div>Selected market order: <strong>{selectedQuote?.quoteId || props.candidate.strategyId}</strong></div>
            <div>Strategy: <strong>{props.candidate.strategyType}</strong></div>
            <div>Network target: <strong>Base Mainnet (8453)</strong></div>
            <div>Wallet integration: <strong>IMPLEMENTED</strong></div>
            <div>Real mainnet transaction: <strong>NOT SUBMITTED</strong></div>
            <div>Transaction hash: <strong>NOT CREATED</strong></div>
            <div>On-chain verification: <strong>NOT PERFORMED</strong></div>
            <div>Private key held by HedgeOS: <strong>NO</strong></div>
          </div>

          <div className="alert alert-info" style={{ marginTop: "1rem", marginBottom: 0 }}>
            <strong>Live capability:</strong> The real path remains available through Prepare &amp; Revalidate → wallet approval → automatic transaction-hash capture → Base on-chain verification when the candidate passes the required checks and a funded user-controlled wallet approves the transaction.
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
          ) : isDemoSimulated ? (
            <span>DEMO SIMULATION COMPLETE — NO REAL TRANSACTION</span>
          ) : (
            <span style={{ color: "var(--warning)" }}>READY FOR EXTERNAL AUTHORIZATION</span>
          )}
        </span>
      </div>
    </section>
  );
}