const path = require('path');

const express = require('express');
require('dotenv').config();

const { ensureSchema, getKnowledgeBase, saveKnowledgeBase } = require('./lib/db');
const { buildSystemPrompt, normalizeHistory, requestAiCompletion, resolveAiConfig } = require('./lib/chat');
const {
  safeEqual,
  createSessionToken,
  buildSessionCookie,
  buildExpiredSessionCookie,
  isAdminAuthenticated,
} = require('./lib/session');

const app = express();
const PORT = Number(process.env.PORT || 3000);

app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));

function requireAdminPage(req, res, next) {
  if (!isAdminAuthenticated(req)) {
    res.redirect('/admin/login');
    return;
  }

  next();
}

function requireAdminApi(req, res, next) {
  if (!isAdminAuthenticated(req)) {
    res.status(401).json({ error: 'Nao autorizado.' });
    return;
  }

  next();
}

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/admin/login', (req, res) => {
  if (isAdminAuthenticated(req)) {
    res.redirect('/admin');
    return;
  }

  res.sendFile(path.join(__dirname, 'admin', 'login', 'index.html'));
});

app.get('/admin', requireAdminPage, (req, res) => {
  res.sendFile(path.join(__dirname, 'admin', 'index.html'));
});

app.post('/api/admin/login', (req, res) => {
  const password = typeof req.body?.password === 'string' ? req.body.password : '';

  if (!password) {
    res.status(400).json({ error: 'Informe a senha do painel.' });
    return;
  }

  if (!safeEqual(password, process.env.ADMIN_PASSWORD || '')) {
    res.status(401).json({ error: 'Senha invalida.' });
    return;
  }

  res.setHeader('Set-Cookie', buildSessionCookie(createSessionToken()));
  res.json({ ok: true });
});

app.post('/api/admin/logout', (req, res) => {
  res.setHeader('Set-Cookie', buildExpiredSessionCookie());
  res.json({ ok: true });
});

app.get('/api/admin/knowledge-base', requireAdminApi, async (req, res, next) => {
  try {
    const knowledgeBase = await getKnowledgeBase();
    res.json({
      content: knowledgeBase.value,
      updatedAt: knowledgeBase.updated_at,
    });
  } catch (error) {
    next(error);
  }
});

app.put('/api/admin/knowledge-base', requireAdminApi, async (req, res, next) => {
  try {
    const content = typeof req.body?.content === 'string' ? req.body.content.trim() : '';

    await saveKnowledgeBase(content);
    const knowledgeBase = await getKnowledgeBase();

    res.json({
      ok: true,
      updatedAt: knowledgeBase.updated_at,
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/chat', async (req, res, next) => {
  try {
    if (!resolveAiConfig()) {
      res.status(500).json({ error: 'Nenhuma credencial de IA configurada no servidor.' });
      return;
    }

    const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
    const history = normalizeHistory(req.body?.history);

    if (!message) {
      res.status(400).json({ error: 'Mensagem vazia.' });
      return;
    }

    const knowledgeBase = await getKnowledgeBase();
    const kbText = knowledgeBase.value.trim();

    if (!kbText) {
      res.status(503).json({
        error: 'A base de conhecimento ainda nao foi configurada pelo administrador.',
      });
      return;
    }

    const reply = await requestAiCompletion([
      buildSystemPrompt(kbText),
      ...history,
      { role: 'user', content: message },
    ]);

    res.json({ reply });
  } catch (error) {
    next(error);
  }
});

app.get('/api/health', async (req, res, next) => {
  res.json({
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
});

app.get('/api/db-health', async (req, res, next) => {
  try {
    await ensureSchema();

    res.json({
      ok: true,
      aiProvider: resolveAiConfig()?.baseUrl || null,
    });
  } catch (error) {
    next(error);
  }
});

app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).json({
    error: error.message || 'Erro interno do servidor.',
  });
});

async function start() {
  await ensureSchema();

  app.listen(PORT, () => {
    console.log(`Servidor online em http://localhost:${PORT}`);
  });
}

start().catch((error) => {
  console.error('Falha ao iniciar o servidor:', error);
  process.exit(1);
});
