# PDF expansion roadmap

Phase 1: page removal, rotation, reordering, watermark and numbering (development candidate, CI required). 18 tools, 44 generated pages. Existing production stays at 13 tools until merge and deployment verification. No new runtime dependencies or paid APIs.

Phase 2: locally bundled, audited PDF.js renderer for PDF to JPG and embedded-text extraction; worker/CSP design and memory limits; raster compression only with explicit quality, loss of selectable text and signature warnings. Never promise size reduction if output is larger.

Phase 3: local OCR with reviewed language models, download/memory constraints and accuracy warnings; DOCX export of extracted text with honest layout limitations. True layout-preserving PDF to Word remains a research/quality gate. No remote file uploads, premium charges, or new dependencies without review. Keep original branding and do not copy competitor code or assets.

AdSense readiness PR #5 remains separate and must be reconciled with this build before merge.
