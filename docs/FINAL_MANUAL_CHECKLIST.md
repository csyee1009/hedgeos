# HedgeOS Final Manual Pre-Submission Checklist

This checklist contains the manual actions to be completed by the user before submitting to the hackathon portal.

---

### Phase 1: Local Visual & Functional Verification
- [ ] **Start Local Servers:** Run `npm run start:server` (Port 3000) and `npm run dev:client` (Port 5173).
- [ ] **Visual Theme Check:** Verify Light Mode and Dark Mode rendering in browser (`http://localhost:5173`).
- [ ] **Responsive Layout Check:** Inspect at 375px (mobile), 768px (tablet), and 1440px (desktop). Verify no clipped text or card overflow.
- [ ] **Live Gemini Provider Check:** Ensure `http://localhost:3000/api/v1/ai/status` reports `REAL_LLM` / `READY`.
- [ ] **Live Market Status Check:** Ensure header badge displays `Live Base Mainnet (8453)`.
- [ ] **Execute Live Demo:** Walk through the demo prompt:  
  `"I have 2 ETH. Protect me until Friday. I don't want to lose more than 8%. Maximum protection budget 3 USDC."`  
  Verify parse -> confirm -> solve -> Financial Constitution matrix -> judge drawer.

---

### Phase 2: Media & Video Recording
- [ ] **Capture Screenshots:** Follow `docs/SCREENSHOT_CHECKLIST.md` to capture all 13 required screenshots.
- [ ] **Record Demo Video:** Follow `docs/DEMO_VIDEO_SCRIPT.md` to record a 2–3 minute screen walkthrough.
- [ ] **Video Audio Check:** Ensure microphone audio is clear, pacing is natural, and background noise is minimal.
- [ ] **Upload Video:** Upload the recorded video to YouTube (Unlisted) or Loom / Google Drive.

---

### Phase 3: Git & Repository Finalization
- [ ] **Verify `.env` Protection:** Ensure `.env` is NOT tracked in Git (`git status` should not list `.env`).
- [ ] **Verify `.env.example`:** Confirm `.env.example` contains clean placeholders only.
- [ ] **Commit Changes:** Stage and commit all finalized code and documentation:  
  ```bash
  git add .
  git commit -m "feat: complete HedgeOS Risk Intent Compiler for MUBA Hacks (Prompts 1-9)"
  ```
- [ ] **Push to Remote:** Push repository to GitHub:  
  ```bash
  git push origin main
  ```
- [ ] **Verify GitHub Visibility:** Ensure the repository is set to Public (or shared with hackathon judges).

---

### Phase 4: Hackathon Form Submission
- [ ] **Project Name:** `HedgeOS`
- [ ] **Tagline:** `Protect outcomes, not instruments.`
- [ ] **Track Selection:** Select **Thetanuts Finance Track** (Track 1) and **AI × Options Track** (Track 2).
- [ ] **Short Description:** Paste the one-liner from `docs/FINAL_SUBMISSION_SUMMARY.md`.
- [ ] **Long Description / Pitch:** Use content from `README.md` and `docs/PITCH_SCRIPT.md`.
- [ ] **Repository Link:** Provide public GitHub repository URL.
- [ ] **Video URL:** Provide uploaded demo video link.
- [ ] **Track 2 Scope Note:** If requested, reference `docs/TRACK_COMPLIANCE.md` regarding read-only institutional pre-execution boundaries.
- [ ] **Submit:** Perform final review and click submit on the hackathon portal.
