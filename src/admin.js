const config = require('./config');

function getAdminHTML() {
  const cfg = config.load();
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Anthropic Bridge</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0a0a0f; color: #e0e0e0; min-height: 100vh; }
.header { background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); padding: 20px 30px; display: flex; align-items: center; gap: 16px; border-bottom: 1px solid #2a2a4a; }
.header h1 { font-size: 18px; font-weight: 600; color: #fff; }
.header .status { margin-left: auto; display: flex; align-items: center; gap: 8px; font-size: 13px; }
.header .dot { width: 8px; height: 8px; border-radius: 50%; background: #4ade80; }
.header .dot.off { background: #f87171; }
.tabs { display: flex; background: #111118; border-bottom: 1px solid #2a2a4a; }
.tab { padding: 12px 24px; cursor: pointer; font-size: 14px; color: #888; border-bottom: 2px solid transparent; transition: all 0.2s; }
.tab:hover { color: #ccc; background: #1a1a28; }
.tab.active { color: #818cf8; border-bottom-color: #818cf8; }
.content { max-width: 900px; margin: 0 auto; padding: 24px; }
.panel { display: none; }
.panel.active { display: block; }

/* Cards & Fields */
.card { background: #14141f; border: 1px solid #2a2a4a; border-radius: 12px; padding: 20px; margin-bottom: 16px; }
.card h3 { font-size: 14px; color: #818cf8; margin-bottom: 12px; text-transform: uppercase; letter-spacing: 0.5px; }
.field { display: flex; align-items: center; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #1e1e30; }
.field:last-child { border-bottom: none; }
.field label { font-size: 14px; color: #ccc; }
.field .desc { font-size: 12px; color: #666; margin-top: 2px; }
.field input[type="text"], .field input[type="number"], .field input[type="password"] {
  background: #1a1a28; border: 1px solid #2a2a4a; border-radius: 6px; padding: 8px 12px;
  color: #e0e0e0; font-size: 13px; width: 280px; font-family: 'SF Mono', monospace;
}
.field input:focus { outline: none; border-color: #818cf8; }
.toggle { position: relative; width: 44px; height: 24px; cursor: pointer; flex-shrink: 0; }
.toggle input { display: none; }
.toggle .slider { position: absolute; inset: 0; background: #2a2a4a; border-radius: 12px; transition: 0.2s; }
.toggle input:checked + .slider { background: #818cf8; }
.toggle .slider:before { content: ''; position: absolute; width: 18px; height: 18px; left: 3px; top: 3px; background: #fff; border-radius: 50%; transition: 0.2s; }
.toggle input:checked + .slider:before { transform: translateX(20px); }
.btn { background: #818cf8; color: #fff; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer; font-size: 14px; font-weight: 500; transition: 0.2s; display: inline-flex; align-items: center; gap: 8px; }
.btn:hover { background: #6366f1; }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }
.btn.secondary { background: #2a2a4a; }
.btn.secondary:hover { background: #3a3a5a; }
.btn.danger { background: #dc2626; }
.btn.danger:hover { background: #b91c1c; }
.btn.success { background: #16a34a; }
.btn.success:hover { background: #15803d; }
.save-bar { display: flex; gap: 10px; justify-content: flex-end; margin-top: 16px; }
.toast { position: fixed; bottom: 20px; right: 20px; background: #4ade80; color: #000; padding: 12px 20px; border-radius: 8px; font-size: 14px; font-weight: 500; opacity: 0; transition: 0.3s; pointer-events: none; z-index: 100; }
.toast.show { opacity: 1; }

/* Logs */
.log-controls { display: flex; gap: 10px; margin-bottom: 16px; align-items: center; }
.log-controls .count { margin-left: auto; font-size: 13px; color: #666; }
.log-table { width: 100%; border-collapse: collapse; }
.log-table th { text-align: left; padding: 8px 12px; font-size: 12px; color: #666; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid #2a2a4a; }
.log-table td { padding: 10px 12px; font-size: 13px; border-bottom: 1px solid #1a1a28; font-family: 'SF Mono', monospace; }
.log-table tr:hover { background: #1a1a28; }
.badge { padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; }
.badge.s200 { background: #064e3b; color: #4ade80; }
.badge.s429 { background: #451a03; color: #fb923c; }
.badge.s400, .badge.s403 { background: #450a0a; color: #f87171; }
.badge.s500 { background: #450a0a; color: #f87171; }
.model-opus { color: #c084fc; }
.model-sonnet { color: #60a5fa; }
.model-haiku { color: #4ade80; }
.empty { text-align: center; padding: 40px; color: #444; font-size: 14px; }
.log-detail { display: none; background: #0d0d14; padding: 12px; border-radius: 6px; margin: 4px 0; font-size: 12px; white-space: pre-wrap; word-break: break-all; max-height: 300px; overflow-y: auto; }

/* Setup */
.setup-log { background: #0d0d14; border: 1px solid #2a2a4a; border-radius: 8px; padding: 16px; font-family: 'SF Mono', monospace; font-size: 13px; min-height: 200px; max-height: 400px; overflow-y: auto; white-space: pre-wrap; line-height: 1.6; }
.setup-log .ok { color: #4ade80; }
.setup-log .err { color: #f87171; }
.setup-log .warn { color: #fb923c; }
.setup-log .info { color: #818cf8; }
.setup-step { margin-bottom: 20px; }
.token-input { display: flex; gap: 10px; margin-top: 12px; }
.token-input input { flex: 1; }
</style>
</head>
<body>
<div class="header">
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#818cf8" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
  <h1>Anthropic Bridge</h1>
  <div class="status"><div class="dot" id="statusDot"></div><span id="statusText">connected</span></div>
</div>
<div class="tabs">
  <div class="tab active" data-tab="logs">Logs</div>
  <div class="tab" data-tab="settings">Settings</div>
  <div class="tab" data-tab="setup">Setup</div>
</div>
<div class="content">

  <!-- LOGS -->
  <div class="panel active" id="logs">
    <div class="log-controls">
      <button class="btn secondary" onclick="clearLogs()">Clear</button>
      <button class="btn secondary" onclick="loadLogs()">Refresh</button>
      <label class="toggle" title="Auto-refresh"><input type="checkbox" id="autoRefresh" checked><span class="slider"></span></label>
      <span style="font-size:12px;color:#666">Auto</span>
      <span class="count" id="logCount">0 requests</span>
    </div>
    <table class="log-table">
      <thead><tr><th>Time</th><th>Model</th><th>Status</th><th>Tokens</th><th>Cache</th><th>Size</th><th>Duration</th></tr></thead>
      <tbody id="logBody"></tbody>
    </table>
    <div class="empty" id="emptyLogs">No requests yet</div>
  </div>

  <!-- SETTINGS -->
  <div class="panel" id="settings">
    <div class="card">
      <h3>Server</h3>
      <div class="field">
        <div><label>Port</label><div class="desc">Bridge listening port</div></div>
        <input type="number" id="port" value="${cfg.port}">
      </div>
      <div class="field">
        <div><label>External Proxy</label><div class="desc">HTTP proxy for geo-blocking bypass</div></div>
        <input type="text" id="proxy" value="${cfg.proxy || ''}" placeholder="http://user:pass@host:port">
      </div>
    </div>
    <div class="card">
      <h3>Optimization</h3>
      <div class="field">
        <div><label>Compact System Prompt</label><div class="desc">Trim large system prompts to save tokens</div></div>
        <label class="toggle"><input type="checkbox" id="compactSystem" ${cfg.compact.systemPrompt ? 'checked' : ''}><span class="slider"></span></label>
      </div>
      <div class="field">
        <div><label>Max Length</label><div class="desc">System prompt character limit</div></div>
        <input type="number" id="systemMaxLen" value="${cfg.compact.systemPromptMaxLen}">
      </div>
      <div class="field">
        <div><label>Compact Tool Descriptions</label><div class="desc">Truncate verbose tool descriptions</div></div>
        <label class="toggle"><input type="checkbox" id="compactTools" ${cfg.compact.toolDescriptions ? 'checked' : ''}><span class="slider"></span></label>
      </div>
      <div class="field">
        <div><label>Max Length</label><div class="desc">Tool description character limit</div></div>
        <input type="number" id="toolMaxLen" value="${cfg.compact.toolDescMaxLen}">
      </div>
      <div class="field">
        <div><label>Deduplicate Messages</label><div class="desc">Remove consecutive duplicate messages</div></div>
        <label class="toggle"><input type="checkbox" id="dedup" ${cfg.compact.deduplicateMessages ? 'checked' : ''}><span class="slider"></span></label>
      </div>
    </div>
    <div class="save-bar">
      <button class="btn" onclick="saveSettings()">Save</button>
    </div>
  </div>

  <!-- SETUP -->
  <div class="panel" id="setup">
    <div class="card">
      <h3>Auto Setup</h3>
      <p style="font-size:13px;color:#999;margin-bottom:16px">
        Detects Claude Code token, tests API connection, configures OpenClaw automatically.
      </p>
      <div class="setup-step">
        <div class="field">
          <div><label>External Proxy</label><div class="desc">Leave empty for direct connection</div></div>
          <input type="text" id="setupProxy" value="${cfg.proxy || ''}" placeholder="http://user:pass@host:port">
        </div>
      </div>
      <div style="display:flex;gap:10px;margin-bottom:16px">
        <button class="btn success" id="btnAutoSetup" onclick="runAutoSetup()">Run Auto Setup</button>
        <button class="btn secondary" id="btnTestApi" onclick="testApi()">Test API</button>
      </div>
      <div class="setup-log" id="setupLog">Ready. Click "Run Auto Setup" to begin.</div>
    </div>
    <div class="card">
      <h3>Manual Token</h3>
      <p style="font-size:13px;color:#999;margin-bottom:12px">
        If auto-detection fails, paste your Claude Code OAuth token here (starts with sk-ant-oat01-)
      </p>
      <div class="token-input">
        <input type="password" id="manualToken" placeholder="sk-ant-oat01-...">
        <button class="btn" onclick="saveToken()">Save Token</button>
      </div>
    </div>
  </div>

</div>
<div class="toast" id="toast"></div>

<script>
// Tabs
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(tab.dataset.tab).classList.add('active');
  });
});

function toast(msg, ok=true) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.style.background = ok ? '#4ade80' : '#f87171';
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2000);
}

// === SETTINGS ===
async function saveSettings() {
  const body = {
    port: parseInt(document.getElementById('port').value),
    proxy: document.getElementById('proxy').value || null,
    compact: {
      systemPrompt: document.getElementById('compactSystem').checked,
      systemPromptMaxLen: parseInt(document.getElementById('systemMaxLen').value),
      toolDescriptions: document.getElementById('compactTools').checked,
      toolDescMaxLen: parseInt(document.getElementById('toolMaxLen').value),
      deduplicateMessages: document.getElementById('dedup').checked,
    }
  };
  try {
    const r = await fetch('/api/config', { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify(body) });
    const d = await r.json();
    toast(d.ok ? 'Saved! Restart bridge to apply.' : 'Error: ' + d.error, d.ok);
  } catch(e) { toast('Error: ' + e.message, false); }
}

// === LOGS ===
let logs = [];
async function loadLogs() {
  try {
    const r = await fetch('/api/logs');
    logs = await r.json();
    renderLogs();
  } catch(e) {}
}
function renderLogs() {
  const body = document.getElementById('logBody');
  const empty = document.getElementById('emptyLogs');
  document.getElementById('logCount').textContent = logs.length + ' requests';
  if (!logs.length) { body.innerHTML = ''; empty.style.display = 'block'; return; }
  empty.style.display = 'none';
  body.innerHTML = logs.slice().reverse().map((l, i) => {
    const mc = l.model?.includes('opus') ? 'model-opus' : l.model?.includes('sonnet') ? 'model-sonnet' : 'model-haiku';
    const sc = 's' + (l.status || 0);
    const time = new Date(l.time).toLocaleTimeString();
    return '<tr onclick="toggleDetail(this)" style="cursor:pointer">' +
      '<td>' + time + '</td><td class="' + mc + '">' + (l.model||'?') + '</td>' +
      '<td><span class="badge ' + sc + '">' + (l.status||'...') + '</span></td>' +
      '<td>' + (l.inputTokens||'-') + '</td>' +
      '<td>' + (l.cacheRead ? '<span style=\"color:#4ade80\">read:'+l.cacheRead+'</span>' : l.cacheCreated ? '<span style=\"color:#fb923c\">new:'+l.cacheCreated+'</span>' : '-') + '</td>' +
      '<td>' + fmtB(l.bodySize) + '</td>' +
      '<td>' + (l.durationMs ? l.durationMs+'ms' : '-') + '</td></tr>' +
      '<tr><td colspan="7"><div class="log-detail" id="d-'+i+'">' +
      esc(JSON.stringify(l.reqHeaders||{},null,2)) + '\\n\\n' + esc(l.respPreview||'') +
      '</div></td></tr>';
  }).join('');
}
function toggleDetail(row) {
  const d = row.nextElementSibling?.querySelector('.log-detail');
  if (d) d.style.display = d.style.display === 'block' ? 'none' : 'block';
}
function fmtB(b) { return !b ? '-' : b<1024 ? b+'B' : (b/1024).toFixed(1)+'KB'; }
function esc(s) { return s.replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
async function clearLogs() {
  await fetch('/api/logs', { method: 'DELETE' });
  logs = []; renderLogs(); toast('Logs cleared');
}
setInterval(() => { if (document.getElementById('autoRefresh').checked) loadLogs(); }, 3000);

// === SETUP ===
function slog(msg, cls='') {
  const el = document.getElementById('setupLog');
  el.innerHTML += '<span class="'+cls+'">' + esc(msg) + '</span>\\n';
  el.scrollTop = el.scrollHeight;
}

async function runAutoSetup() {
  const el = document.getElementById('setupLog');
  el.innerHTML = '';
  const btn = document.getElementById('btnAutoSetup');
  btn.disabled = true;

  const proxy = document.getElementById('setupProxy').value || null;

  slog('[1/4] Detecting Claude Code token...', 'info');
  try {
    const r = await fetch('/api/setup/detect-token');
    const d = await r.json();
    if (d.token) {
      slog('  ✓ Token found: ' + d.token.substring(0, 25) + '...', 'ok');
      slog('  → Path: ' + d.path, '');
      if (d.expiresIn) slog('  → Expires in: ' + d.expiresIn + ' min', '');
    } else {
      slog('  ✗ Token not found automatically', 'err');
      slog('  → Use "Manual Token" section below to enter it', 'warn');
      btn.disabled = false;
      return;
    }
  } catch(e) { slog('  ✗ Error: ' + e.message, 'err'); btn.disabled = false; return; }

  slog('');
  slog('[2/4] Testing API connection...', 'info');
  try {
    const r = await fetch('/api/setup/test-api', {
      method: 'POST',
      headers: {'content-type':'application/json'},
      body: JSON.stringify({ proxy })
    });
    const d = await r.json();
    if (d.status === 200) {
      slog('  ✓ API connection OK', 'ok');
    } else if (d.status === 429) {
      slog('  ✓ API auth OK (rate limited)', 'ok');
    } else if (d.status === 403) {
      slog('  ✗ 403 Forbidden — geo-blocked?', 'err');
      if (!proxy) slog('  → Set an external proxy and try again', 'warn');
      btn.disabled = false;
      return;
    } else {
      slog('  ⚠ API returned ' + d.status + ': ' + (d.error || ''), 'warn');
    }
  } catch(e) { slog('  ✗ ' + e.message, 'err'); btn.disabled = false; return; }

  slog('');
  slog('[3/4] Saving bridge config...', 'info');
  try {
    const body = { proxy };
    const r = await fetch('/api/config', { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify(body) });
    const d = await r.json();
    slog('  ✓ Bridge config saved', 'ok');
  } catch(e) { slog('  ✗ ' + e.message, 'err'); }

  slog('');
  slog('[4/4] Configuring OpenClaw...', 'info');
  try {
    const r = await fetch('/api/setup/patch-openclaw', { method: 'POST' });
    const d = await r.json();
    if (d.ok) {
      slog('  ✓ OpenClaw config updated', 'ok');
      slog('  → baseUrl = http://127.0.0.1:${cfg.port}', '');
      slog('  → Models: opus-4-6, sonnet-4-6, haiku-4-5', '');
    } else {
      slog('  ✗ ' + d.error, 'err');
    }
  } catch(e) { slog('  ✗ ' + e.message, 'err'); }

  slog('');
  slog('Done! Restart OpenClaw: openclaw gateway start', 'ok');
  btn.disabled = false;
}

async function testApi() {
  const btn = document.getElementById('btnTestApi');
  btn.disabled = true;
  const proxy = document.getElementById('setupProxy').value || null;
  try {
    const r = await fetch('/api/setup/test-api', {
      method: 'POST',
      headers: {'content-type':'application/json'},
      body: JSON.stringify({ proxy })
    });
    const d = await r.json();
    if (d.status === 200) toast('API OK — haiku responded');
    else if (d.status === 429) toast('API auth OK — rate limited');
    else toast('API error: ' + d.status + ' ' + (d.error||''), false);
  } catch(e) { toast('Error: ' + e.message, false); }
  btn.disabled = false;
}

async function saveToken() {
  const token = document.getElementById('manualToken').value.trim();
  if (!token) { toast('Enter a token', false); return; }
  if (!token.startsWith('sk-ant-')) { toast('Token should start with sk-ant-', false); return; }
  try {
    const r = await fetch('/api/setup/save-token', {
      method: 'POST',
      headers: {'content-type':'application/json'},
      body: JSON.stringify({ token })
    });
    const d = await r.json();
    toast(d.ok ? 'Token saved to OpenClaw config' : d.error, d.ok);
  } catch(e) { toast('Error: ' + e.message, false); }
}

// Health
async function checkHealth() {
  try {
    const r = await fetch('/health'); await r.json();
    document.getElementById('statusDot').className = 'dot';
    document.getElementById('statusText').textContent = 'connected';
  } catch {
    document.getElementById('statusDot').className = 'dot off';
    document.getElementById('statusText').textContent = 'disconnected';
  }
}
setInterval(checkHealth, 5000);
loadLogs();
</script>
</body>
</html>`;
}

module.exports = { getAdminHTML };
