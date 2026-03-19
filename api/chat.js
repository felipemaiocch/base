const { getKnowledgeBase, getKnowledgeBaseChunks } = require('../lib/db');
const { normalizeHistory, buildPromptHistory, buildSystemPrompt, requestAiCompletion, resolveAiConfig } = require('../lib/chat');
const { NO_INFO_REPLY } = require('../lib/knowledge-base');
const { selectRelevantKnowledgeChunks } = require('../lib/retrieval');
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
    const selectedKnowledge = await selectRelevantKnowledgeChunks(chunks, message, history);

    if (selectedKnowledge.selectedChunks.length === 0) {
      sendJson(res, 200, { reply: NO_INFO_REPLY });
      return;
    }

    const reply = await requestAiCompletion([
      buildSystemPrompt(selectedKnowledge.contextText),
      ...promptHistory,
      { role: 'user', content: message },
    ]);

    sendJson(res, 200, {
      reply,
      retrievalMode: selectedKnowledge.retrievalMode || 'lexical',
    });
  } catch (error) {
    console.error(error);
    sendJson(res, 500, { error: error.message || 'Erro interno do servidor.' });
  }
};
