const { ensureSchema, getKnowledgeBase } = require('../lib/db');
const { resolveAiConfig } = require('../lib/chat');
const { resolveEmbeddingConfig } = require('../lib/embeddings');
const { sendJson, methodNotAllowed } = require('../lib/http');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    methodNotAllowed(res, 'GET');
    return;
  }

  try {
    await ensureSchema();
    const knowledgeBase = await getKnowledgeBase();

    sendJson(res, 200, {
      ok: true,
      aiProvider: resolveAiConfig()?.baseUrl || null,
      embeddingProvider: resolveEmbeddingConfig()?.provider || null,
      retrieval: knowledgeBase.retrieval,
    });
  } catch (error) {
    console.error(error);
    sendJson(res, 500, {
      ok: false,
      aiProvider: resolveAiConfig()?.baseUrl || null,
      embeddingProvider: resolveEmbeddingConfig()?.provider || null,
      error: error.message || 'Erro interno do servidor.',
    });
  }
};
