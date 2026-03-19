const {
  DEFAULT_AI_GATEWAY_EMBEDDING_MODEL,
  DEFAULT_EMBEDDING_BATCH_SIZE,
  DEFAULT_EMBEDDING_DIMENSIONS,
  DEFAULT_OPENAI_EMBEDDING_MODEL,
} = require('./config');

function parsePositiveInt(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function resolveEmbeddingConfig() {
  const dimensions = parsePositiveInt(process.env.EMBEDDING_DIMENSIONS, DEFAULT_EMBEDDING_DIMENSIONS);
  const batchSize = parsePositiveInt(process.env.EMBEDDING_BATCH_SIZE, DEFAULT_EMBEDDING_BATCH_SIZE);

  if (process.env.OPENAI_API_KEY) {
    return {
      provider: 'openai',
      baseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
      apiKey: process.env.OPENAI_API_KEY,
      model: process.env.OPENAI_EMBEDDING_MODEL || DEFAULT_OPENAI_EMBEDDING_MODEL,
      dimensions,
      batchSize,
    };
  }

  if (process.env.AI_GATEWAY_API_KEY) {
    return {
      provider: 'ai_gateway',
      baseUrl: process.env.AI_GATEWAY_BASE_URL || 'https://ai-gateway.vercel.sh/v1',
      apiKey: process.env.AI_GATEWAY_API_KEY,
      model: process.env.AI_EMBEDDING_MODEL || DEFAULT_AI_GATEWAY_EMBEDDING_MODEL,
      dimensions,
      batchSize,
    };
  }

  return null;
}

function buildEmbeddingSignature(config) {
  if (!config) {
    return 'disabled';
  }

  return `emb:v1:${config.provider}:${config.model}:${config.dimensions}`;
}

async function requestEmbeddings(inputs) {
  const config = resolveEmbeddingConfig();
  if (!config) {
    throw new Error('Nenhuma credencial de embeddings configurada.');
  }

  const normalizedInputs = Array.isArray(inputs)
    ? inputs.map((item) => (typeof item === 'string' ? item.trim() : '')).filter(Boolean)
    : [];

  if (normalizedInputs.length === 0) {
    return [];
  }

  const response = await fetch(`${config.baseUrl.replace(/\/$/, '')}/embeddings`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model,
      input: normalizedInputs,
      encoding_format: 'float',
      dimensions: config.dimensions,
    }),
  });

  if (!response.ok) {
    let message = 'Erro ao gerar embeddings.';

    try {
      const data = await response.json();
      message = data.error?.message || message;
    } catch {
      message = response.statusText || message;
    }

    throw new Error(message);
  }

  const data = await response.json();
  return (data.data || [])
    .slice()
    .sort((left, right) => left.index - right.index)
    .map((item) => item.embedding || []);
}

async function requestEmbedding(input) {
  const [embedding] = await requestEmbeddings([input]);
  return embedding || [];
}

async function requestEmbeddingsInBatches(inputs) {
  const config = resolveEmbeddingConfig();
  if (!config) {
    throw new Error('Nenhuma credencial de embeddings configurada.');
  }

  const batchSize = Math.max(1, config.batchSize);
  const results = [];

  for (let index = 0; index < inputs.length; index += batchSize) {
    const batch = inputs.slice(index, index + batchSize);
    const embeddings = await requestEmbeddings(batch);
    results.push(...embeddings);
  }

  return results;
}

function parseEmbedding(value) {
  if (!value) {
    return null;
  }

  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return Array.isArray(parsed) ? parsed.map(Number) : null;
  } catch {
    return null;
  }
}

function serializeEmbedding(embedding) {
  if (!Array.isArray(embedding) || embedding.length === 0) {
    return null;
  }

  return JSON.stringify(embedding);
}

function cosineSimilarity(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length === 0 || right.length === 0 || left.length !== right.length) {
    return 0;
  }

  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;

  for (let index = 0; index < left.length; index += 1) {
    const leftValue = Number(left[index]) || 0;
    const rightValue = Number(right[index]) || 0;

    dot += leftValue * rightValue;
    leftNorm += leftValue * leftValue;
    rightNorm += rightValue * rightValue;
  }

  if (leftNorm === 0 || rightNorm === 0) {
    return 0;
  }

  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}

module.exports = {
  buildEmbeddingSignature,
  cosineSimilarity,
  parseEmbedding,
  requestEmbedding,
  requestEmbeddingsInBatches,
  resolveEmbeddingConfig,
  serializeEmbedding,
};
