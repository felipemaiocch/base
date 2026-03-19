const { ensureSchema } = require('../lib/db');
const { resolveAiConfig } = require('../lib/chat');
const { sendJson, methodNotAllowed } = require('../lib/http');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    methodNotAllowed(res, 'GET');
    return;
  }

  const env = {
    DATABASE_URL: Boolean(process.env.DATABASE_URL),
    ADMIN_PASSWORD: Boolean(process.env.ADMIN_PASSWORD),
    SESSION_SECRET: Boolean(process.env.SESSION_SECRET),
    GROQ_API_KEY: Boolean(process.env.GROQ_API_KEY),
    AI_GATEWAY_API_KEY: Boolean(process.env.AI_GATEWAY_API_KEY),
  };

  try {
    await ensureSchema();

    sendJson(res, 200, {
      ok: true,
      env,
      aiProvider: resolveAiConfig()?.baseUrl || null,
    });
  } catch (error) {
    console.error(error);
    sendJson(res, 500, {
      ok: false,
      env,
      aiProvider: resolveAiConfig()?.baseUrl || null,
      error: error.message || 'Erro interno do servidor.',
    });
  }
};
