const { getKnowledgeBase, saveKnowledgeBase } = require('../../lib/db');
const { parseJsonBody, sendJson, methodNotAllowed } = require('../../lib/http');
const { isAdminAuthenticated } = require('../../lib/session');

module.exports = async (req, res) => {
  if (!isAdminAuthenticated(req)) {
    sendJson(res, 401, { error: 'Nao autorizado.' });
    return;
  }

  try {
    if (req.method === 'GET') {
      const knowledgeBase = await getKnowledgeBase();
      sendJson(res, 200, {
        content: knowledgeBase.value,
        updatedAt: knowledgeBase.updated_at,
        chunkCount: knowledgeBase.chunk_count,
      });
      return;
    }

    if (req.method === 'PUT') {
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

    methodNotAllowed(res, ['GET', 'PUT']);
  } catch (error) {
    console.error(error);
    sendJson(res, 500, { error: error.message || 'Erro interno do servidor.' });
  }
};
