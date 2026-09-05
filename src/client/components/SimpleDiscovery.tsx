import React, {
  useState,
} from "react";
import {
  ProtectionDiscoveryResult,
  StoredIntent,
  formatTokenAmount,
} from "../../types";

interface DiscoveryGateResponse {
  status?:
  | "CLARIFICATION_REQUIRED"
  | "CONFIRMATION_REQUIRED";

  situation?: any;

  missingFactualFields?: string[];

  confirmationNeeded?: string[];

  message?: string;

  error?: string;
}

export function SimpleDiscovery(props: {
  onCompiled: (
    intent: StoredIntent
  ) => void;

  onBack: () => void;
}) {
  const [
    prompt,
    setPrompt,
  ] = useState(
    "I have 2 ETH and I'm worried the price may fall this week. I don't know what protection makes sense."
  );

  const [
    result,
    setResult,
  ] =
    useState<ProtectionDiscoveryResult | null>(
      null
    );

  const [
    message,
    setMessage,
  ] =
    useState<string>();

  const [
    confirmationNeeded,
    setConfirmationNeeded,
  ] =
    useState<string[]>([]);

  const [
    interpretedSituation,
    setInterpretedSituation,
  ] =
    useState<any>();

  const [
    busy,
    setBusy,
  ] =
    useState(false);

  const runSearch = async (
    confirmInferredFacts:
      boolean
  ) => {
    setBusy(true);
    setMessage(undefined);

    if (!confirmInferredFacts) {
      setResult(null);
      setConfirmationNeeded([]);
      setInterpretedSituation(
        undefined
      );
    }

    try {
      const response =
        await fetch(
          "/api/v1/discovery/search",
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify({
                prompt,
                confirmInferredFacts,
              }),
          }
        );

      const data: any =
        await response.json();

      if (!response.ok) {
        if (
          data.status ===
          "CLARIFICATION_REQUIRED"
        ) {
          const missing =
            data.missingFactualFields ||
            [];

          const confirms =
            data.confirmationNeeded ||
            [];

          setInterpretedSituation(
            data.situation
          );

          setConfirmationNeeded(
            confirms
          );

          setMessage(
            missing.length > 0
              ? `Please add: ${missing.join(
                ", "
              )}. You do not need to choose a budget or loss percentage yet.`
              : "More factual information is required before checking the live market."
          );

          return;
        }

        if (
          data.status ===
          "CONFIRMATION_REQUIRED"
        ) {
          const fields =
            data.confirmationNeeded ||
            [];

          setInterpretedSituation(
            data.situation
          );

          setConfirmationNeeded(
            fields
          );

          setMessage(
            data.message ||
            "Please confirm the interpreted factual details before HedgeOS checks the live market."
          );

          return;
        }

        throw new Error(
          data.error ||
          data.message ||
          "Discovery is unavailable"
        );
      }

      setConfirmationNeeded(
        []
      );

      setInterpretedSituation(
        undefined
      );

      setMessage(
        undefined
      );

      setResult(
        data as ProtectionDiscoveryResult
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Discovery is unavailable"
      );
    } finally {
      setBusy(false);
    }
  };

  const search = async () => {
    await runSearch(false);
  };

  const confirmInterpretation =
    async () => {
      await runSearch(true);
    };

  const choose = async (
    candidateId: string
  ) => {
    if (!result) {
      return;
    }

    setBusy(true);
    setMessage(undefined);

    try {
      const response =
        await fetch(
          `/api/v1/discovery/${result.discoveryId}/compile`,
          {
            method:
              "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify({
                candidateId,
              }),
          }
        );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
          "This choice needs a fresh market check"
        );
      }

      props.onCompiled(
        data.intent
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Choice could not be compiled"
      );
    } finally {
      setBusy(false);
    }
  };

  const label = (
    value: string
  ) => {
    if (
      value ===
      "LOWER_COST"
    ) {
      return "LOWER COST";
    }

    if (
      value ===
      "STRONGER_MODELED_PROTECTION"
    ) {
      return "STRONGER MODELED PROTECTION";
    }

    if (
      value ===
      "MID_RANGE_TRADE_OFF"
    ) {
      return "MID-RANGE TRADE-OFF";
    }

    return value.replaceAll(
      "_",
      " "
    );
  };

  const resultHeading =
    (): string => {
      if (!result) {
        return "";
      }

      if (
        result.status ===
        "FEASIBLE_MARKET_TRADE_OFFS"
      ) {
        return "Observed protection trade-offs";
      }

      if (
        result.status ===
        "VERIFIED_EMPTY_ORDERBOOK"
      ) {
        return "No OptionBook orders observed";
      }

      if (
        result.status ===
        "LIVE_MARKET_UNAVAILABLE"
      ) {
        return "Live market evidence unavailable";
      }

      return "Protection feasibility result";
    };

  const statusExplanation =
    (): string | null => {
      if (!result) {
        return null;
      }

      if (
        result.status ===
        "LIVE_MARKET_UNAVAILABLE"
      ) {
        return "HedgeOS could not establish fresh live market evidence, so it did not interpret the failure as an empty market and did not fabricate a protection choice.";
      }

      if (
        result.status ===
        "VERIFIED_EMPTY_ORDERBOOK"
      ) {
        return "The live read succeeded, but no OptionBook orders were observed. Any RFQ shown later remains an unsubmitted and unpriced specification.";
      }

      if (
        result.status ===
        "PRECISE_INFEASIBILITY" &&
        result.paretoFrontier
          .length === 0
      ) {
        return "Live evidence was available, but no observed order satisfied all required direction, structure, horizon, exact sizing, capacity, and buyer-spend checks together.";
      }

      return null;
    };

  return (
    <section className="simple-discovery card">
      <button
        className="btn btn-secondary btn-sm"
        type="button"
        onClick={
          props.onBack
        }
      >
        ← Back
      </button>

      <p className="eyebrow">
        SIMPLE MODE
      </p>

      <h1>
        Help me choose protection
      </h1>

      <p>
        Tell HedgeOS what
        you hold, what worries
        you, and how long you
        are concerned. AI is
        used only to extract
        factual context.
        Protection choices are
        derived deterministically
        from observed Thetanuts
        market evidence.
      </p>

      <div className="alert">
        <strong>
          You do not need to
          choose a loss percentage
          or protection budget.
        </strong>{" "}
        HedgeOS first shows the
        protection/cost trade-offs
        that the observed market
        can actually provide.
      </div>

      <label htmlFor="simple-situation">
        <strong>
          Your situation
        </strong>
      </label>

      <textarea
        id="simple-situation"
        rows={5}
        value={prompt}
        onChange={(
          event
        ) => {
          setPrompt(
            event.target.value
          );

          setResult(
            null
          );

          setMessage(
            undefined
          );

          setConfirmationNeeded(
            []
          );

          setInterpretedSituation(
            undefined
          );
        }}
      />

      <button
        className="btn btn-primary"
        type="button"
        disabled={
          busy ||
          !prompt.trim()
        }
        onClick={search}
      >
        {busy
          ? "Checking…"
          : "Check live protection possibilities"}
      </button>

      {message && (
        <div className="alert">
          {message}
        </div>
      )}

      {confirmationNeeded.length >
        0 &&
        interpretedSituation && (
          <div className="card">
            <p className="eyebrow">
              FACTUAL INTERPRETATION
            </p>

            <h3>
              Confirm what HedgeOS
              understood
            </h3>

            <p>
              These values came
              from your words, but
              at least one exact
              interpretation was
              resolved
              deterministically.
              HedgeOS will not use
              it for financial
              discovery until you
              accept it.
            </p>

            <dl>
              {interpretedSituation
                .asset && (
                  <div>
                    <dt>
                      Asset
                    </dt>

                    <dd>
                      {
                        interpretedSituation
                          .asset
                          .value
                      }
                    </dd>
                  </div>
                )}

              {interpretedSituation
                .exposureAmount && (
                  <div>
                    <dt>
                      Exposure
                    </dt>

                    <dd>
                      {formatTokenAmount(
                        interpretedSituation
                          .exposureAmount
                          .value
                      )}
                    </dd>
                  </div>
                )}

              {interpretedSituation
                .horizonTimestamp && (
                  <div>
                    <dt>
                      Protection
                      horizon
                    </dt>

                    <dd>
                      {new Date(
                        interpretedSituation
                          .horizonTimestamp
                          .value
                          .timestampMs
                      ).toLocaleString()}
                    </dd>
                  </div>
                )}

              {interpretedSituation
                .concern && (
                  <div>
                    <dt>
                      Concern
                    </dt>

                    <dd>
                      PRICE FALL
                    </dd>
                  </div>
                )}
            </dl>

            <p className="evidence-line">
              Needs confirmation:{" "}
              {confirmationNeeded.join(
                ", "
              )}
            </p>

            <button
              className="btn btn-primary"
              type="button"
              disabled={busy}
              onClick={
                confirmInterpretation
              }
            >
              {busy
                ? "Confirming…"
                : "Confirm these facts and check market"}
            </button>
          </div>
        )}

      {result && (
        <div className="discovery-results">
          <p className="eyebrow">
            DETERMINISTIC MARKET
            DISCOVERY
          </p>

          <h2>
            {resultHeading()}
          </h2>

          <p>
            {result.explanation}
          </p>

          <p className="evidence-line">
            Status:{" "}
            {result.status.replaceAll(
              "_",
              " "
            )}
            {" · "}
            Market:{" "}
            {
              result
                .marketSnapshot
                .status
            }
            {" · "}
            Base 8453
            {" · "}
            Snapshot:{" "}
            {new Date(
              result
                .marketSnapshot
                .capturedAtMs
            ).toLocaleTimeString()}
          </p>

          {result
            .marketSnapshot
            .snapshotDigest && (
              <details>
                <summary>
                  Market evidence
                </summary>

                <p>
                  Snapshot ID:{" "}
                  <code>
                    {
                      result
                        .marketSnapshot
                        .snapshotId
                    }
                  </code>
                </p>

                <p>
                  Snapshot digest:{" "}
                  <code>
                    {
                      result
                        .marketSnapshot
                        .snapshotDigest
                    }
                  </code>
                </p>

                <p>
                  Observed orders:{" "}
                  {
                    result
                      .marketSnapshot
                      .rawOrderCount
                  }
                  {" · "}
                  Eligible:{" "}
                  {
                    result
                      .marketSnapshot
                      .eligibleOrderCount
                  }
                  {" · "}
                  Rejected:{" "}
                  {
                    result
                      .marketSnapshot
                      .rejectedOrderCount
                  }
                </p>
              </details>
            )}

          {statusExplanation() && (
            <div className="alert">
              <strong>
                No executable
                choice was proven.
              </strong>{" "}
              {statusExplanation()}
            </div>
          )}

          {result.paretoFrontier
            .length > 0 && (
              <>
                <div className="alert">
                  <strong>
                    These are observed
                    trade-offs, not AI
                    recommendations.
                  </strong>{" "}
                  Lower cost and
                  stronger modeled
                  protection are
                  determined from
                  verified market and
                  payoff evidence.
                  “Mid-range” is only
                  a mechanical
                  frontier position.
                </div>

                <div className="discovery-grid">
                  {result.paretoFrontier.map(
                    (
                      candidate
                    ) => (
                      <article
                        className="candidate-card"
                        key={
                          candidate.candidateId
                        }
                      >
                        <p className="eyebrow">
                          {candidate.labels
                            .map(
                              label
                            )
                            .join(
                              " · "
                            ) ||
                            "OBSERVED FRONTIER POINT"}
                        </p>

                        <h3>
                          {formatTokenAmount(
                            candidate
                              .verifiedBuyerSpend
                          )}{" "}
                          buyer spend
                        </h3>

                        <dl>
                          <div>
                            <dt>
                              MODELED
                              AT EXPIRY
                              downside
                            </dt>

                            <dd>
                              {Number(
                                candidate
                                  .modeledAtExpiryDownside
                                  .displayPercent
                              ).toFixed(
                                2
                              )}
                              %
                            </dd>
                          </div>

                          <div>
                            <dt>
                              Coverage
                            </dt>

                            <dd>
                              {formatTokenAmount(
                                candidate
                                  .coveredExposure
                              )}
                            </dd>
                          </div>

                          <div>
                            <dt>
                              Strike
                            </dt>

                            <dd>
                              {formatTokenAmount(
                                candidate
                                  .strike
                              )}
                            </dd>
                          </div>

                          <div>
                            <dt>
                              Expiry
                            </dt>

                            <dd>
                              {new Date(
                                candidate
                                  .expiryTimestampMs
                              ).toLocaleString()}
                            </dd>
                          </div>

                          <div>
                            <dt>
                              Buyer-spend
                              evidence
                            </dt>

                            <dd>
                              {
                                candidate
                                  .buyerSpendStatus
                              }
                            </dd>
                          </div>

                          <div>
                            <dt>
                              Fee evidence
                            </dt>

                            <dd>
                              {
                                candidate
                                  .feeStatus
                              }
                            </dd>
                          </div>
                        </dl>

                        <button
                          className="btn btn-primary"
                          type="button"
                          onClick={() =>
                            choose(
                              candidate.candidateId
                            )
                          }
                          disabled={
                            busy
                          }
                        >
                          Review this
                          outcome
                        </button>

                        <details>
                          <summary>
                            Evidence
                            binding
                          </summary>

                          <p>
                            Candidate:{" "}
                            <code>
                              {
                                candidate.candidateId
                              }
                            </code>
                          </p>

                          <p>
                            Quote:{" "}
                            <code>
                              {
                                candidate.quoteId
                              }
                            </code>
                          </p>

                          <p>
                            Candidate
                            digest:{" "}
                            <code>
                              {
                                candidate.candidateDigest
                              }
                            </code>
                          </p>
                        </details>
                      </article>
                    )
                  )}
                </div>
              </>
            )}

          <small>
            {
              result.deterministicRule
            }
          </small>
        </div>
      )}
    </section>
  );
}