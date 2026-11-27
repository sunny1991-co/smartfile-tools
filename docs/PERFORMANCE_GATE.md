# Performance and reliability release gate

Priority: successful output and responsive UI before more tools. No unconditional speed claims.

- Homepage: no PDF or QR library, <=100 KiB transferred, <=5 seconds in the specified simulated mobile network.
- CPU: Chromium Linux CI at 4x CDP CPU slowdown, 390x844 viewport, synthetic camera JPEGs (2400x1800), simple blank PDF fixtures. This is not a real 2 GB Android phone or representative of every complex PDF.
- 50 KB photo compression: <=15 s including repeat. Three photos to PDF <=15 s, ten <=45 s. 100 simple pages merged <=15 s, 50 rotated <=12 s. These are initial CI ceilings, not advertised user times; tighten against measured baselines.
- Event-loop heartbeat gap <=2 s for tested operations. This measures stalls, not proof of zero freeze or memory leaks. Independent Pillow/pypdf output checks; invalid page selection must recover without reload.
- Progress in both languages, duplicate submission guard, yield before heavy stages, bounded PDF serialization batches. Existing local-only CSP preserved.
- Real Android acceptance: test on low-memory phones with genuine 5–20 photo batches and scanned/image-heavy PDFs, repeated 10 times; test Chrome and another supported browser, slow network, tab switching, cancellation and invalid files. Record successful outputs, elapsed time, peak memory and responsiveness. A browser can terminate a tab under memory pressure; file limits are not a guarantee.
- Next development: move PDF parsing/copying into dedicated worker with cancellation/timeout, then add PDF.js rendering and OCR lazily only after memory and performance gate. Do not weaken CSP for convenience. No automatic retry loops or misleading progress percentages.
- Release requires passing CI and review of actual performance report. A failed performance gate blocks merge; do not relax thresholds merely to pass.
