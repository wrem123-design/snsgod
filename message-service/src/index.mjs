import { createServer } from 'node:http';
import { loadConfig } from './config.mjs';
import { openDatabase } from './database.mjs';
import { createMessageService, HttpError } from './service.mjs';

const config = loadConfig();
const db = openDatabase(config.dataDir);
const service = createMessageService({ db, config });

function send(response, status, payload) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  response.end(JSON.stringify(payload));
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 1024 * 1024) throw new HttpError(413, 'Request body is too large');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new HttpError(400, 'Request body must be valid JSON'); }
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
  try {
    if (request.method === 'GET' && url.pathname === '/health') return send(response, 200, service.health());
    if (request.method === 'POST' && url.pathname === '/v1/device/register') return send(response, 201, service.register(await readJson(request)));
    if (request.method === 'POST' && url.pathname === '/v1/sync/bootstrap') return send(response, 200, service.bootstrap(await readJson(request), request.headers));
    if (request.method === 'POST' && url.pathname === '/v1/messages') return send(response, 202, service.receiveMessage(await readJson(request), request.headers));
    if (request.method === 'GET' && url.pathname === '/v1/sync/changes') return send(response, 200, service.sync(Object.fromEntries(url.searchParams), request.headers));
    send(response, 404, { error: 'Not found' });
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    if (status >= 500) console.error(error);
    send(response, status, { error: error instanceof Error ? error.message : 'Internal error' });
  }
});

let schedulerRunning = false;
const timer = setInterval(() => {
  if (schedulerRunning) return;
  schedulerRunning = true;
  void service.runScheduler()
    .catch(error => console.error('scheduler error', error))
    .finally(() => { schedulerRunning = false; });
}, 1000);
timer.unref();

server.listen(config.port, config.host, () => {
  console.log(`SNSGod message service listening on http://${config.host}:${config.port}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    clearInterval(timer);
    server.close(() => {
      db.close();
      process.exit(0);
    });
  });
}
