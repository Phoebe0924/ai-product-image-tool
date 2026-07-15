# LightPic

[![CI](https://github.com/Phoebe0924/lightpic/actions/workflows/ci.yml/badge.svg)](https://github.com/Phoebe0924/lightpic/actions/workflows/ci.yml)
[![GitHub issues](https://img.shields.io/github/issues/Phoebe0924/lightpic)](https://github.com/Phoebe0924/lightpic/issues)
[![GitHub last commit](https://img.shields.io/github/last-commit/Phoebe0924/lightpic)](https://github.com/Phoebe0924/lightpic/commits/main)

LightPic is an AI product-image workspace for small ecommerce sellers. Upload one product image, let the model extract a usable brief, then generate visual assets based on a sales task instead of a vague style request.

Current focus:

- `提升点击`: search, recommendation, carousels, ad entry images
- `讲清卖点`: detail-page support, selling-point explanation
- `增强信任`: scene, texture, and credibility-oriented visuals

## What It Does

1. Accepts a JPG, PNG, or WEBP product image
2. Uses OpenAI Responses to analyze product type, selling points, and copy direction
3. Lets the user confirm the brief and business goal
4. Generates 1, 2, or 4 ecommerce visuals with staggered parallel requests
5. Supports retry, preview, and download per image
6. Provides a dev mode with placeholder output so UI work does not burn API budget
7. Protects the public trial flow with upload limits, proxy validation, and rate limiting

## Product Scope

LightPic is not trying to turn one image into arbitrary “AI style art”.

The current product thesis is:

- define the image's sales job first
- generate a usable ecommerce asset second

Right now the workflow is optimized for beauty and skincare use cases, especially Pinduoduo-style product marketing images.

## Stack

- Next.js 16 App Router
- React 19
- TypeScript
- Tailwind CSS v4
- OpenAI Responses API
- OpenAI Images Edits API
- OpenNext on Cloudflare Workers
- Vercel Functions for fixed-region AI requests

## Local Development

```bash
npm install
cp .env.example .env.local
npm run dev
```

Required in `.env.local`:

```env
OPENAI_API_KEY=...
```

For UI-only development:

```env
LIGHTPIC_DEV_MODE=1
```

For real model calls:

```env
LIGHTPIC_DEV_MODE=0
```

## Checks

```bash
npm run lint
npm run build
```

Evaluation script:

```bash
node scripts/eval-main-image.mjs
```

Real evaluation inputs and generated outputs are intentionally excluded from Git.

## Deployment Model

Cloudflare Workers is the public entry. To avoid OpenAI region instability from edge egress, API requests can proxy through `LIGHTPIC_API_ORIGIN` to fixed-region Vercel Functions in `iad1`.

Public trial protection currently includes:

- 2MB upload limit
- Cloudflare-to-Vercel proxy secret via `LIGHTPIC_PROXY_SECRET`
- Vercel-side fallback rate limiting per proxied client key
- production-only shutdown of `/api/test-image` unless explicitly enabled

Secrets are kept only in `.env.local`, Cloudflare secrets, or Vercel environment variables.

## Current Limits

- Results still require human review for product structure, logo text, packaging text, and claims.
- `¥3.99` is still a validation offer, not a complete payment system.
- This is an MVP trial flow, not yet a full quota, billing, and user-account product.
