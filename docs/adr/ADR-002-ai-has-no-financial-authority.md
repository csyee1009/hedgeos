# ADR-002: AI Has No Financial Authority

* **Status**: Accepted
* **Context**: Large Language Models (LLMs) can hallucinate numbers, misinterpret quantitative edge cases, or be vulnerable to prompt injection attacks. Giving LLMs financial authorization authority creates intolerable security risks.
* **Decision**: Strictly isolate AI models (Gemini) to natural language interpretation and candidate intent drafting. AI outputs are untrusted. Explicit human confirmation is required before solving, and policy evaluation is handled by deterministic TypeScript logic.
* **Consequences**: Eliminates financial prompt injection vulnerabilities; financial constraints cannot be weakened by LLM outputs.
