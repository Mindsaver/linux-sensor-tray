## Security policy

### Reporting a vulnerability

If you believe you have found a security issue, please do **not** open a public issue with exploit details.

- Prefer GitHub Security Advisories (if enabled for this repo).
- Or contact the maintainer via GitHub profile: `Mindsaver`.

Include:
- What you found and why it is impactful
- Reproduction steps (ideally minimal)
- Your OS/distro, kernel, and app version

### Maintainer hardening checklist (recommended)

These steps reduce the risk of a compromised release or malicious changes landing on `main`.

- **Account security**: enable GitHub **2FA** on maintainer accounts.
- **Branch protection** (`main`):
  - Require status checks (at least the CI build/typecheck).
  - Disallow force-push.
  - Require PRs and at least one review (optional but recommended).
- **Release hygiene**:
  - Restrict who can publish releases.
  - Prefer tagged releases (`vX.Y.Z`).
  - Publish checksums for release artifacts (this repo uploads `.sha256` files for AppImages).
- **Installer safety**:
  - Keep install scripts safe-by-default (no silent `sudo`).
  - Keep install/uninstall scoped to user directories unless explicitly confirmed.

