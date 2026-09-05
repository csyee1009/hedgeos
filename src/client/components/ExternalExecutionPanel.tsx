import React, {
  useState,
} from "react";
import {
  CandidateStrategy,
  ExecutionPreparation,
  ExecutionVerificationRecord,
  TypedRiskIntent,
  formatTokenAmount,
} from "../../types";

export function ExternalExecutionPanel(props: {
  intent: TypedRiskIntent;
  candidate: CandidateStrategy;
}) {
  const [
    beneficiary,
    setBeneficiary,
  ] = useState("");

  const [
    preparation,
    setPreparation,
  ] =
    useState<ExecutionPreparation>();

  const [
    preSignRevalidation,
    setPreSignRevalidation,
  ] = useState<any>();

  const [
    externalAuthorization,
    setExternalAuthorization,
  ] = useState<any>();

  const [
    transactionHash,
    setTransactionHash,
  ] = useState("");

  const [
    verification,
    setVerification,
  ] =
    useState<ExecutionVerificationRecord>();

  const [
    message,
    setMessage,
  ] = useState<string>();

  const [
    busy,
    setBusy,
  ] = useState(false);

  const [
    messageType,
    setMessageType,
  ] = useState<
    "INFO" | "ERROR" | "SUCCESS"
  >("INFO");

  const resetExecutionEvidence =
    () => {
      setPreparation(
        undefined
      );

      setPreSignRevalidation(
        undefined
      );

      setExternalAuthorization(
        undefined
      );

      setVerification(
        undefined
      );

      setTransactionHash("");
    };

  const prepare = async () => {
    setBusy(true);

    setMessage(undefined);

    setMessageType(
      "INFO"
    );

    resetExecutionEvidence();

    try {
      const response =
        await fetch(
          "/api/v1/executions/prepare",
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify({
                intentId:
                  props.intent
                    .intentId,

                strategyId:
                  props.candidate
                    .strategyId,

                expectedBeneficiary:
                  beneficiary,
              }),
          }
        );

      const data: any =
        await response.json();

      /*
       * A failed pre-sign revalidation is not a successful
       * preparation handoff.
       */
      if (
        !response.ok
      ) {
        if (
          data.status ===
          "REVALIDATION_REQUIRED"
        ) {
          setPreSignRevalidation(
            data.preSignRevalidation
          );

          setExternalAuthorization(
            data.externalAuthorization
          );

          setMessageType(
            "ERROR"
          );

          setMessage(
            data.explanation ||
            "Fresh Thetanuts evidence changed. HedgeOS did not release the old transaction for external authorization."
          );

          return;
        }

        throw new Error(
          data.error ||
          data.explanation ||
          "Exact transaction preparation failed"
        );
      }

      if (
        !data.preparation
      ) {
        throw new Error(
          "The server did not return exact preparation evidence."
        );
      }

      if (
        data.preSignRevalidation
          ?.status !==
        "REVALIDATED"
      ) {
        setPreSignRevalidation(
          data.preSignRevalidation
        );

        setMessageType(
          "ERROR"
        );

        setMessage(
          "Exact preparation was not released because fresh pre-authorization revalidation did not pass."
        );

        return;
      }

      setPreparation(
        data.preparation
      );

      setPreSignRevalidation(
        data.preSignRevalidation
      );

      setExternalAuthorization(
        data.externalAuthorization
      );

      setMessageType(
        "SUCCESS"
      );

      setMessage(
        "The exact unsigned Thetanuts action passed fresh pre-authorization revalidation. HedgeOS does not sign or broadcast transactions."
      );
    } catch (error) {
      setMessageType(
        "ERROR"
      );

      setMessage(
        error instanceof Error
          ? error.message
          : "Preparation failed"
      );
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    if (!preparation) {
      return;
    }

    setBusy(true);

    setMessage(undefined);

    setMessageType(
      "INFO"
    );

    setVerification(
      undefined
    );

    try {
      const response =
        await fetch(
          "/api/v1/executions/verify",
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify({
                preparationId:
                  preparation
                    .preparationId,

                transactionHash,
              }),
          }
        );

      const data: any =
        await response.json();

      /*
       * MISMATCH / REVERTED may intentionally return HTTP 409
       * while still containing valuable verification evidence.
       */
      if (
        !response.ok &&
        !data.verification
      ) {
        throw new Error(
          data.error ||
          "Verification failed"
        );
      }

      if (
        !data.verification
      ) {
        throw new Error(
          "No verification evidence was returned."
        );
      }

      setVerification(
        data.verification
      );

      if (
        data.verification
          .status ===
        "POSITION_CONFIRMED"
      ) {
        setMessageType(
          "SUCCESS"
        );

        setMessage(
          "The resulting protection position was independently confirmed from Base transaction, event, and option-contract evidence."
        );
      } else {
        setMessageType(
          "INFO"
        );

        setMessage(
          data.verification
            .explanation ||
          "The transaction was observed but protection is not yet fully confirmed."
        );
      }
    } catch (error) {
      setMessageType(
        "ERROR"
      );

      setMessage(
        error instanceof Error
          ? error.message
          : "Verification failed"
      );
    } finally {
      setBusy(false);
    }
  };

  const messageClass =
    messageType ===
      "ERROR"
      ? "alert alert-danger"
      : messageType ===
        "SUCCESS"
        ? "alert alert-success"
        : "alert";

  const revalidationPassed =
    preSignRevalidation
      ?.status ===
    "REVALIDATED";

  return (
    <section className="card execution-panel">
      <p className="eyebrow">
        NON-CUSTODIAL EXECUTION
      </p>

      <h2>
        Review protection
      </h2>

      <p>
        HedgeOS verifies the
        selected outcome,
        prepares the exact
        unsigned Thetanuts
        transaction, and performs
        a second live market check
        immediately before an
        external authorization
        handoff.
      </p>

      <dl>
        <div>
          <dt>
            Asset and quantity
          </dt>

          <dd>
            {formatTokenAmount(
              props.intent
                .exposureAmount
                .value
            )}
          </dd>
        </div>

        <div>
          <dt>
            Maximum spend
          </dt>

          <dd>
            {formatTokenAmount(
              props.intent
                .maxPremiumUSDC
                .value
            )}
          </dd>
        </div>

        <div>
          <dt>
            MODELED AT EXPIRY
            downside
          </dt>

          <dd>
            {
              props.intent
                .targetMaxLossPercent
                .value
            }
            %
          </dd>
        </div>

        <div>
          <dt>
            Network
          </dt>

          <dd>
            Base Mainnet · 8453
          </dd>
        </div>

        <div>
          <dt>
            Protocol
          </dt>

          <dd>
            Thetanuts
          </dd>
        </div>

        <div>
          <dt>
            Strategy
          </dt>

          <dd>
            {
              props.candidate
                .strategyType
            }
          </dd>
        </div>
      </dl>

      <label htmlFor="beneficiary">
        <strong>
          External beneficiary
          address
        </strong>
      </label>

      <input
        id="beneficiary"
        value={beneficiary}
        onChange={(
          event
        ) => {
          setBeneficiary(
            event.target.value
          );

          resetExecutionEvidence();

          setMessage(
            undefined
          );
        }}
        placeholder="0x…"
        autoComplete="off"
      />

      <button
        className="btn btn-primary"
        type="button"
        disabled={
          busy ||
          !/^0x[0-9a-fA-F]{40}$/.test(
            beneficiary
          )
        }
        onClick={prepare}
      >
        {busy
          ? "Checking exact action…"
          : "Prepare and revalidate unsigned transaction"}
      </button>

      <p className="disclosure">
        HedgeOS has no private
        key or signer and does not
        broadcast transactions.
        Financial authorization
        remains outside HedgeOS.
      </p>

      {message && (
        <div
          className={
            messageClass
          }
        >
          {message}
        </div>
      )}

      {preSignRevalidation && (
        <div className="card">
          <p className="eyebrow">
            PRE-AUTHORIZATION
            REVALIDATION
          </p>

          <h3>
            {revalidationPassed
              ? "Fresh evidence matched"
              : "Fresh evidence changed"}
          </h3>

          <p>
            {
              preSignRevalidation
                .explanation
            }
          </p>

          <p className="evidence-line">
            Status:{" "}
            <strong>
              {
                preSignRevalidation
                  .status
              }
            </strong>
            {" · "}
            Checked:{" "}
            {preSignRevalidation
              .checkedAtMs
              ? new Date(
                preSignRevalidation
                  .checkedAtMs
              ).toLocaleTimeString()
              : "N/A"}
          </p>

          {Array.isArray(
            preSignRevalidation
              .checks
          ) &&
            preSignRevalidation
              .checks.length >
            0 && (
              <details>
                <summary>
                  Revalidation
                  checks
                </summary>

                <div>
                  {preSignRevalidation.checks.map(
                    (
                      check: any,
                      index: number
                    ) => (
                      <p
                        key={`${check.check}-${index}`}
                      >
                        <strong>
                          {check.passed
                            ? "✓"
                            : "✗"}{" "}
                          {
                            check.check
                          }
                        </strong>
                        :{" "}
                        {
                          check.details
                        }
                      </p>
                    )
                  )}
                </div>
              </details>
            )}

          {Array.isArray(
            preSignRevalidation
              .blockers
          ) &&
            preSignRevalidation
              .blockers.length >
            0 && (
              <div className="alert alert-danger">
                <strong>
                  Authorization
                  handoff blocked
                </strong>

                <ul>
                  {preSignRevalidation.blockers.map(
                    (
                      blocker: string,
                      index: number
                    ) => (
                      <li
                        key={
                          index
                        }
                      >
                        {
                          blocker
                        }
                      </li>
                    )
                  )}
                </ul>
              </div>
            )}
        </div>
      )}

      {preparation &&
        revalidationPassed && (
          <div className="prepared-transaction">
            <p className="eyebrow">
              EXACT UNSIGNED ACTION
            </p>

            <h3>
              Exact transaction
              prepared
            </h3>

            <dl>
              <div>
                <dt>
                  Preparation
                  status
                </dt>

                <dd>
                  {
                    preparation
                      .status
                  }
                </dd>
              </div>

              <div>
                <dt>
                  Authorization
                  validity
                </dt>

                <dd>
                  {new Date(
                    preparation
                      .transaction
                      .validUntilMs
                  ).toLocaleString()}
                </dd>
              </div>

              <div>
                <dt>
                  Exact buyer
                  spend
                </dt>

                <dd>
                  {formatTokenAmount(
                    preparation
                      .transaction
                      .exactBuyerSpendUSDC
                  )}
                </dd>
              </div>

              <div>
                <dt>
                  Buyer-spend
                  evidence
                </dt>

                <dd>
                  {
                    preparation
                      .transaction
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
                    preparation
                      .transaction
                      .feeStatus
                  }
                </dd>
              </div>

              <div>
                <dt>
                  Target
                </dt>

                <dd>
                  <code>
                    {
                      preparation
                        .transaction
                        .to
                    }
                  </code>
                </dd>
              </div>
            </dl>

            <p>
              Calldata hash:
              {" "}
              <code>
                {
                  preparation
                    .transaction
                    .calldataHash
                }
              </code>
            </p>

            <p>
              Semantic digest:
              {" "}
              <code>
                {
                  preparation
                    .transaction
                    .semanticDigest
                }
              </code>
            </p>

            {externalAuthorization && (
              <div className="alert">
                <strong>
                  External
                  authorization
                  status:
                </strong>{" "}
                {
                  externalAuthorization
                    .status
                }

                {externalAuthorization
                  .disclosure && (
                    <p>
                      {
                        externalAuthorization
                          .disclosure
                      }
                    </p>
                  )}
              </div>
            )}

            <details>
              <summary>
                Advanced
                transaction
                evidence
              </summary>

              <pre>
                {JSON.stringify(
                  {
                    chainId:
                      preparation
                        .transaction
                        .chainId,

                    to:
                      preparation
                        .transaction
                        .to,

                    value:
                      preparation
                        .transaction
                        .value,

                    calldataHash:
                      preparation
                        .transaction
                        .calldataHash,

                    semanticDigest:
                      preparation
                        .transaction
                        .semanticDigest,

                    preparationDigest:
                      preparation
                        .preparationDigest,

                    candidateDigest:
                      preparation
                        .candidateDigest,

                    marketSnapshotId:
                      preparation
                        .marketSnapshotId,

                    marketSnapshotDigest:
                      preparation
                        .marketSnapshotDigest,
                  },
                  null,
                  2
                )}
              </pre>
            </details>

            <hr />

            <p className="eyebrow">
              READ-ONLY
              VERIFICATION
            </p>

            <h3>
              Verify an observed
              Base transaction
            </h3>

            <p>
              If an external
              authorized system
              later returns a Base
              transaction hash,
              HedgeOS can verify
              what happened
              independently.
            </p>

            <label htmlFor="tx-hash">
              <strong>
                Base transaction
                hash
              </strong>
            </label>

            <input
              id="tx-hash"
              value={
                transactionHash
              }
              onChange={(
                event
              ) =>
                setTransactionHash(
                  event.target
                    .value
                    .trim()
                )
              }
              placeholder="0x…"
              autoComplete="off"
            />

            <button
              className="btn btn-primary"
              type="button"
              disabled={
                busy ||
                !/^0x[0-9a-fA-F]{64}$/.test(
                  transactionHash
                )
              }
              onClick={verify}
            >
              {busy
                ? "Verifying…"
                : "Verify on Base"}
            </button>
          </div>
        )}

      {verification && (
        <div
          className={
            verification.status ===
              "POSITION_CONFIRMED"
              ? "alert alert-success"
              : verification.status ===
                "MISMATCH" ||
                verification.status ===
                "REVERTED"
                ? "alert alert-danger"
                : "alert"
          }
        >
          <strong>
            {verification.status ===
              "POSITION_CONFIRMED"
              ? "Protection confirmed on Base"
              : verification.status.replaceAll(
                "_",
                " "
              )}
          </strong>

          <p>
            {
              verification.explanation
            }
          </p>

          <p>
            Confirmations:{" "}
            {
              verification.confirmations
            }
            /
            {
              verification.requiredConfirmations
            }
          </p>

          <p>
            Transaction:{" "}
            {verification.transactionHash.slice(
              0,
              10
            )}
            …
            {verification.transactionHash.slice(
              -8
            )}
          </p>

          <p>
            Position:{" "}
            {verification.position
              ? verification
                .position
                .optionAddress
              : "Not confirmed"}
          </p>

          {verification.position
            ?.normalizedOptionType && (
              <p>
                Verified option
                type:{" "}
                <strong>
                  {
                    verification
                      .position
                      .normalizedOptionType
                  }
                </strong>
              </p>
            )}

          <p>
            Verification
            evidence:{" "}
            <code>
              {
                verification.verificationId
              }
            </code>
          </p>

          {verification.checks
            .length > 0 && (
              <details>
                <summary>
                  Verification checks
                </summary>

                {verification.checks.map(
                  (
                    check,
                    index
                  ) => (
                    <p
                      key={`${check.check}-${index}`}
                    >
                      <strong>
                        {check.passed
                          ? "✓"
                          : "✗"}{" "}
                        {
                          check.check
                        }
                      </strong>
                      :{" "}
                      {
                        check.details
                      }
                    </p>
                  )
                )}
              </details>
            )}
        </div>
      )}
    </section>
  );
}