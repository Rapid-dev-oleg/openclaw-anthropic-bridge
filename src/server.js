const http = require('http');
const config = require('./config');
const { transformRequest, transformHeaders } = require('./transform');
const { getAdminHTML } = require('./admin');

// In-memory request log (last 200 entries)
const requestLog = [];
const MAX_LOG = 200;

function addLog(entry) {
  requestLog.push(entry);
  if (requestLog.length > MAX_LOG) requestLog.shift();
}

function start(overrides = {}) {
  let cfg = { ...config.load(), ...overrides };
  const port = cfg.port;

  const server = http.createServer(async (req, res) => {
    // CORS for admin
    if (req.method === 'OPTIONS') {
      res.writeHead(204, { 'access-control-allow-origin': '*', 'access-control-allow-methods': '*', 'access-control-allow-headers': '*' });
      res.end();
      return;
    }

    // Admin UI
    if (req.method === 'GET' && (req.url === '/' || req.url === '/admin')) {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(getAdminHTML());
      return;
    }

    // Health check
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', version: '1.0.0' }));
      return;
    }

    // API: get logs
    if (req.method === 'GET' && req.url === '/api/logs') {
      res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
      res.end(JSON.stringify(requestLog));
      return;
    }

    // API: clear logs
    if (req.method === 'DELETE' && req.url === '/api/logs') {
      requestLog.length = 0;
      res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    // API: get config
    if (req.method === 'GET' && req.url === '/api/config') {
      const safeCfg = { ...cfg, proxy: cfg.proxy ? cfg.proxy.replace(/:\/\/.*@/, '://***@') : null };
      res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
      res.end(JSON.stringify(safeCfg));
      return;
    }

    // API: save config
    if (req.method === 'POST' && req.url === '/api/config') {
      try {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const newCfg = JSON.parse(Buffer.concat(chunks).toString());
        const merged = { ...cfg, ...newCfg, compact: { ...cfg.compact, ...(newCfg.compact || {}) } };
        config.save(merged);
        cfg = merged;
        res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        res.writeHead(400, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
      return;
    }

    // API: detect token
    if (req.method === 'GET' && req.url === '/api/setup/detect-token') {
      const fs = require('fs');
      const path = require('path');
      const HOME = process.env.HOME || '/root';
      const candidates = [
        process.env.CLAUDE_CREDENTIALS,
        path.join(HOME, '.claude', '.credentials.json'),
        path.join(HOME, '.claude-code', '.credentials.json'),
        path.join(HOME, '.config', 'claude', '.credentials.json'),
        path.join(HOME, '.config', 'claude-code', 'credentials.json'),
      ].filter(Boolean);
      let token = null, credPath = null, expiresIn = null;
      for (const p of candidates) {
        if (fs.existsSync(p)) {
          try {
            const creds = JSON.parse(fs.readFileSync(p, 'utf8'));
            token = creds?.claudeAiOauth?.accessToken;
            if (token) {
              credPath = p;
              const exp = creds?.claudeAiOauth?.expiresAt;
              if (exp) expiresIn = Math.round((exp - Date.now()) / 60000);
              break;
            }
          } catch {}
        }
      }
      res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
      res.end(JSON.stringify({ token: token || null, path: credPath, expiresIn }));
      return;
    }

    // API: test API connection
    if (req.method === 'POST' && req.url === '/api/setup/test-api') {
      try {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const { proxy } = JSON.parse(Buffer.concat(chunks).toString() || '{}');

        // Get token
        const fs = require('fs');
        const path = require('path');
        const HOME = process.env.HOME || '/root';
        let token = null;
        for (const p of [process.env.CLAUDE_CREDENTIALS, path.join(HOME, '.claude', '.credentials.json')].filter(Boolean)) {
          if (fs.existsSync(p)) {
            try { token = JSON.parse(fs.readFileSync(p, 'utf8'))?.claudeAiOauth?.accessToken; if (token) break; } catch {}
          }
        }
        if (!token) {
          res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
          res.end(JSON.stringify({ status: 0, error: 'No token found' }));
          return;
        }

        const undici = require('undici');
        const fetchOpts = {
          method: 'POST',
          headers: {
            'authorization': `Bearer ${token}`,
            'content-type': 'application/json',
            'anthropic-version': '2023-06-01',
            'anthropic-beta': 'claude-code-20250219,oauth-2025-04-20',
            'user-agent': 'claude-cli/2.1.92 (external, cli)',
            'x-app': 'cli',
          },
          body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', messages: [{ role: 'user', content: 'ping' }], max_tokens: 5 }),
        };
        const useProxy = proxy || cfg.proxy;
        if (useProxy) {
          const pu = new URL(useProxy);
          fetchOpts.dispatcher = new undici.ProxyAgent({
            uri: `${pu.protocol}//${pu.hostname}:${pu.port}`,
            ...(pu.username ? { token: 'Basic ' + Buffer.from(`${pu.username}:${pu.password}`).toString('base64') } : {})
          });
        }
        const resp = await undici.fetch('https://api.anthropic.com/v1/messages?beta=true', fetchOpts);
        let error = null;
        if (!resp.ok) { try { const b = await resp.json(); error = b?.error?.message; } catch {} }
        res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
        res.end(JSON.stringify({ status: resp.status, error }));
      } catch (e) {
        res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
        res.end(JSON.stringify({ status: 0, error: e.message }));
      }
      return;
    }

    // API: patch openclaw config
    if (req.method === 'POST' && req.url === '/api/setup/patch-openclaw') {
      const fs = require('fs');
      const path = require('path');
      const HOME = process.env.HOME || '/root';
      const ocPath = process.env.OPENCLAW_CONFIG || path.join(HOME, '.openclaw', 'openclaw.json');
      try {
        if (!fs.existsSync(ocPath)) throw new Error('openclaw.json not found at ' + ocPath);
        const oc = JSON.parse(fs.readFileSync(ocPath, 'utf8'));
        if (!oc.models) oc.models = {};
        if (!oc.models.providers) oc.models.providers = {};

        // Get token
        let token = null;
        for (const p of [path.join(HOME, '.claude', '.credentials.json')].filter(Boolean)) {
          if (fs.existsSync(p)) { try { token = JSON.parse(fs.readFileSync(p, 'utf8'))?.claudeAiOauth?.accessToken; } catch {} }
        }

        oc.models.providers.anthropic = {
          baseUrl: `http://127.0.0.1:${cfg.port}`,
          apiKey: token || '${ANTHROPIC_API_KEY}',
          api: 'anthropic-messages',
          models: [
            { id: 'claude-opus-4-6', name: 'Claude Opus 4.6', api: 'anthropic-messages', reasoning: true, input: ['text','image'], cost: {input:0,output:0,cacheRead:0,cacheWrite:0}, contextWindow: 200000, maxTokens: 16000 },
            { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', api: 'anthropic-messages', reasoning: true, input: ['text','image'], cost: {input:0,output:0,cacheRead:0,cacheWrite:0}, contextWindow: 200000, maxTokens: 16000 },
            { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5', api: 'anthropic-messages', reasoning: false, input: ['text'], cost: {input:0,output:0,cacheRead:0,cacheWrite:0}, contextWindow: 200000, maxTokens: 8192 },
          ]
        };
        if (!oc.auth) oc.auth = {};
        if (!oc.auth.profiles) oc.auth.profiles = {};
        oc.auth.profiles['anthropic:default'] = { provider: 'anthropic', mode: 'token' };
        if (token && !oc.env) oc.env = {};
        if (token) oc.env.ANTHROPIC_API_KEY = token;
        if (oc.agents?.defaults?.models) {
          oc.agents.defaults.models['anthropic/claude-opus-4-6'] = { alias: 'opus' };
          oc.agents.defaults.models['anthropic/claude-sonnet-4-6'] = { alias: 'sonnet' };
        }
        fs.writeFileSync(ocPath, JSON.stringify(oc, null, 2));
        res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
      return;
    }

    // API: save manual token
    if (req.method === 'POST' && req.url === '/api/setup/save-token') {
      try {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const { token } = JSON.parse(Buffer.concat(chunks).toString());
        if (!token) throw new Error('No token provided');

        const fs = require('fs');
        const path = require('path');
        const HOME = process.env.HOME || '/root';
        const ocPath = process.env.OPENCLAW_CONFIG || path.join(HOME, '.openclaw', 'openclaw.json');
        if (fs.existsSync(ocPath)) {
          const oc = JSON.parse(fs.readFileSync(ocPath, 'utf8'));
          if (!oc.env) oc.env = {};
          oc.env.ANTHROPIC_API_KEY = token;
          if (oc.models?.providers?.anthropic) oc.models.providers.anthropic.apiKey = token;
          fs.writeFileSync(ocPath, JSON.stringify(oc, null, 2));
        }
        res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
      return;
    }

    // Status
    if (req.method === 'GET' && req.url === '/status') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        status: 'ok',
        compact: cfg.compact,
        proxy: cfg.proxy ? cfg.proxy.replace(/:\/\/.*@/, '://***@') : null,
        port: cfg.port,
        logCount: requestLog.length,
      }));
      return;
    }

    // Only handle POST to /v1/messages*
    if (req.method !== 'POST' || !req.url.startsWith('/v1/messages')) {
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found. Bridge handles POST /v1/messages. Admin at /' }));
      return;
    }

    const startTime = Date.now();
    const logEntry = { time: new Date().toISOString(), model: null, status: null, bodySize: 0, inputTokens: null, cacheRead: null, cacheCreated: null, durationMs: null, reqHeaders: {}, respPreview: '' };

    try {
      // Read body
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const rawBody = Buffer.concat(chunks).toString();

      // Transform body
      const transformed = transformRequest(rawBody, req.headers, cfg);
      const newBody = JSON.stringify(transformed);

      logEntry.model = transformed.model || 'unknown';
      logEntry.bodySize = newBody.length;

      // Transform headers
      const inHeaders = { ...req.headers };
      delete inHeaders['host'];
      delete inHeaders['content-length'];
      delete inHeaders['connection'];
      delete inHeaders['transfer-encoding'];

      const outHeaders = transformHeaders(inHeaders, cfg);
      outHeaders['content-type'] = 'application/json';

      // Sanitize auth for log
      logEntry.reqHeaders = { ...outHeaders };
      if (logEntry.reqHeaders.authorization) {
        logEntry.reqHeaders.authorization = logEntry.reqHeaders.authorization.substring(0, 30) + '...';
      }

      const targetUrl = `https://api.anthropic.com/v1/messages?beta=true`;

      const msgCount = transformed.messages?.length || 0;
      const toolCount = transformed.tools?.length || 0;
      console.log(`[${logEntry.time}] ${logEntry.model} | ${logEntry.bodySize} bytes | ${msgCount} msgs | ${toolCount} tools`);

      // Forward via undici
      const undici = require('undici');
      const fetchOptions = {
        method: 'POST',
        headers: outHeaders,
        body: newBody,
      };

      if (cfg.proxy) {
        const proxyUrl = new URL(cfg.proxy);
        const proxyAgent = new undici.ProxyAgent({
          uri: `${proxyUrl.protocol}//${proxyUrl.hostname}:${proxyUrl.port}`,
          ...(proxyUrl.username ? {
            token: 'Basic ' + Buffer.from(`${proxyUrl.username}:${proxyUrl.password}`).toString('base64')
          } : {})
        });
        fetchOptions.dispatcher = proxyAgent;
      }

      const response = await undici.fetch(targetUrl, fetchOptions);

      logEntry.status = response.status;
      logEntry.durationMs = Date.now() - startTime;

      // Stream response back
      const respHeaders = Object.fromEntries(
        [...response.headers.entries()].filter(([k]) =>
          !['transfer-encoding', 'connection', 'content-length', 'content-encoding'].includes(k.toLowerCase())
        )
      );
      res.writeHead(response.status, respHeaders);

      if (response.body) {
        const reader = response.body.getReader();
        let firstChunk = true;
        const pump = async () => {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (firstChunk) {
              logEntry.respPreview = Buffer.from(value).toString().substring(0, 500);
              try {
                const match = logEntry.respPreview.match(/"input_tokens":(\d+)/);
                if (match) logEntry.inputTokens = parseInt(match[1]);
                const cacheRead = logEntry.respPreview.match(/"cache_read_input_tokens":(\d+)/);
                if (cacheRead) logEntry.cacheRead = parseInt(cacheRead[1]);
                const cacheCreate = logEntry.respPreview.match(/"cache_creation_input_tokens":(\d+)/);
                if (cacheCreate) logEntry.cacheCreated = parseInt(cacheCreate[1]);
              } catch {}
              firstChunk = false;
            }
            res.write(value);
          }
          res.end();
        };
        pump().catch(err => {
          console.error('Stream error:', err.message);
          res.end();
        });
      } else {
        const body = await response.text();
        logEntry.respPreview = body.substring(0, 300);
        res.end(body);
      }

      addLog(logEntry);
      const cacheInfo = logEntry.cacheRead ? ` | cache_read:${logEntry.cacheRead}` : (logEntry.cacheCreated ? ` | cache_new:${logEntry.cacheCreated}` : '');
      console.log(`  → ${logEntry.status} | ${logEntry.durationMs}ms | ${logEntry.inputTokens || '?'} tokens${cacheInfo}`);

    } catch (err) {
      logEntry.status = 500;
      logEntry.durationMs = Date.now() - startTime;
      logEntry.respPreview = err.message;
      addLog(logEntry);
      console.error('Bridge error:', err.message);
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: { type: 'bridge_error', message: err.message } }));
    }
  });

  server.listen(port, '127.0.0.1', () => {
    console.log(`openclaw-anthropic-bridge running on http://127.0.0.1:${port}`);
    console.log(`Admin UI: http://127.0.0.1:${port}/admin`);
    console.log(`Proxy: ${cfg.proxy ? cfg.proxy.replace(/:\/\/.*@/, '://***@') : 'direct'}`);
    console.log(`Compact: system=${cfg.compact.systemPrompt} tools=${cfg.compact.toolDescriptions} dedup=${cfg.compact.deduplicateMessages}`);
  });

  return server;
}

if (require.main === module) {
  start();
}

module.exports = { start };
