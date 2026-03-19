const { resolveAiConfig } = require('../lib/chat');
const { resolveEmbeddingConfig } = require('../lib/embeddings');
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
    OPENAI_API_KEY: Boolean(process.env.OPENAI_API_KEY),
  };

  sendJson(res, 200, {
    ok: true,
    env,
    aiProvider: resolveAiConfig()?.baseUrl || null,
    embeddingProvider: resolveEmbeddingConfig()?.provider || null,
  });
};
