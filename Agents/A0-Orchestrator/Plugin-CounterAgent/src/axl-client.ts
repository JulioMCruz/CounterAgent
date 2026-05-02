export type AxlMode = 'off' | 'mirror' | 'transport';

export type AxlTopology = {
  our_public_key?: string;
  our_ipv6?: string;
  peers?: unknown[];
  tree?: unknown[];
  [key: string]: unknown;
};

export type CounterAgentAxlEnvelope = {
  workflowId: string;
  messageId: string;
  sequence: number;
  fromAgent: string;
  toAgent: string;
  messageType: string;
  createdAt: string;
  payload?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
};

export type AxlSendResult = {
  ok: boolean;
  mode: AxlMode;
  transport: 'disabled' | 'axl-send';
  peerId?: string;
  sentBytes?: number;
  error?: string;
};

export type AxlMcpResult<T> = {
  ok: boolean;
  mode: AxlMode;
  transport: 'disabled' | 'axl-mcp';
  peerId?: string;
  service?: string;
  tool?: string;
  result?: T;
  raw?: unknown;
  error?: string;
};

export type AxlPeerConfig = {
  A1?: string;
  A2?: string;
  A3?: string;
  A4?: string;
};

export class AxlClient {
  readonly mode: AxlMode;
  readonly nodeUrl?: string;
  readonly peers: AxlPeerConfig;

  constructor(input: { mode?: string; nodeUrl?: string; peers?: AxlPeerConfig }) {
    const normalizedMode = (input.mode ?? 'off').trim().toLowerCase();
    this.mode = normalizedMode === 'transport' || normalizedMode === 'mirror' ? normalizedMode : 'off';
    this.nodeUrl = input.nodeUrl?.replace(/\/$/, '');
    this.peers = input.peers ?? {};
  }

  get enabled() {
    return this.mode !== 'off' && Boolean(this.nodeUrl);
  }

  peerForAgent(agentName: string) {
    if (agentName.startsWith('A1-')) return this.peers.A1;
    if (agentName.startsWith('A2-')) return this.peers.A2;
    if (agentName.startsWith('A3-')) return this.peers.A3;
    if (agentName.startsWith('A4-')) return this.peers.A4;
    return undefined;
  }

  async topology(): Promise<AxlTopology | null> {
    if (!this.nodeUrl) return null;
    const response = await fetch(`${this.nodeUrl}/topology`);
    if (!response.ok) throw new Error(`axl_topology_failed:${response.status}`);
    return (await response.json()) as AxlTopology;
  }

  async callMcp<T>(input: { peerId?: string; service: string; tool: string; arguments: Record<string, unknown>; id?: string }): Promise<AxlMcpResult<T>> {
    if (!this.enabled) {
      return { ok: false, mode: this.mode, transport: 'disabled', error: 'axl_disabled' };
    }
    if (!input.peerId) {
      return { ok: false, mode: this.mode, transport: 'axl-mcp', service: input.service, tool: input.tool, error: 'axl_peer_not_configured' };
    }

    const response = await fetch(`${this.nodeUrl}/mcp/${input.peerId}/${input.service}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: input.id ?? `${Date.now()}`,
        method: 'tools/call',
        params: {
          name: input.tool,
          arguments: input.arguments
        }
      })
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        mode: this.mode,
        transport: 'axl-mcp',
        peerId: input.peerId,
        service: input.service,
        tool: input.tool,
        raw: payload,
        error: `axl_mcp_failed:${response.status}`
      };
    }

    if (payload && typeof payload === 'object' && 'error' in payload) {
      return {
        ok: false,
        mode: this.mode,
        transport: 'axl-mcp',
        peerId: input.peerId,
        service: input.service,
        tool: input.tool,
        raw: payload,
        error: 'axl_mcp_error'
      };
    }

    const result = payload && typeof payload === 'object' && 'result' in payload
      ? (payload as { result?: unknown }).result
      : payload;
    const content = result && typeof result === 'object' && 'content' in result
      ? (result as { content?: unknown }).content
      : undefined;

    if (Array.isArray(content) && content.length > 0) {
      const first = content[0];
      const text = first && typeof first === 'object' && 'text' in first ? (first as { text?: unknown }).text : undefined;
      if (typeof text === 'string') {
        try {
          return { ok: true, mode: this.mode, transport: 'axl-mcp', peerId: input.peerId, service: input.service, tool: input.tool, result: JSON.parse(text) as T, raw: payload };
        } catch {
          return { ok: true, mode: this.mode, transport: 'axl-mcp', peerId: input.peerId, service: input.service, tool: input.tool, result: text as T, raw: payload };
        }
      }
    }

    return { ok: true, mode: this.mode, transport: 'axl-mcp', peerId: input.peerId, service: input.service, tool: input.tool, result: result as T, raw: payload };
  }

  async send(peerId: string | undefined, envelope: CounterAgentAxlEnvelope): Promise<AxlSendResult> {
    if (!this.enabled) {
      return { ok: false, mode: this.mode, transport: 'disabled', error: 'axl_disabled' };
    }
    if (!peerId) {
      return { ok: false, mode: this.mode, transport: 'axl-send', error: 'axl_peer_not_configured' };
    }

    const body = JSON.stringify(envelope);
    const response = await fetch(`${this.nodeUrl}/send`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'X-Destination-Peer-Id': peerId
      },
      body
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      return {
        ok: false,
        mode: this.mode,
        transport: 'axl-send',
        peerId,
        error: `axl_send_failed:${response.status}${text ? `:${text.slice(0, 160)}` : ''}`
      };
    }

    const sentBytesHeader = response.headers.get('X-Sent-Bytes');
    const sentBytes = sentBytesHeader ? Number(sentBytesHeader) : Buffer.byteLength(body);
    return { ok: true, mode: this.mode, transport: 'axl-send', peerId, sentBytes };
  }
}
