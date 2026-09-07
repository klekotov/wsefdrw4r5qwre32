import axios from 'axios';
import express from 'express';
import { HttpsProxyAgent } from 'https-proxy-agent';

const requiredEnvironment = [
  'WORKER_URL',
  'RELAY_TOKEN',
  'WEBSHARE_USERNAME',
  'WEBSHARE_PASSWORD',
  'WEBSHARE_HOST',
  'WEBSHARE_PORT',
];

const missingEnvironment = requiredEnvironment.filter((name) => !process.env[name]);

if (missingEnvironment.length > 0) {
  throw new Error(`Missing environment variables: ${missingEnvironment.join(', ')}`);
}

const app = express();
const port = Number(process.env.PORT || 3000);
const workerUrl = process.env.WORKER_URL.replace(/\/+$/, '');
const proxyUrl = [
  'http://',
  encodeURIComponent(process.env.WEBSHARE_USERNAME),
  ':',
  encodeURIComponent(process.env.WEBSHARE_PASSWORD),
  '@',
  process.env.WEBSHARE_HOST,
  ':',
  process.env.WEBSHARE_PORT,
].join('');
const proxyAgent = new HttpsProxyAgent(proxyUrl);

const rateLimitWindowMs = 60_000;
const maxRequestsPerWindow = 60;
const requestBuckets = new Map();

app.disable('x-powered-by');
app.set('trust proxy', true);
app.use((request, response, next) => {
  const requestedOrigin = request.headers.origin;
  response.setHeader('Access-Control-Allow-Origin', requestedOrigin || '*');
  response.setHeader('Vary', 'Origin');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Relay-Token');
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

  if (request.method === 'OPTIONS') {
    return response.sendStatus(204);
  }

  next();
});
app.use(express.json({ limit: '32kb' }));

function getClientAddress(request) {
  return request.ip || request.socket.remoteAddress || 'unknown';
}

function isRateLimited(request) {
  const now = Date.now();
  const address = getClientAddress(request);
  const existing = requestBuckets.get(address);

  if (!existing || now - existing.startedAt >= rateLimitWindowMs) {
    requestBuckets.set(address, { startedAt: now, count: 1 });
    return false;
  }

  existing.count += 1;
  return existing.count > maxRequestsPerWindow;
}

function requireRelayToken(request, response, next) {
  if (request.get('X-Relay-Token') !== process.env.RELAY_TOKEN) {
    return response.status(401).json({ error: 'Unauthorized' });
  }

  if (isRateLimited(request)) {
    return response.status(429).json({ error: 'Too many requests' });
  }

  next();
}

app.get('/health', (_request, response) => {
  response.json({ ok: true, service: 'multi-tool-relay' });
});

async function forwardToWorker(path, request, response) {
  try {
    const upstreamResponse = await axios.post(`${workerUrl}${path}`, request.body, {
      httpsAgent: proxyAgent,
      proxy: false,
      timeout: 15_000,
      validateStatus: () => true,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    return response.status(upstreamResponse.status).json(upstreamResponse.data);
  } catch (error) {
    console.error('Worker request failed:', error.code || error.message);
    return response.status(502).json({ error: 'Upstream worker unavailable' });
  }
}

app.post('/api/license/check', requireRelayToken, (request, response) => {
  return forwardToWorker('/api/license/check', request, response);
});

app.post('/api/license/activate', requireRelayToken, (request, response) => {
  return forwardToWorker('/api/license/activate', request, response);
});

app.use((_request, response) => {
  response.status(404).json({ error: 'Route not found' });
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Relay listening on 0.0.0.0:${port}`);
});