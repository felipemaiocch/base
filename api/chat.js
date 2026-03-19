const { getKnowledgeBase } = require('../lib/db');
const { normalizeHistory, buildSystemPrompt, requestAiCompletion, resolveAiConfig } = require('../lib/chat');
const { parseJsonBody, sendJson, methodNotAllowed } = require('../lib/http');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    methodNotAllowed(res, 'POST');
    return;
  }

  try {
    if (!resolveAiConfig()) {
      sendJson(res, 500, { error: 'Nenhuma credencial de IA configurada no servidor.' });
      return;
    }

    const body = await parseJsonBody(req);
    const message = typeof body.message === 'string' ? body.message.trim() : '';
    const history = normalizeHistory(body.history);

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

    const reply = await requestAiCompletion([
      buildSystemPrompt(kbText),
      ...history,
      { role: 'user', content: message },
    ]);

    sendJson(res, 200, { reply });
  } catch (error) {
    console.error(error);
    sendJson(res, 500, { error: error.message || 'Erro interno do servidor.' });
  }
};
