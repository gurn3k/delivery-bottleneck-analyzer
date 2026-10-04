# 0001: Kubernetes is the v1 target

**Status:** accepted 2026-10-04

**Decision:** v1 analyzes `kubernetes/kubernetes` only.

**Why:** every PR carries an owning-team label (`sig/*`), and Prow records each review gate as a timestamped label (`lgtm`, `approved`). That makes stage-level and team-level measurement possible from public data alone. Shopify Hydrogen and VS Code were considered. Both are smaller or lack clean team labels, which would make the bottleneck findings thinner.

**Consequence:** the label vocabulary (Prow conventions) is Kubernetes-specific. The repo name is config, but other repos need their own label mapping before results mean anything.
