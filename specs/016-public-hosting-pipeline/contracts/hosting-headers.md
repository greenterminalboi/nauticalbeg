# Contract: `public/_headers`

Vite copies `public/_headers` into `dist/`, and Cloudflare Pages applies it.

```text
/*
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Embedder-Policy: require-corp
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin

/assets/*
  Cache-Control: public, max-age=31536000, immutable
```

## Guarantees

| Path | Caching | Why |
|---|---|---|
| `/index.html`, `/` | Pages default (revalidate every load) | A new deploy is picked up on the next load |
| `/assets/*` | 1 year, immutable | Filenames contain a content hash, so a change means a new URL |
| `/map/*`, `/encyclopedia/*`, `/tokens/*` | Pages default (ETag revalidation) | Fixed names. A return visit costs a "not modified" reply, not the file (SC-003) |
| jsDelivr engine `.wasm` | 1 year, immutable (jsDelivr's own header) | Version-pinned URL |

- The isolation headers match `vite.config.ts`'s dev server exactly (research R3). If either is changed, change both.
- Compression (Brotli/gzip) is applied by Pages automatically and is not configured here.
- A test confirms `dist/_headers` exists after a build and contains both isolation headers.
