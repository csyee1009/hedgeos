# HedgeOS Screenshot Capture Checklist

This checklist specifies the 13 screenshots to be captured manually for hackathon submission portals, pitch decks, and repository media.

---

### Screenshot 1: Landing Hero (Light Mode)
- **State:** Fresh application state (`http://localhost:5173`) in Light Theme.
- **Visible:** Clean header, live Base Mainnet (8453) badge, tagline *"Protect outcomes, not instruments."*, prompt input box.
- **Do NOT show:** Old error messages or pre-filled draft values.
- **Suggested Crop:** Full viewport (1440x900).

---

### Screenshot 2: Landing Hero (Dark Mode)
- **State:** Same as Screenshot 1, toggled to Dark Theme via top-right moon icon.
- **Visible:** Sleek dark slate palette, high-contrast typography, live badge indicator.
- **Suggested Crop:** Full viewport.

---

### Screenshot 3: Natural Language Prompt Input
- **State:** Prompt box populated with demo text:  
  `"I have 2 ETH. Protect me until Friday. I don't want to lose more than 8%. Maximum protection budget 3 USDC."`
- **Visible:** **Parse Protection Goal** button ready to click.
- **Suggested Crop:** Centered on hero input card (800x450).

---

### Screenshot 4: Typed Risk Intent Review
- **State:** Post-parse state showing the **Intent Review** card.
- **Visible:** Extracted parameters (Asset: ETH, Exposure: 2.0 ETH, Max Loss: 8%, Budget: 3.0 USDC, Horizon: Friday MYT) with provenance badges (`USER_EXPLICIT`).
- **Suggested Crop:** Intent review card (800x600).

---

### Screenshot 5: Confirmed Protection Goal
- **State:** Post-confirmation state.
- **Visible:** Success banner: *"Your protection goal is confirmed."* Version #1 badge, **Check Live Protection Options** primary button.
- **Suggested Crop:** Confirmation card (800x450).

---

### Screenshot 6: Live Market Discovery
- **State:** Solving spinner or active market query progress against Base Mainnet.
- **Visible:** Live market query indicators.
- **Suggested Crop:** Active solver view (800x450).

---

### Screenshot 7: OptionBook Protection Plan Result
- **State:** Solved state where an eligible OptionBook quote is discovered.
- **Visible:** Top-ranked strategy card, strike price, premium, max downside % floor, and 1:1 option sizing.
- **Suggested Crop:** Strategy recommendation card (900x600).

---

### Screenshot 8: Custom Protection (RFQ Fallback)
- **State:** Solved state where OptionBook liquidity is insufficient and RFQ fallback is triggered.
- **Visible:** **Custom Protection (RFQ) Specification** tab, target contract (`OptionFactory`), requested contracts, deadline, and `PENDING_RFQ_PRICING_REFINEMENT` badge.
- **Suggested Crop:** RFQ specification card (900x600).

---

### Screenshot 9: Financial Constitution Policy Matrix
- **State:** Expanded Financial Constitution drawer/section.
- **Visible:** 9 green policy checks (POL-001 through POL-009) with exact base-unit mathematical verification details.
- **Suggested Crop:** Policy matrix table (900x700).

---

### Screenshot 10: Advanced Judge View
- **State:** Opened **Advanced Judge Drawer** (top right button).
- **Visible:** SHA-256 Proposal Digest, normalized execution parameters, protocol evidence status (`FRESH`).
- **Suggested Crop:** Judge inspection modal (900x700).

---

### Screenshot 11: Architecture & Trust Separation
- **State:** Architecture diagram section in README or UI walkthrough.
- **Visible:** Pipeline flow from natural language to deterministic constitution and human review boundary.
- **Suggested Crop:** Clean diagram crop.

---

### Screenshot 12: Pre-Execution Review & PREVIEW_BOUND
- **State:** Final review record card.
- **Visible:** `PREVIEW_BOUND` badge, TOCTOU risk disclosure, `executionStatus: NOT_AUTHORIZED`, `ELIGIBLE_HUMAN_REQUIRED`.
- **Suggested Crop:** Review card (800x500).

---

### Screenshot 13: Evaluation & Test Suite Evidence
- **State:** Terminal window displaying `npm run test` output:  
  `Test Files: 31 passed (31), Tests: 162 passed (162)`.
- **Visible:** Clean terminal output with 0 failures.
- **Suggested Crop:** Terminal window (800x500).
