import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"

const targetBaseUrl =
  process.env.ORCHESTRATOR_URL ||
  process.env.A0_URL ||
  process.env.NEXT_PUBLIC_ORCHESTRATOR_URL ||
  process.env.NEXT_PUBLIC_A0_URL ||
  "http://localhost:8787"

const pinataGatewayUrl = normalizePinataGatewayUrl(process.env.PINATA_GATEWAY_URL || "https://gateway.pinata.cloud/ipfs")

function normalizePinataGatewayUrl(value: string) {
  const trimmed = value.trim().replace(/\/+$/, "")
  if (!trimmed) return "https://gateway.pinata.cloud/ipfs"
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  return withProtocol.endsWith("/ipfs") ? withProtocol : `${withProtocol}/ipfs`
}

const hopByHopHeaders = new Set([
  "connection",
  "content-length",
  "host",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
])

async function proxyToA0(request: NextRequest, context: { params: Promise<{ path?: string[] }> }) {
  const { path = [] } = await context.params
  if (request.method === "POST" && path.join("/") === "ens/profile/upload") {
    return uploadEnsProfileImage(request)
  }

  const sourceUrl = new URL(request.url)
  const targetUrl = new URL(`${targetBaseUrl.replace(/\/$/, "")}/${path.join("/")}`)
  targetUrl.search = sourceUrl.search

  const headers = new Headers()
  request.headers.forEach((value, key) => {
    if (!hopByHopHeaders.has(key.toLowerCase())) headers.set(key, value)
  })

  const hasBody = !["GET", "HEAD"].includes(request.method)
  const response = await fetch(targetUrl, {
    method: request.method,
    headers,
    body: hasBody ? await request.arrayBuffer() : undefined,
    cache: "no-store",
  })

  const responseHeaders = new Headers()
  response.headers.forEach((value, key) => {
    if (!hopByHopHeaders.has(key.toLowerCase())) responseHeaders.set(key, value)
  })

  return new NextResponse(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
  })
}

async function uploadEnsProfileImage(request: NextRequest) {
  const pinataJwt = process.env.PINATA_JWT
  if (!pinataJwt) {
    return NextResponse.json({ ok: false, error: "ipfs_not_configured" }, { status: 503 })
  }

  const form = await request.formData()
  const file = form.get("file")
  const kind = String(form.get("kind") || "avatar")
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "missing_file" }, { status: 400 })
  }
  if (kind !== "avatar" && kind !== "header") {
    return NextResponse.json({ ok: false, error: "invalid_kind" }, { status: 400 })
  }
  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ ok: false, error: "invalid_mime_type", mimeType: file.type }, { status: 400 })
  }

  const pinataForm = new FormData()
  pinataForm.append("file", file, file.name || `counteragent-ens-${kind}.png`)
  pinataForm.append("network", "public")
  pinataForm.append("name", `counteragent-ens-${kind}-${Date.now()}-${file.name || "image"}`)
  pinataForm.append("keyvalues", JSON.stringify({ app: "CounterAgent", sourcePlugin: "App/api/a0/ens-profile-upload", kind }))

  const pinataResponse = await fetch("https://uploads.pinata.cloud/v3/files", {
    method: "POST",
    headers: { Authorization: `Bearer ${pinataJwt}` },
    body: pinataForm,
  })
  const payload = await pinataResponse.json().catch(() => ({}))
  if (!pinataResponse.ok) {
    return NextResponse.json({ ok: false, error: "pinata_upload_failed" }, { status: 502 })
  }

  const cid = payload?.data?.cid
  if (!cid || typeof cid !== "string") {
    return NextResponse.json({ ok: false, error: "pinata_missing_cid" }, { status: 502 })
  }

  return NextResponse.json({
    ok: true,
    kind,
    cid,
    ipfsUri: `ipfs://${cid}`,
    url: `${pinataGatewayUrl}/${cid}`,
    mimeType: file.type,
    size: file.size,
    preparedBy: "App/api/a0/ens-profile-upload",
    storagePlugin: "direct-pinata",
  })
}

export const GET = proxyToA0
export const POST = proxyToA0
export const PUT = proxyToA0
export const PATCH = proxyToA0
export const DELETE = proxyToA0
