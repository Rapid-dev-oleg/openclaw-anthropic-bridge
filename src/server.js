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
    const logEntry = { time: new Date().toISOString(), model: null, status: null, bodySize: 0, inputTokens: null, durationMs: null, reqHeaders: {}, respPreview: '' };

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
              logEntry.respPreview = Buffer.from(value).toString().substring(0, 300);
              // Try to extract input_tokens from first chunk
              try {
                const match = logEntry.respPreview.match(/"input_tokens":(\d+)/);
                if (match) logEntry.inputTokens = parseInt(match[1]);
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
      console.log(`  → ${logEntry.status} | ${logEntry.durationMs}ms | ${logEntry.inputTokens || '?'} tokens`);

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
