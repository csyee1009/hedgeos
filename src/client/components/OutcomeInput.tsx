import React from "react";

interface OutcomeInputProps {
  promptText: string;
  setPromptText: (text: string) => void;
  onParse: () => void;
  isParsing: boolean;
  sourceNotice?: string;
  onResetOnboarding?: () => void;
}

export const OutcomeInput: React.FC<OutcomeInputProps> = ({
  promptText,
  setPromptText,
  onParse,
  isParsing,
  sourceNotice,
  onResetOnboarding,
}) => {
  const presets = [
    {
      label: "Protect my ETH",
      text: "I have 2 ETH. Protect me until Friday. I don't want to lose more than 8%. Maximum protection budget 15 USDC.",
    },
    {
      label: "Protect for 2 weeks",
      text: "I have 5 ETH. Protect me for 14 days with max 5% loss. Maximum protection budget 10 USDC.",
    },
    {
      label: "I'm not sure what to enter",
      text: "Protect my ETH.",
    },
  ];

  return (
    <div className="outcome-input-container">
      <section className="card outcome-primary-card">
        <div className="card-header outcome-primary-header">
          <h1>Describe the protection you want</h1>
          <p className="card-subtitle">
            Tell HedgeOS what you want protected, your modeled loss target at
            expiry, how long you want protection, and your maximum protection
            cost.
          </p>
        </div>

        <div className="portfolio-source-strip">
          <div className="portfolio-source-copy">
            <strong>
              {sourceNotice
                ? "Source: Public Base address · Read-only"
                : "Source: Entered manually"}
            </strong>
            <span>
              {sourceNotice
                ? `${sourceNotice} You can change this amount before confirmation.`
                : "Amounts you enter are used for protection analysis and are not wallet-verified."}
            </span>
          </div>

          {onResetOnboarding && (
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={onResetOnboarding}
            >
              Change source
            </button>
          )}
        </div>

        <label className="input-label" htmlFor="outcomePromptInput">
          Protection goal
        </label>

        <textarea
          id="outcomePromptInput"
          className="outcome-textarea outcome-textarea-primary"
          placeholder="I want to protect 2 ETH until Friday, target no more than 8% modeled loss at expiry, and spend at most 15 USDC."
          value={promptText}
          onChange={(e) => setPromptText(e.target.value)}
          disabled={isParsing}
        />

        <details className="input-help-details">
          <summary>What should I include?</summary>
          <div className="input-help-grid">
            <div className="input-help-item">
              <strong>Amount to protect</strong>
              <span>For example, 2 ETH or 0.05 BTC.</span>
            </div>

            <div className="input-help-item">
              <strong>Loss target at expiry</strong>
              <span>For example, target no more than 8% modeled loss.</span>
            </div>

            <div className="input-help-item">
              <strong>Protection period</strong>
              <span>For example, until Friday or for 14 days.</span>
            </div>

            <div className="input-help-item">
              <strong>Maximum protection cost</strong>
              <span>For example, spend at most 15 USDC.</span>
            </div>
          </div>
        </details>

        <div className="demo-presets-row">
          <span className="preset-label">Examples:</span>

          {presets.map((preset, idx) => (
            <button
              key={idx}
              type="button"
              className="preset-chip"
              onClick={() => setPromptText(preset.text)}
              disabled={isParsing}
            >
              {preset.label}
            </button>
          ))}
        </div>

        <p className="outcome-support-note">
          You do not need to know option terminology. HedgeOS will identify
          missing information before a protection goal can be confirmed.
        </p>

        <div className="action-row outcome-primary-actions">
          <button
            id="buildProtectionPlanBtn"
            type="button"
            className="btn btn-primary"
            onClick={onParse}
            disabled={isParsing || !promptText.trim()}
          >
            {isParsing ? (
              <>
                <span className="live-dot active">●</span>{" "}
                Understanding your protection goal...
              </>
            ) : (
              "Build my protection plan →"
            )}
          </button>
        </div>
      </section>
    </div>
  );
};
