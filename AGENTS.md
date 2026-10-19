# 知不知 / Know-unknown

- Read README.md and docs/architecture.md before changes.
- Preserve the distinction between saved, model-proposed understanding, and user confirmation.
- Default to offline local operation. Never add network transmission, analytics, API keys in source, or automatic bulk model requests.
- Keep the four-quadrant UI minimal and mobile usable. No digital twin or chat expansion without a product decision.
- Runtime validation and transaction completion are correctness boundaries; do not replace them with TypeScript casts or request-success callbacks.
- Update docs/verification.md with actual evidence; do not call fake adapter testing real-model validation.
- Run relevant tests and build. Keep private data, node_modules, generated builds, and credentials out of Git.
