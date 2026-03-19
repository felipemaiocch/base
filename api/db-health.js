const { ensureSchema } = require('../lib/db');
const { resolveAiConfig } = require('../lib/chat');
const { sendJson, methodNotAllowed } = require('../lib/http');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    methodNotAllowed(res, 'GET');
    return;
  }

  try {
    await ensureSchema();

    sendJson(res, 200, {
      ok: true,
      aiProvider: resolveAiConfig()?.baseUrl || null,
    });
  } catch (error) {
    console.error(error);
    sendJson(res, 500, {
      ok: false,
      aiProvider: resolveAiConfig()?.baseUrl || null,
      error: error.message || 'Erro interno do servidor.',
    });
  }
};
