# Verification status — v0.3 development

Baseline v0.2 (b0fe84d0) passed complete browser regression on GitHub Actions run 46034679623, using Ubuntu 24.04. New PDF merge/extract and QR tools are development candidates; the new run must pass before release. Dependency download cannot be performed in the local container; GitHub CI will validate installation. A reviewed package lock and dependency/license audit are required before deployment. No deployment or ads enabled. No earnings claims.

First v0.3 build 46034937068 stopped at license bundling: qrcode-generator 1.4.4 ships an MIT copyright header but no standalone LICENSE file in the npm package. The narrowly scoped fallback includes the upstream MIT notice (https://github.com/kazuhikoarase/qrcode-generator/blob/master/LICENSE), checks package version, declared license and header, and continues to fail closed for other missing notices. A fresh run and dependency audit are pending.
