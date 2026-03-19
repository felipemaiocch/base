const fs = require('fs/promises');
const http = require('http');
const path = require('path');
require('dotenv').config();

const { ensureSchema, getKnowledgeBase, getKnowledgeBaseChunks, saveKnowledgeBase } = require('./lib/db');
const { buildPromptHistory, buildSystemPrompt, normalizeHistory, requestAiCompletion, resolveAiConfig } = require('./lib/chat');
const { NO_INFO_REPLY, selectRelevantKnowledgeChunks } = require('./lib/knowledge-base');
const { parseJsonBody, sendJson } = require('./lib/http');
const {
  safeEqual,
  createSessionToken,
  buildSessionCookie,
  buildExpiredSessionCookie,
  isAdminAuthenticated,
} = require('./lib/session');

const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.join(__dirname, 'public');

function sendHtmlFile(res, filePath) {
  return fs.readFile(filePath, 'utf8').then((content) => {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(content);
  });
}

function redirect(res, location) {
  res.statusCode = 302;
  res.setHeader('Location', location);
  res.end(`Found. Redirecting to ${location}`);
}

function requireAdminPage(req, res) {
  if (!isAdminAuthenticated(req)) {
    redirect(res, '/admin/login');
    return false;
  }

  return true;
}

function requireAdminApi(req, res) {
  if (!isAdminAuthenticated(req)) {
    sendJson(res, 401, { error: 'Nao autorizado.' });
    return false;
  }

  return true;
}

async function handleRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;

  if (req.method === 'GET' && pathname === '/') {
    await sendHtmlFile(res, path.join(PUBLIC_DIR, 'index.html'));
    return;
  }

  if (req.method === 'GET' && pathname === '/admin/login') {
    if (isAdminAuthenticated(req)) {
      redirect(res, '/admin');
      return;
    }

    await sendHtmlFile(res, path.join(PUBLIC_DIR, 'admin', 'login', 'index.html'));
    return;
  }

  if (req.method === 'GET' && pathname === '/admin') {
    if (!requireAdminPage(req, res)) {
      return;
    }

    await sendHtmlFile(res, path.join(PUBLIC_DIR, 'admin', 'index.html'));
    return;
  }

  if (req.method === 'POST' && pathname === '/api/admin/login') {
    const body = await parseJsonBody(req);
    const password = typeof body.password === 'string' ? body.password : '';

    if (!password) {
      sendJson(res, 400, { error: 'Informe a senha do painel.' });
      return;
    }

    if (!safeEqual(password, process.env.ADMIN_PASSWORD || '')) {
      sendJson(res, 401, { error: 'Senha invalida.' });
      return;
    }

    res.setHeader('Set-Cookie', buildSessionCookie(createSessionToken()));
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === 'POST' && pathname === '/api/admin/logout') {
    res.setHeader('Set-Cookie', buildExpiredSessionCookie());
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === 'GET' && pathname === '/api/admin/knowledge-base') {
    if (!requireAdminApi(req, res)) {
      return;
    }

    const knowledgeBase = await getKnowledgeBase();
    sendJson(res, 200, {
      content: knowledgeBase.value,
      updatedAt: knowledgeBase.updated_at,
      chunkCount: knowledgeBase.chunk_count,
    });
    return;
  }

  if (req.method === 'PUT' && pathname === '/api/admin/knowledge-base') {
    if (!requireAdminApi(req, res)) {
      return;
    }

    const body = await parseJsonBody(req);
    const content = typeof body.content === 'string' ? body.content.trim() : '';

    await saveKnowledgeBase(content);
    const knowledgeBase = await getKnowledgeBase();

    sendJson(res, 200, {
      ok: true,
      updatedAt: knowledgeBase.updated_at,
      chunkCount: knowledgeBase.chunk_count,
    });
    return;
  }

  if (req.method === 'POST' && pathname === '/api/chat') {
    if (!resolveAiConfig()) {
      sendJson(res, 500, { error: 'Nenhuma credencial de IA configurada no servidor.' });
      return;
    }

    const body = await parseJsonBody(req);
    const message = typeof body.message === 'string' ? body.message.trim() : '';
    const history = normalizeHistory(body.history);
    const promptHistory = buildPromptHistory(body.history);

    if (!message) {
      sendJson(res, 400, { error: 'Mensagem vazia.' });
      return;
    }

    const knowledgeBase = await getKnowledgeBase();
    const kbText = knowledgeBase.value.trim();

    if (!kbText) {
      sendJson(res, 503, {
        error: 'A base de conhecimento ainda nao foi configurada pelo administrador.',
      });
      return;
    }

    const chunks = await getKnowledgeBaseChunks();
    const selectedKnowledge = selectRelevantKnowledgeChunks(chunks, message, history);

    if (selectedKnowledge.selectedChunks.length === 0) {
      sendJson(res, 200, { reply: NO_INFO_REPLY });
      return;
    }

    const reply = await requestAiCompletion([
      buildSystemPrompt(selectedKnowledge.contextText),
      ...promptHistory,
      { role: 'user', content: message },
    ]);

    sendJson(res, 200, { reply });
    return;
  }

  if (req.method === 'GET' && pathname === '/api/health') {
    sendJson(res, 200, {
      ok: true,
      env: {
        DATABASE_URL: Boolean(process.env.DATABASE_URL),
        ADMIN_PASSWORD: Boolean(process.env.ADMIN_PASSWORD),
        SESSION_SECRET: Boolean(process.env.SESSION_SECRET),
        GROQ_API_KEY: Boolean(process.env.GROQ_API_KEY),
        AI_GATEWAY_API_KEY: Boolean(process.env.AI_GATEWAY_API_KEY),
      },
      aiProvider: resolveAiConfig()?.baseUrl || null,
    });
    return;
  }

  if (req.method === 'GET' && pathname === '/api/db-health') {
    await ensureSchema();
    sendJson(res, 200, {
      ok: true,
      aiProvider: resolveAiConfig()?.baseUrl || null,
    });
    return;
  }

  res.statusCode = 404;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify({ error: 'Nao encontrado.' }));
}

async function start() {
  await ensureSchema();

  const server = http.createServer((req, res) => {
    handleRequest(req, res).catch((error) => {
      console.error(error);
      sendJson(res, 500, {
        error: error.message || 'Erro interno do servidor.',
      });
    });
  });

  server.listen(PORT, () => {
    console.log(`Servidor online em http://localhost:${PORT}`);
  });
}

start().catch((error) => {
  console.error('Falha ao iniciar o servidor:', error);
  process.exit(1);
});
