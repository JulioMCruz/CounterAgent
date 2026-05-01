import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"

const targetBaseUrl =
  process.env.ORCHESTRATOR_URL ||
  process.env.A0_URL ||
  process.env.NEXT_PUBLIC_ORCHESTRATOR_URL ||
  process.env.NEXT_PUBLIC_A0_URL ||
  "http://localhost:8787"

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

export const GET = proxyToA0
export const POST = proxyToA0
export const PUT = proxyToA0
export const PATCH = proxyToA0
export const DELETE = proxyToA0
