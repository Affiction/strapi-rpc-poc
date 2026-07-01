/**
 * Local stand-in for the upstream JSON-RPC service, for dev/testing only.
 * Points at by UPSTREAM_URL in .env (defaults to http://127.0.0.1:4310/rpc).
 * Run with: npm run mock:upstream
 */
const http = require('http');

const PORT = 4310;

// One canned response per whitelisted method — shapes match each method's
// `result` schema in src/rpc/rpc-methods.ts. Edit these to try different
// payloads while testing through Swagger/Postman.
const RESPONSES = {
  'PricingService.recalculate': { result: { total: 42 } },
  'UserManager.banUser': { result: { banned: true } },
  'OrderService.createOrder': { error: { code: -32000, message: 'out of stock' } },
};

const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (chunk) => {
    body += chunk;
  });
  req.on('end', () => {
    const payload = JSON.parse(body);
    console.log(`[mock-upstream] ${payload.method} auth=${req.headers.authorization}`);

    const canned = RESPONSES[payload.method] ?? { result: {} };
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ jsonrpc: '2.0', id: payload.id, ...canned }));
  });
});

server.listen(PORT, () => console.log(`[mock-upstream] listening on ${PORT}`));
