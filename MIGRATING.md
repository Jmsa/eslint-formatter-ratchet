# Migration Guide

Guidance for upgrading between major versions of `eslint-formatter-ratchet`.

---

## v2 → v3

### Node 22 required

The minimum supported Node version is now **22**. Node 18 reached EOL in January 2025 and Node 20 reaches EOL in April 2026.

Update your environment, CI, and any `.node-version` / `.nvmrc` files accordingly.

### Heads up: new ESLint rules are now correctly flagged as regressions

This was fixed in **v2.0.1** (not a v3 change), but worth calling out for anyone upgrading from an older v2 release. Previously, a brand new ESLint rule appearing in your lint results — one with no prior entry in `eslint-ratchet.json` — was silently not counted as a regression due to a shallow clone bug. The ratchet would report "Changes found are all improvements!" and pass.

That is now fixed. If CI starts failing after upgrading, it likely means new violations were already present in your codebase and slipping through before.

---

## v1 → v2

### Node 18 required

The minimum supported Node version bumped to **18.20.4**. Older Node versions are no longer supported.
