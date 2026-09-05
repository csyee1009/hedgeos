import React, {
  useState,
} from "react";
import {
  formatTokenAmount,
  StoredIntent,
  TokenAmount,
} from "../../types";

interface IntentReviewProps {
  intent: StoredIntent;
  missingFields: string[];
  ambiguities: string[];
  holdingsSource?: HoldingsSource;

  onUpdateIntent: (updates: {
    asset?: string;
    exposureAmount?: {
      amount: string;
    };
    targetMaxLossPercent?: number;
    maxPremiumUSDC?: {
      amount: string;
    };
    horizonTimestampMs?: number;
    allowMultiLeg?: boolean;
  }) => Promise<void>;

  onConfirmIntent: () => Promise<void>;

  isSubmitting: boolean;

  errorMessage?: string;
}

export type HoldingsSource =
  | "MANUAL"
  | "PUBLIC_BASE_ADDRESS"
  | "RECORDED_DEMO_PORTFOLIO";

export function getHoldingsSourceCopy(source: HoldingsSource): {
  label: string;
  detail: string;
} {
  if (source === "RECORDED_DEMO_PORTFOLIO") {
    return {
      label: "Recorded demo portfolio",
      detail: "Selected from a user-controlled demo address. Displayed balance is synthetic demo data and is not wallet-verified.",
    };
  }
  if (source === "PUBLIC_BASE_ADDRESS") {
    return {
      label: "Public Base address",
      detail: "Selected from a read-only public Base address balance. No wallet was connected or authorized.",
    };
  }
  return {
    label: "Manual",
    detail: "HedgeOS is not connected to a wallet. Amounts shown here come from what you entered and are not wallet-verified.",
  };
}

interface MissingValues {
  asset: string;
  exposureAmount: string;
  targetMaxLossPercent: string;
  maxPremiumUSDC: string;
  horizon: string;
}

const tokenAmountToDecimalString = (
  token: TokenAmount
): string => {
  try {
    const value =
      BigInt(token.amountBaseUnits);

    const decimals =
      token.decimals;

    if (decimals === 0) {
      return value.toString();
    }

    const negative =
      value < 0n;

    const absolute =
      negative ? -value : value;

    const padded =
      absolute
        .toString()
        .padStart(
          decimals + 1,
          "0"
        );

    const integerPart =
      padded.slice(
        0,
        -decimals
      );

    const fraction =
      padded
        .slice(-decimals)
        .replace(/0+$/, "");

    return `${negative ? "-" : ""
      }${integerPart}${fraction
        ? `.${fraction}`
        : ""
      }`;
  } catch {
    return "";
  }
};

const timestampToLocalInput = (
  timestampMs: number
): string => {
  if (
    !Number.isFinite(timestampMs) ||
    timestampMs <= 0
  ) {
    return "";
  }

  const date =
    new Date(timestampMs);

  const localOffset =
    date.getTimezoneOffset() *
    60_000;

  return new Date(
    timestampMs -
    localOffset
  )
    .toISOString()
    .slice(0, 16);
};

const provenanceLabel = (
  source?: string
): string => {
  if (
    source === "USER_EXPLICIT"
  ) {
    return "From what you entered";
  }

  if (
    source === "AI_INFERRED" ||
    source === "PARSER_INFERRED"
  ) {
    return "Interpreted from your request — please verify";
  }

  if (
    source === "SYSTEM_DEFAULT"
  ) {
    return "System default — please verify";
  }

  return "Please verify";
};

export const IntentReview:
  React.FC<IntentReviewProps> = ({
    intent,
    missingFields,
    ambiguities,
    holdingsSource = "MANUAL",
    onUpdateIntent,
    onConfirmIntent,
    isSubmitting,
    errorMessage,
  }) => {
    const holdingsSourceCopy = getHoldingsSourceCopy(holdingsSource);
    const [
      editingField,
      setEditingField,
    ] = useState<
      string | null
    >(null);

    const [
      editValue,
      setEditValue,
    ] = useState("");

    const [
      localError,
      setLocalError,
    ] = useState<
      string | undefined
    >(undefined);

    const [
      missingValues,
      setMissingValues,
    ] = useState<MissingValues>({
      asset: "",
      exposureAmount: "",
      targetMaxLossPercent:
        "",
      maxPremiumUSDC: "",
      horizon: "",
    });

    const setMissingValue = (
      field: keyof MissingValues,
      value: string
    ) => {
      setMissingValues(
        (previous) => ({
          ...previous,
          [field]: value,
        })
      );
    };

    const handleStartEdit = (
      field: string,
      currentValue: string
    ) => {
      setLocalError(undefined);
      setEditingField(field);
      setEditValue(currentValue);
    };

    const handleSaveEdit =
      async (field: string) => {
        setLocalError(undefined);

        const trimmed =
          editValue.trim();

        if (!trimmed) {
          setLocalError(
            "Please enter a value before saving."
          );
          return;
        }

        if (field === "asset") {
          await onUpdateIntent({
            asset: trimmed,
          });
        } else if (
          field ===
          "exposureAmount"
        ) {
          await onUpdateIntent({
            exposureAmount: {
              amount: trimmed,
            },
          });
        } else if (
          field ===
          "targetMaxLossPercent"
        ) {
          const value =
            Number(trimmed);

          if (
            !Number.isFinite(
              value
            ) ||
            value < 0 ||
            value > 100
          ) {
            setLocalError(
              "Enter a valid loss percentage between 0 and 100."
            );
            return;
          }

          await onUpdateIntent({
            targetMaxLossPercent:
              value,
          });
        } else if (
          field ===
          "maxPremiumUSDC"
        ) {
          const value =
            Number(trimmed);

          if (
            !Number.isFinite(
              value
            ) ||
            value < 0
          ) {
            setLocalError(
              "Enter a valid non-negative protection budget."
            );
            return;
          }

          await onUpdateIntent({
            maxPremiumUSDC: {
              amount: trimmed,
            },
          });
        } else if (
          field === "horizon"
        ) {
          const timestamp =
            new Date(
              editValue
            ).getTime();

          if (
            !Number.isFinite(
              timestamp
            ) ||
            timestamp <= Date.now()
          ) {
            setLocalError(
              "Choose a future date and time."
            );
            return;
          }

          await onUpdateIntent({
            horizonTimestampMs:
              timestamp,
          });
        }

        setEditingField(null);
      };

    const saveMissingAsset =
      async () => {
        const value =
          missingValues.asset.trim();

        if (!value) {
          setLocalError(
            "Tell HedgeOS which asset you want to protect."
          );
          return;
        }

        setLocalError(undefined);

        await onUpdateIntent({
          asset: value,
        });
      };

    const saveMissingExposure =
      async () => {
        const value =
          missingValues.exposureAmount.trim();

        const numeric =
          Number(value);

        if (
          !value ||
          !Number.isFinite(
            numeric
          ) ||
          numeric <= 0
        ) {
          setLocalError(
            "Enter an amount greater than zero."
          );
          return;
        }

        setLocalError(undefined);

        await onUpdateIntent({
          exposureAmount: {
            amount: value,
          },
        });
      };

    const saveMissingLoss =
      async () => {
        const value =
          Number(
            missingValues
              .targetMaxLossPercent
          );

        if (
          !Number.isFinite(
            value
          ) ||
          value < 0 ||
          value > 100
        ) {
          setLocalError(
            "Enter a loss percentage between 0 and 100."
          );
          return;
        }

        setLocalError(undefined);

        await onUpdateIntent({
          targetMaxLossPercent:
            value,
        });
      };

    const saveMissingBudget =
      async () => {
        const raw =
          missingValues.maxPremiumUSDC.trim();

        const value =
          Number(raw);

        if (
          !raw ||
          !Number.isFinite(
            value
          ) ||
          value < 0
        ) {
          setLocalError(
            "Enter a valid protection budget."
          );
          return;
        }

        setLocalError(undefined);

        await onUpdateIntent({
          maxPremiumUSDC: {
            amount: raw,
          },
        });
      };

    const saveMissingHorizon =
      async () => {
        const timestamp =
          new Date(
            missingValues.horizon
          ).getTime();

        if (
          !Number.isFinite(
            timestamp
          ) ||
          timestamp <= Date.now()
        ) {
          setLocalError(
            "Choose a future date and time."
          );
          return;
        }

        setLocalError(undefined);

        await onUpdateIntent({
          horizonTimestampMs:
            timestamp,
        });
      };

    const isMissingAsset =
      missingFields.includes(
        "asset"
      );

    const isMissingExposure =
      missingFields.includes(
        "exposureAmount"
      );

    const isMissingBudget =
      missingFields.includes(
        "maxPremiumUSDC"
      );

    const isMissingLoss =
      missingFields.includes(
        "targetMaxLossPercent"
      );

    const isMissingHorizon =
      missingFields.includes(
        "horizonTimestamp"
      );

    return (
      <section className="card plan-hero-card">
        <div className="card-header">
          <div
            style={{
              display: "flex",
              alignItems:
                "center",
              gap: "0.5rem",
              marginBottom:
                "0.5rem",
              flexWrap: "wrap",
            }}
          >
            <span className="badge badge-info">
              Step 2: Review
            </span>

            <span className="badge badge-neutral">
              Nothing happens
              without confirmation
            </span>
          </div>

          <h2>
            Check what HedgeOS understood
          </h2>

          <p className="card-subtitle">
            Make sure these details
            describe the outcome you
            want. You can change
            anything before confirming.
          </p>
        </div>

        <div
          style={{
            padding:
              "0.85rem 1rem",
            marginBottom:
              "1rem",
            border:
              "1px solid var(--border)",
            borderRadius:
              "var(--radius-sm)",
            background:
              "var(--surface-secondary)",
          }}
        >
          <strong>
            Current holdings source:
            {" "}{holdingsSourceCopy.label}
          </strong>

          <p
            style={{
              margin:
                "0.3rem 0 0",
              fontSize:
                "0.82rem",
              color:
                "var(--text-secondary)",
            }}
          >
            {holdingsSourceCopy.detail}
          </p>
        </div>

        {(errorMessage ||
          localError) && (
            <div
              className="alert alert-danger"
              style={{
                marginBottom:
                  "1rem",
              }}
            >
              <strong>
                Please check:
              </strong>{" "}
              {localError ||
                errorMessage}
            </div>
          )}

        {missingFields.length >
          0 && (
            <div
              className="alert alert-warning"
              style={{
                marginBottom:
                  "1.25rem",
                flexDirection:
                  "column",
                alignItems:
                  "flex-start",
              }}
            >
              <strong>
                HedgeOS needs a little
                more information
              </strong>

              <p
                style={{
                  margin:
                    "0.3rem 0 0",
                  fontSize:
                    "0.82rem",
                }}
              >
                Fill only the missing
                details below.
              </p>

              <div
                style={{
                  display: "flex",
                  flexDirection:
                    "column",
                  gap: "1rem",
                  width: "100%",
                  marginTop:
                    "0.75rem",
                }}
              >
                {isMissingAsset && (
                  <div>
                    <label
                      htmlFor="missing-asset"
                      style={{
                        fontSize:
                          "0.82rem",
                        display:
                          "block",
                        marginBottom:
                          "0.25rem",
                      }}
                    >
                      What do you want
                      to protect?
                    </label>

                    <div
                      style={{
                        display:
                          "flex",
                        gap:
                          "0.5rem",
                        flexWrap:
                          "wrap",
                      }}
                    >
                      <input
                        id="missing-asset"
                        type="text"
                        className="field-input"
                        placeholder="e.g. ETH"
                        value={
                          missingValues.asset
                        }
                        onChange={(
                          event
                        ) =>
                          setMissingValue(
                            "asset",
                            event
                              .target
                              .value
                          )
                        }
                        disabled={
                          isSubmitting
                        }
                      />

                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={
                          saveMissingAsset
                        }
                        disabled={
                          isSubmitting
                        }
                      >
                        Save
                      </button>
                    </div>
                  </div>
                )}

                {isMissingExposure && (
                  <div>
                    <label
                      htmlFor="missing-exposure"
                      style={{
                        fontSize:
                          "0.82rem",
                        display:
                          "block",
                        marginBottom:
                          "0.25rem",
                      }}
                    >
                      How much of it
                      would you like
                      this plan to
                      protect?
                    </label>

                    <div
                      style={{
                        display:
                          "flex",
                        gap:
                          "0.5rem",
                        flexWrap:
                          "wrap",
                      }}
                    >
                      <input
                        id="missing-exposure"
                        type="number"
                        min="0"
                        step="any"
                        className="field-input"
                        placeholder="e.g. 2"
                        value={
                          missingValues.exposureAmount
                        }
                        onChange={(
                          event
                        ) =>
                          setMissingValue(
                            "exposureAmount",
                            event
                              .target
                              .value
                          )
                        }
                        disabled={
                          isSubmitting
                        }
                      />

                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={
                          saveMissingExposure
                        }
                        disabled={
                          isSubmitting
                        }
                      >
                        Save
                      </button>
                    </div>
                  </div>
                )}

                {isMissingLoss && (
                  <div>
                    <label
                      htmlFor="missing-loss"
                      style={{
                        fontSize:
                          "0.82rem",
                        display:
                          "block",
                        marginBottom:
                          "0.25rem",
                      }}
                    >
                      How much loss do
                      you want the
                      protection plan
                      to target at
                      expiry?
                    </label>

                    <div
                      style={{
                        display:
                          "flex",
                        gap:
                          "0.5rem",
                        flexWrap:
                          "wrap",
                      }}
                    >
                      <input
                        id="missing-loss"
                        type="number"
                        min="0"
                        max="100"
                        step="any"
                        className="field-input"
                        placeholder="e.g. 8"
                        value={
                          missingValues.targetMaxLossPercent
                        }
                        onChange={(
                          event
                        ) =>
                          setMissingValue(
                            "targetMaxLossPercent",
                            event
                              .target
                              .value
                          )
                        }
                        disabled={
                          isSubmitting
                        }
                      />

                      <span
                        style={{
                          alignSelf:
                            "center",
                        }}
                      >
                        %
                      </span>

                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={
                          saveMissingLoss
                        }
                        disabled={
                          isSubmitting
                        }
                      >
                        Save
                      </button>
                    </div>
                  </div>
                )}

                {isMissingBudget && (
                  <div>
                    <label
                      htmlFor="missing-budget"
                      style={{
                        fontSize:
                          "0.82rem",
                        display:
                          "block",
                        marginBottom:
                          "0.25rem",
                      }}
                    >
                      How much are you
                      willing to spend
                      on this
                      protection?
                    </label>

                    <p
                      style={{
                        margin:
                          "0 0 0.4rem",
                        fontSize:
                          "0.78rem",
                        color:
                          "var(--text-secondary)",
                      }}
                    >
                      This is your
                      maximum protection
                      cost, measured in
                      USDC.
                    </p>

                    <div
                      style={{
                        display:
                          "flex",
                        gap:
                          "0.5rem",
                        flexWrap:
                          "wrap",
                      }}
                    >
                      <input
                        id="missing-budget"
                        type="number"
                        min="0"
                        step="any"
                        className="field-input"
                        placeholder="e.g. 15"
                        value={
                          missingValues.maxPremiumUSDC
                        }
                        onChange={(
                          event
                        ) =>
                          setMissingValue(
                            "maxPremiumUSDC",
                            event
                              .target
                              .value
                          )
                        }
                        disabled={
                          isSubmitting
                        }
                      />

                      <span
                        style={{
                          alignSelf:
                            "center",
                        }}
                      >
                        USDC
                      </span>

                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={
                          saveMissingBudget
                        }
                        disabled={
                          isSubmitting
                        }
                      >
                        Save
                      </button>
                    </div>
                  </div>
                )}

                {isMissingHorizon && (
                  <div>
                    <label
                      htmlFor="missing-horizon"
                      style={{
                        fontSize:
                          "0.82rem",
                        display:
                          "block",
                        marginBottom:
                          "0.25rem",
                      }}
                    >
                      Until when do you
                      want protection?
                    </label>

                    <div
                      style={{
                        display:
                          "flex",
                        gap:
                          "0.5rem",
                        flexWrap:
                          "wrap",
                      }}
                    >
                      <input
                        id="missing-horizon"
                        type="datetime-local"
                        className="field-input"
                        value={
                          missingValues.horizon
                        }
                        onChange={(
                          event
                        ) =>
                          setMissingValue(
                            "horizon",
                            event
                              .target
                              .value
                          )
                        }
                        disabled={
                          isSubmitting
                        }
                      />

                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={
                          saveMissingHorizon
                        }
                        disabled={
                          isSubmitting
                        }
                      >
                        Save
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

        {ambiguities.length >
          0 && (
            <div
              style={{
                marginBottom:
                  "1rem",
              }}
            >
              <strong
                style={{
                  fontSize:
                    "0.82rem",
                }}
              >
                Please verify these
                interpretations:
              </strong>

              {ambiguities.map(
                (
                  ambiguity,
                  index
                ) => (
                  <div
                    key={`${ambiguity}-${index}`}
                    style={{
                      fontSize:
                        "0.825rem",
                      color:
                        "var(--warning)",
                      marginTop:
                        "0.35rem",
                    }}
                  >
                    ℹ️{" "}
                    {ambiguity}
                  </div>
                )
              )}
            </div>
          )}

        <div className="review-grid">
          <div className="review-field-card">
            <span className="field-title">
              Asset to protect
            </span>

            {editingField ===
              "asset" ? (
              <div
                style={{
                  display:
                    "flex",
                  gap:
                    "0.5rem",
                  marginTop:
                    "0.25rem",
                  flexWrap:
                    "wrap",
                }}
              >
                <input
                  type="text"
                  className="field-input"
                  value={
                    editValue
                  }
                  onChange={(
                    event
                  ) =>
                    setEditValue(
                      event.target
                        .value
                    )
                  }
                  disabled={
                    isSubmitting
                  }
                />

                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() =>
                    handleSaveEdit(
                      "asset"
                    )
                  }
                  disabled={
                    isSubmitting
                  }
                >
                  Save
                </button>

                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() =>
                    setEditingField(
                      null
                    )
                  }
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div
                style={{
                  display:
                    "flex",
                  justifyContent:
                    "space-between",
                  alignItems:
                    "center",
                  gap:
                    "0.75rem",
                }}
              >
                <span className="field-value">
                  {intent.asset
                    ?.value ||
                    "Not provided"}
                </span>

                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() =>
                    handleStartEdit(
                      "asset",
                      intent.asset
                        ?.value ||
                      ""
                    )
                  }
                >
                  Edit
                </button>
              </div>
            )}

            <span className="field-helper">
              {provenanceLabel(
                intent.asset
                  ?.source
              )}
            </span>
          </div>

          <div className="review-field-card">
            <span className="field-title">
              Amount to protect
            </span>

            {editingField ===
              "exposureAmount" ? (
              <div
                style={{
                  display:
                    "flex",
                  gap:
                    "0.5rem",
                  marginTop:
                    "0.25rem",
                  flexWrap:
                    "wrap",
                }}
              >
                <input
                  type="number"
                  min="0"
                  step="any"
                  className="field-input"
                  value={
                    editValue
                  }
                  onChange={(
                    event
                  ) =>
                    setEditValue(
                      event.target
                        .value
                    )
                  }
                />

                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() =>
                    handleSaveEdit(
                      "exposureAmount"
                    )
                  }
                >
                  Save
                </button>

                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() =>
                    setEditingField(
                      null
                    )
                  }
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div
                style={{
                  display:
                    "flex",
                  justifyContent:
                    "space-between",
                  alignItems:
                    "center",
                  gap:
                    "0.75rem",
                }}
              >
                <span className="field-value">
                  {intent.exposureAmount
                    ? formatTokenAmount(
                      intent
                        .exposureAmount
                        .value
                    )
                    : "Not provided"}
                </span>

                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() =>
                    handleStartEdit(
                      "exposureAmount",
                      intent.exposureAmount
                        ? tokenAmountToDecimalString(
                          intent
                            .exposureAmount
                            .value
                        )
                        : ""
                    )
                  }
                >
                  Edit
                </button>
              </div>
            )}

            <span className="field-helper">
              {provenanceLabel(
                intent
                  .exposureAmount
                  ?.source
              )}
            </span>
          </div>

          <div className="review-field-card">
            <span className="field-title">
              Loss target at
              expiry
            </span>

            {editingField ===
              "targetMaxLossPercent" ? (
              <div
                style={{
                  display:
                    "flex",
                  gap:
                    "0.5rem",
                  marginTop:
                    "0.25rem",
                }}
              >
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="any"
                  className="field-input"
                  value={
                    editValue
                  }
                  onChange={(
                    event
                  ) =>
                    setEditValue(
                      event.target
                        .value
                    )
                  }
                />

                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() =>
                    handleSaveEdit(
                      "targetMaxLossPercent"
                    )
                  }
                >
                  Save
                </button>
              </div>
            ) : (
              <div
                style={{
                  display:
                    "flex",
                  justifyContent:
                    "space-between",
                  alignItems:
                    "center",
                }}
              >
                <span className="field-value highlight">
                  {intent.targetMaxLossPercent
                    ? `${intent.targetMaxLossPercent.value}%`
                    : "Not provided"}
                </span>

                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() =>
                    handleStartEdit(
                      "targetMaxLossPercent",
                      intent.targetMaxLossPercent
                        ?.value.toString() ||
                      ""
                    )
                  }
                >
                  Edit
                </button>
              </div>
            )}

            <span className="field-helper">
              Modeled at option
              expiry, not a
              guaranteed loss limit
            </span>
          </div>

          <div className="review-field-card">
            <span className="field-title">
              Maximum protection
              cost
            </span>

            {editingField ===
              "maxPremiumUSDC" ? (
              <div
                style={{
                  display:
                    "flex",
                  gap:
                    "0.5rem",
                  marginTop:
                    "0.25rem",
                }}
              >
                <input
                  type="number"
                  min="0"
                  step="any"
                  className="field-input"
                  value={
                    editValue
                  }
                  onChange={(
                    event
                  ) =>
                    setEditValue(
                      event.target
                        .value
                    )
                  }
                />

                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() =>
                    handleSaveEdit(
                      "maxPremiumUSDC"
                    )
                  }
                >
                  Save
                </button>
              </div>
            ) : (
              <div
                style={{
                  display:
                    "flex",
                  justifyContent:
                    "space-between",
                  alignItems:
                    "center",
                }}
              >
                <span className="field-value">
                  {intent.maxPremiumUSDC
                    ? formatTokenAmount(
                      intent
                        .maxPremiumUSDC
                        .value
                    )
                    : "Not provided"}
                </span>

                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() =>
                    handleStartEdit(
                      "maxPremiumUSDC",
                      intent.maxPremiumUSDC
                        ? tokenAmountToDecimalString(
                          intent
                            .maxPremiumUSDC
                            .value
                        )
                        : ""
                    )
                  }
                >
                  Edit
                </button>
              </div>
            )}

            <span className="field-helper">
              The most you're
              willing to spend on
              the option protection
            </span>
          </div>

          <div
            className="review-field-card"
            style={{
              gridColumn:
                "1 / -1",
            }}
          >
            <span className="field-title">
              Protection period
            </span>

            {editingField ===
              "horizon" ? (
              <div
                style={{
                  display:
                    "flex",
                  gap:
                    "0.5rem",
                  marginTop:
                    "0.25rem",
                  flexWrap:
                    "wrap",
                }}
              >
                <input
                  type="datetime-local"
                  className="field-input"
                  value={
                    editValue
                  }
                  onChange={(
                    event
                  ) =>
                    setEditValue(
                      event.target
                        .value
                    )
                  }
                />

                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() =>
                    handleSaveEdit(
                      "horizon"
                    )
                  }
                >
                  Save
                </button>
              </div>
            ) : (
              <div
                style={{
                  display:
                    "flex",
                  justifyContent:
                    "space-between",
                  alignItems:
                    "center",
                  gap:
                    "0.75rem",
                  flexWrap:
                    "wrap",
                }}
              >
                <span
                  className="field-value"
                  style={{
                    fontSize:
                      "1.05rem",
                  }}
                >
                  {intent.horizonTimestamp
                    ?.value
                    .formattedDisplay ||
                    "Not provided"}
                </span>

                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() =>
                    handleStartEdit(
                      "horizon",
                      intent.horizonTimestamp
                        ? timestampToLocalInput(
                          intent
                            .horizonTimestamp
                            .value
                            .timestampMs
                        )
                        : ""
                    )
                  }
                >
                  Edit
                </button>
              </div>
            )}

            <span className="field-helper">
              {intent.horizonTimestamp
                ?.value.timezone ||
                "Your local time"}
            </span>
          </div>

          <div
            className="review-field-card"
            style={{
              gridColumn:
                "1 / -1",
            }}
          >
            <span className="field-title">
              Advanced structure
              permission
            </span>

            <p
              style={{
                margin:
                  "0.3rem 0 0.75rem",
                fontSize:
                  "0.82rem",
                color:
                  "var(--text-secondary)",
              }}
            >
              Multi-part option
              structures are only
              considered if you
              explicitly allow
              them.
            </p>

            <div
              style={{
                display: "flex",
                gap: "0.5rem",
              }}
            >
              <button
                type="button"
                className={`btn btn-sm ${intent.allowMultiLeg
                  ?.value
                  ? "btn-primary"
                  : "btn-secondary"
                  }`}
                onClick={() =>
                  onUpdateIntent({
                    allowMultiLeg:
                      true,
                  })
                }
                disabled={
                  isSubmitting
                }
              >
                Allow
              </button>

              <button
                type="button"
                className={`btn btn-sm ${!intent.allowMultiLeg
                  ?.value
                  ? "btn-primary"
                  : "btn-secondary"
                  }`}
                onClick={() =>
                  onUpdateIntent({
                    allowMultiLeg:
                      false,
                  })
                }
                disabled={
                  isSubmitting
                }
              >
                Don't allow
              </button>
            </div>
          </div>
        </div>

        <div
          style={{
            borderTop:
              "1px solid var(--border)",
            paddingTop:
              "1.25rem",
            display: "flex",
            flexDirection:
              "column",
            gap: "0.5rem",
          }}
        >
          <button
            id="confirmGoalBtn"
            type="button"
            className="btn btn-primary"
            style={{
              width:
                "fit-content",
            }}
            onClick={
              onConfirmIntent
            }
            disabled={
              isSubmitting ||
              missingFields.length >
              0
            }
          >
            {isSubmitting
              ? "Confirming..."
              : "Confirm Protection Goal →"}
          </button>

          <p
            style={{
              fontSize:
                "0.8rem",
              color:
                "var(--text-muted)",
            }}
          >
            Confirmation freezes
            these constraints for
            the next market check.
            HedgeOS cannot silently
            weaken your budget,
            protection target, or
            time period.
          </p>
        </div>
      </section>
    );
  };
