const http = require('http');
const config = require('./config');
const { transformRequest, transformHeaders } = require('./transform');

function start(overrides = {}) {
  const cfg = { ...config.load(), ...overrides };
  const port = cfg.port;

  const server = http.createServer(async (req, res) => {
    // Health check
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', version: '1.0.0' }));
      return;
    }

    // Status / config check
    if (req.method === 'GET' && req.url === '/status') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        status: 'ok',
        compact: cfg.compact,
        proxy: cfg.proxy ? cfg.proxy.replace(/:\/\/.*@/, '://***@') : null,
        port: cfg.port,
      }));
      return;
    }

    // Only handle POST to /v1/messages*
    if (req.method !== 'POST' || !req.url.startsWith('/v1/messages')) {
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found. Bridge only handles POST /v1/messages' }));
      return;
    }

    try {
      // Read body
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const rawBody = Buffer.concat(chunks).toString();

      // Transform body
      const transformed = transformRequest(rawBody, req.headers, cfg);
      const newBody = JSON.stringify(transformed);

      // Transform headers
      const inHeaders = { ...req.headers };
      delete inHeaders['host'];
      delete inHeaders['content-length'];
      delete inHeaders['connection'];
      delete inHeaders['transfer-encoding'];

      // Keep authorization from openclaw
      const outHeaders = transformHeaders(inHeaders, cfg);
      outHeaders['content-type'] = 'application/json';

      // Target URL
      const targetUrl = `https://api.anthropic.com/v1/messages?beta=true`;

      // Log
      const model = transformed.model || 'unknown';
      const bodySize = newBody.length;
      const msgCount = transformed.messages?.length || 0;
      const toolCount = transformed.tools?.length || 0;
      console.log(`[${new Date().toISOString()}] ${model} | ${bodySize} bytes | ${msgCount} msgs | ${toolCount} tools`);

      // Forward via undici with proxy support
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

      // Stream response back
      res.writeHead(response.status, Object.fromEntries(
        [...response.headers.entries()].filter(([k]) =>
          !['transfer-encoding', 'connection', 'content-length'].includes(k.toLowerCase())
        )
      ));

      if (response.body) {
        const reader = response.body.getReader();
        const pump = async () => {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
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
        res.end(body);
      }

    } catch (err) {
      console.error('Bridge error:', err.message);
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: { type: 'bridge_error', message: err.message } }));
    }
  });

  server.listen(port, '127.0.0.1', () => {
    console.log(`openclaw-anthropic-bridge running on http://127.0.0.1:${port}`);
    console.log(`Proxy: ${cfg.proxy ? cfg.proxy.replace(/:\/\/.*@/, '://***@') : 'direct'}`);
    console.log(`Compact: system=${cfg.compact.systemPrompt} tools=${cfg.compact.toolDescriptions} dedup=${cfg.compact.deduplicateMessages}`);
  });

  return server;
}

// Run directly
if (require.main === module) {
  start();
}

module.exports = { start };
