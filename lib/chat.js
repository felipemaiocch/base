const { DEFAULT_AI_GATEWAY_MODEL, DEFAULT_GROQ_MODEL } = require('./config');

function normalizeHistory(history) {
  if (!Array.isArray(history)) {
    return [];
  }

  return history
    .filter((item) => item && (item.role === 'user' || item.role === 'assistant'))
    .map((item) => ({
      role: item.role,
      content: typeof item.content === 'string' ? item.content.trim() : '',
    }))
    .filter((item) => item.content)
    .slice(-6);
}

function buildPromptHistory(history) {
  return normalizeHistory(history)
    .filter((item) => item.role === 'user')
    .slice(-3);
}

function buildSystemPrompt(kbContext) {
  return {
    role: 'system',
    content: `Voce e um assistente virtual interno da empresa, criado para ajudar colaboradores.
Seu objetivo e auxiliar no Atendimento ao Cliente (SAC), tirar duvidas operacionais e fornecer argumentos de vendas.

REGRAS ESTABELECIDAS:
1. Responda de forma clara, prestativa e profissional. Use formatacao leve como listas e negrito quando ajudar.
2. Baseie suas respostas estrita e exclusivamente nos trechos da base de conhecimento abaixo.
3. Se a duvida nao puder ser respondida usando a base, responda exatamente: "Desculpe, nao tenho essa informacao na minha base de conhecimento. Por favor, consulte o seu supervisor ou gestor da area."
4. Nao invente informacoes. Alucinacao e proibida.
5. Mantenha o foco em ajudar o colaborador a resolver o problema do cliente ou fechar a venda.
6. Considere que os trechos abaixo ja foram filtrados para a pergunta atual. Nao use conhecimento externo.
7. Nunca diga para o usuario procurar em bloco, secao, pagina ou item. Extraia o conteudo e entregue a resposta diretamente.
8. Se uma resposta anterior do assistente entrar em conflito com os trechos atuais, ignore a resposta anterior e use apenas os trechos atuais.

--- TRECHOS RELEVANTES DA BASE ---
${kbContext}`,
  };
}

function resolveAiConfig() {
  if (process.env.AI_GATEWAY_API_KEY) {
    return {
      baseUrl: process.env.AI_GATEWAY_BASE_URL || 'https://ai-gateway.vercel.sh/v1',
      apiKey: process.env.AI_GATEWAY_API_KEY,
      model: process.env.AI_GATEWAY_MODEL || DEFAULT_AI_GATEWAY_MODEL,
    };
  }

  if (process.env.GROQ_API_KEY) {
    return {
      baseUrl: process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1',
      apiKey: process.env.GROQ_API_KEY,
      model: process.env.GROQ_MODEL || DEFAULT_GROQ_MODEL,
    };
  }

  return null;
}

async function requestAiCompletion(messages) {
  const config = resolveAiConfig();

  if (!config) {
    throw new Error('Nenhuma credencial de IA configurada.');
  }

  const response = await fetch(`${config.baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      temperature: 0.3,
      max_tokens: 1024,
    }),
  });

  if (!response.ok) {
    let message = 'Erro ao consultar a IA.';

    try {
      const errorData = await response.json();
      message = errorData.error?.message || message;
    } catch {
      message = response.statusText || message;
    }

    throw new Error(message);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content?.trim() || 'Nao houve resposta da IA.';
}

module.exports = {
  normalizeHistory,
  buildPromptHistory,
  buildSystemPrompt,
  resolveAiConfig,
  requestAiCompletion,
};
