# Changelog

All notable changes to LightPic are documented here.

## 2026-07-05

### Changed

- Renamed the public GitHub repository to `Phoebe0924/lightpic`.
- Refreshed the public `README.md` for external readers and contributors.
- Added a minimal GitHub Actions CI workflow for `lint` and `build`.
- Cleaned lint configuration so generated `.open-next` and `.wrangler` artifacts are not scanned.
- Removed unused analyze-route demo code and cleared remaining lint warnings.

### Maintenance

- Updated project metadata from `ai-product-image-tool` to `lightpic` where it affects repository-facing package naming.
- Aligned current-state documentation with the repository's public status.

## 2026-06-24

### Added

- Public trial guardrails for API access.
- Cloudflare-to-Vercel proxy secret enforcement.
- Vercel-side fallback rate limiting for proxied requests.
- Upload-size protection and production shutdown for `/api/test-image`.

### Changed

- Generation count became selectable: `1 / 2 / 4`.
- Public README and deployment notes were updated to reflect the trial architecture.

## 2026-06-23

### Changed

- Established the current iteration baseline in Git.
- Restored the intended staggered multi-image generation flow.
- Added `.env.example` and excluded evaluation outputs from version control.

## 2026-06-16

### Changed

- Switched the primary analyze and generate flow to the official OpenAI APIs.
- Re-deployed Cloudflare Workers and Vercel with the fixed-region architecture.
