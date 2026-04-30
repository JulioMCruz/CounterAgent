# OpenClaw Plugin: IPFS Pinata

Reusable OpenClaw HTTP plugin for uploading files to IPFS through Pinata.

## Runtime env

- `PINATA_JWT` — server-side Pinata JWT. Required.
- `PINATA_GATEWAY_URL` — public gateway base. Accepts either `https://gateway.pinata.cloud/ipfs` or `gateway.example.com`; normalized to `/ipfs/<cid>`.
- `IPFS_UPLOAD_MAX_BYTES` — upload limit, default `10000000`.
- `CORS_ORIGIN` — comma-separated allowed origins.
- `PORT` — default `8793`.

## Endpoints

### `GET /healthz`

Returns `{ ok: true, status: "live" }`.

### `POST /ipfs/upload`

Multipart form:

- `file` — file to upload.
- `kind` — optional semantic tag, e.g. `avatar`, `header`.
- `app` — optional app tag, defaults `CounterAgent`.
- `sourcePlugin` — optional source tag.

Returns CID, `ipfs://` URI, and public gateway URL.
