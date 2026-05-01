const targetBaseUrl =
  process.env.ORCHESTRATOR_URL ||
  process.env.A0_URL ||
  process.env.NEXT_PUBLIC_ORCHESTRATOR_URL ||
  process.env.NEXT_PUBLIC_A0_URL ||
  'https://orchestrator.counteragent.perkos.xyz';

const json = (statusCode, body) => ({
  statusCode,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store'
  },
  body: JSON.stringify(body)
});

const dashboardFallback = (merchant) => json(200, {
  ok: true,
  merchant,
  decisions: [],
  executions: [],
  reports: [],
  kpis: {
    totalSavedUsd: '0.00',
    swapsExecuted: 0,
    volumeUsd: '0.00'
  },
  unavailable: ['A0-dashboard-state']
});

export async function handler(event) {
  const prefix = '/api/a0/';
  const path = event.path.includes(prefix) ? event.path.slice(event.path.indexOf(prefix) + prefix.length) : '';
  const query = event.rawQuery ? `?${event.rawQuery}` : '';
  const targetUrl = `${targetBaseUrl.replace(/\/$/, '')}/${path}${query}`;

  const headers = { ...event.headers };
  delete headers.host;
  delete headers.connection;
  delete headers['content-length'];

  try {
    const response = await fetch(targetUrl, {
      method: event.httpMethod,
      headers,
      body: ['GET', 'HEAD'].includes(event.httpMethod) ? undefined : Buffer.from(event.body || '', event.isBase64Encoded ? 'base64' : 'utf8')
    });

    const contentType = response.headers.get('content-type') || '';
    const text = await response.text();

    if (path === 'dashboard/state' && !contentType.includes('application/json')) {
      return dashboardFallback(new URL(targetUrl).searchParams.get('merchant') || '');
    }

    return {
      statusCode: response.status,
      headers: {
        'content-type': contentType || 'application/octet-stream',
        'cache-control': 'no-store'
      },
      body: text
    };
  } catch (error) {
    if (path === 'dashboard/state') {
      return dashboardFallback(new URL(targetUrl).searchParams.get('merchant') || '');
    }

    return json(502, {
      ok: false,
      error: 'a0_proxy_failed',
      message: error instanceof Error ? error.message : 'A0 proxy failed'
    });
  }
}
