const { neon } = require('@neondatabase/serverless');
const { createKnowledgeBaseChunks } = require('./knowledge-base');
const {
  buildEmbeddingSignature,
  parseEmbedding,
  requestEmbeddingsInBatches,
  resolveEmbeddingConfig,
  serializeEmbedding,
} = require('./embeddings');

let schemaPromise;
const KNOWLEDGE_BASE_CHUNK_VERSION = '2';

function getSql() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL nao configurada.');
  }

  if (!global.__assistenteSql) {
    global.__assistenteSql = neon(process.env.DATABASE_URL);
  }

  return global.__assistenteSql;
}

async function queryKnowledgeBaseSetting() {
  return getSql().query(
    `
      SELECT value, updated_at
      FROM app_settings
      WHERE key = 'knowledge_base'
    `
  );
}

async function queryKnowledgeBaseChunkCount() {
  const result = await getSql().query(
    `
      SELECT COUNT(*)::INTEGER AS chunk_count
      FROM knowledge_base_chunks
    `
  );

  return Number(result[0]?.chunk_count || 0);
}

async function queryKnowledgeBaseEmbeddedChunkCount() {
  const result = await getSql().query(
    `
      SELECT COUNT(*)::INTEGER AS embedded_chunk_count
      FROM knowledge_base_chunks
      WHERE embedding_text IS NOT NULL
        AND embedding_text <> ''
    `
  );

  return Number(result[0]?.embedded_chunk_count || 0);
}

async function queryKnowledgeBaseChunkVersion() {
  const result = await getSql().query(`
      SELECT value
      FROM app_settings
      WHERE key = 'knowledge_base_chunk_version'
    `);

  return result[0]?.value || '0';
}

async function queryKnowledgeBaseEmbeddingSignature() {
  const result = await getSql().query(`
      SELECT value
      FROM app_settings
      WHERE key = 'knowledge_base_embedding_signature'
    `);

  return result[0]?.value || 'disabled';
}

async function queryKnowledgeBaseChunks() {
  const result = await getSql().query(
    `
      SELECT chunk_index, section_title, content, searchable_text, embedding_text, embedding_model
      FROM knowledge_base_chunks
      ORDER BY chunk_index ASC
    `
  );

  return result.map((chunk) => ({
    ...chunk,
    chunk_index: Number(chunk.chunk_index || 0),
    embedding: parseEmbedding(chunk.embedding_text),
  }));
}

async function replaceKnowledgeBaseChunks(content) {
  const sql = getSql();
  const chunks = createKnowledgeBaseChunks(content);
  const embeddingConfig = resolveEmbeddingConfig();
  const desiredEmbeddingSignature = buildEmbeddingSignature(embeddingConfig);
  let embeddings = [];
  let persistedEmbeddingSignature = 'disabled';

  if (embeddingConfig && chunks.length > 0) {
    try {
      embeddings = await requestEmbeddingsInBatches(
        chunks.map((chunk) => `${chunk.sectionTitle}\n\n${chunk.content}`)
      );
      persistedEmbeddingSignature = desiredEmbeddingSignature;
    } catch (error) {
      console.error('Falha ao gerar embeddings da base:', error);
      persistedEmbeddingSignature = `failed:${desiredEmbeddingSignature}`;
      embeddings = [];
    }
  }

  await sql.query(`
    DELETE FROM knowledge_base_chunks
  `);

  for (const chunk of chunks) {
    await sql`
      INSERT INTO knowledge_base_chunks (
        chunk_index,
        section_title,
        content,
        searchable_text,
        embedding_text,
        embedding_model,
        updated_at
      )
      VALUES (
        ${chunk.chunkIndex},
        ${chunk.sectionTitle},
        ${chunk.content},
        ${chunk.searchableText},
        ${serializeEmbedding(embeddings[chunk.chunkIndex])},
        ${embeddings[chunk.chunkIndex] ? embeddingConfig?.model || null : null},
        NOW()
      )
    `;
  }

  await sql`
    INSERT INTO app_settings (key, value, updated_at)
    VALUES ('knowledge_base_chunk_version', ${KNOWLEDGE_BASE_CHUNK_VERSION}, NOW())
    ON CONFLICT (key)
    DO UPDATE SET
      value = ${KNOWLEDGE_BASE_CHUNK_VERSION},
      updated_at = NOW()
  `;

  await sql`
    INSERT INTO app_settings (key, value, updated_at)
    VALUES ('knowledge_base_embedding_signature', ${persistedEmbeddingSignature}, NOW())
    ON CONFLICT (key)
    DO UPDATE SET
      value = ${persistedEmbeddingSignature},
      updated_at = NOW()
  `;

  return {
    chunkCount: chunks.length,
    embeddedChunkCount: embeddings.filter((item) => Array.isArray(item) && item.length > 0).length,
    embeddingSignature: persistedEmbeddingSignature,
  };
}

function buildRetrievalStatus({
  chunkCount,
  embeddedChunkCount,
  currentEmbeddingSignature,
}) {
  const embeddingConfig = resolveEmbeddingConfig();
  const desiredEmbeddingSignature = buildEmbeddingSignature(embeddingConfig);
  const configured = Boolean(embeddingConfig);

  if (!configured) {
    return {
      mode: 'lexical',
      label: 'Busca lexical',
      configured: false,
      provider: null,
      model: null,
      chunkCount,
      embeddedChunkCount,
      currentEmbeddingSignature,
      desiredEmbeddingSignature,
      message: 'Embeddings nao estao configurados. O chat usa busca por texto com fallback seguro.',
    };
  }

  if (
    desiredEmbeddingSignature !== 'disabled' &&
    currentEmbeddingSignature === desiredEmbeddingSignature &&
    embeddedChunkCount > 0
  ) {
    return {
      mode: 'embedding_hybrid',
      label: 'Busca hibrida com embeddings',
      configured: true,
      provider: embeddingConfig.provider,
      model: embeddingConfig.model,
      chunkCount,
      embeddedChunkCount,
      currentEmbeddingSignature,
      desiredEmbeddingSignature,
      message: `Embeddings ativos em ${embeddedChunkCount} de ${chunkCount} blocos.`,
    };
  }

  if (currentEmbeddingSignature === `failed:${desiredEmbeddingSignature}`) {
    return {
      mode: 'lexical',
      label: 'Busca lexical',
      configured: true,
      provider: embeddingConfig.provider,
      model: embeddingConfig.model,
      chunkCount,
      embeddedChunkCount,
      currentEmbeddingSignature,
      desiredEmbeddingSignature,
      message: 'A geracao de embeddings falhou. Corrija a chave ou billing e salve a base novamente para reindexar.',
    };
  }

  return {
    mode: 'lexical',
    label: 'Busca lexical',
    configured: true,
    provider: embeddingConfig.provider,
    model: embeddingConfig.model,
    chunkCount,
    embeddedChunkCount,
    currentEmbeddingSignature,
    desiredEmbeddingSignature,
    message: 'Embeddings configurados, mas ainda nao ativos nesta base. Salve a base para indexar os vetores.',
  };
}

async function ensureSchema() {
  if (!schemaPromise) {
    schemaPromise = (async () => {
      const sql = getSql();

      await sql.query(`
        CREATE TABLE IF NOT EXISTS app_settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL DEFAULT '',
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      await sql.query(`
        CREATE TABLE IF NOT EXISTS knowledge_base_chunks (
          id BIGSERIAL PRIMARY KEY,
          chunk_index INTEGER NOT NULL,
          section_title TEXT NOT NULL DEFAULT '',
          content TEXT NOT NULL,
          searchable_text TEXT NOT NULL,
          embedding_text TEXT,
          embedding_model TEXT,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      await sql.query(`
        ALTER TABLE knowledge_base_chunks
        ADD COLUMN IF NOT EXISTS embedding_text TEXT
      `);

      await sql.query(`
        ALTER TABLE knowledge_base_chunks
        ADD COLUMN IF NOT EXISTS embedding_model TEXT
      `);

      await sql.query(`
        CREATE INDEX IF NOT EXISTS knowledge_base_chunks_chunk_index_idx
        ON knowledge_base_chunks (chunk_index)
      `);

      await sql.query(
        `
          INSERT INTO app_settings (key, value)
          VALUES ('knowledge_base', '')
          ON CONFLICT (key) DO NOTHING
        `
      );

      await sql.query(
        `
          INSERT INTO app_settings (key, value)
          VALUES ('knowledge_base_chunk_version', '0')
          ON CONFLICT (key) DO NOTHING
        `
      );

      await sql.query(
        `
          INSERT INTO app_settings (key, value)
          VALUES ('knowledge_base_embedding_signature', 'disabled')
          ON CONFLICT (key) DO NOTHING
        `
      );
    })();
  }

  return schemaPromise;
}

async function getKnowledgeBase() {
  await ensureSchema();

  const [knowledgeBase, currentChunkCount, currentChunkVersion, initialEmbeddingSignature, initialEmbeddedChunkCount] = await Promise.all([
    queryKnowledgeBaseSetting(),
    queryKnowledgeBaseChunkCount(),
    queryKnowledgeBaseChunkVersion(),
    queryKnowledgeBaseEmbeddingSignature(),
    queryKnowledgeBaseEmbeddedChunkCount(),
  ]);

  const rawValue = knowledgeBase[0]?.value || '';
  const updatedAt = knowledgeBase[0]?.updated_at || null;
  let chunkCount = currentChunkCount;
  let embeddedChunkCount = initialEmbeddedChunkCount;
  let currentEmbeddingSignature = initialEmbeddingSignature;
  const desiredEmbeddingSignature = buildEmbeddingSignature(resolveEmbeddingConfig());
  const shouldRefreshEmbeddings =
    desiredEmbeddingSignature !== 'disabled' &&
    currentEmbeddingSignature !== desiredEmbeddingSignature &&
    currentEmbeddingSignature !== `failed:${desiredEmbeddingSignature}`;

  if (rawValue.trim() && (chunkCount === 0 || currentChunkVersion !== KNOWLEDGE_BASE_CHUNK_VERSION || shouldRefreshEmbeddings)) {
    const replacement = await replaceKnowledgeBaseChunks(rawValue);
    chunkCount = replacement.chunkCount;
    embeddedChunkCount = replacement.embeddedChunkCount;
    currentEmbeddingSignature = replacement.embeddingSignature;
  }

  if (knowledgeBase.length === 0) {
    return {
      value: '',
      updated_at: null,
      chunk_count: chunkCount,
      retrieval: buildRetrievalStatus({
        chunkCount,
        embeddedChunkCount,
        currentEmbeddingSignature,
      }),
    };
  }

  return {
    value: rawValue,
    updated_at: updatedAt,
    chunk_count: chunkCount,
    retrieval: buildRetrievalStatus({
      chunkCount,
      embeddedChunkCount,
      currentEmbeddingSignature,
    }),
  };
}

async function getKnowledgeBaseChunks() {
  await ensureSchema();

  let [result, currentChunkVersion, currentEmbeddingSignature] = await Promise.all([
    queryKnowledgeBaseChunks(),
    queryKnowledgeBaseChunkVersion(),
    queryKnowledgeBaseEmbeddingSignature(),
  ]);
  const desiredEmbeddingSignature = buildEmbeddingSignature(resolveEmbeddingConfig());
  const shouldRefreshEmbeddings =
    desiredEmbeddingSignature !== 'disabled' &&
    currentEmbeddingSignature !== desiredEmbeddingSignature &&
    currentEmbeddingSignature !== `failed:${desiredEmbeddingSignature}`;

  if (result.length === 0 || currentChunkVersion !== KNOWLEDGE_BASE_CHUNK_VERSION || shouldRefreshEmbeddings) {
    const knowledgeBase = await queryKnowledgeBaseSetting();
    const rawValue = knowledgeBase[0]?.value || '';

    if (rawValue.trim()) {
      await replaceKnowledgeBaseChunks(rawValue);
      result = await queryKnowledgeBaseChunks();
    }
  }

  return result;
}

async function saveKnowledgeBase(content) {
  await ensureSchema();
  const sql = getSql();

  const result = await sql`
      INSERT INTO app_settings (key, value, updated_at)
      VALUES ('knowledge_base', ${content}, NOW())
      ON CONFLICT (key)
      DO UPDATE SET
        value = ${content},
        updated_at = NOW()
      RETURNING updated_at
    `;

  const replacement = await replaceKnowledgeBaseChunks(content);

  return {
    ...result[0],
    chunk_count: replacement.chunkCount,
    retrieval: buildRetrievalStatus({
      chunkCount: replacement.chunkCount,
      embeddedChunkCount: replacement.embeddedChunkCount,
      currentEmbeddingSignature: replacement.embeddingSignature,
    }),
  };
}

module.exports = {
  ensureSchema,
  getKnowledgeBase,
  getKnowledgeBaseChunks,
  saveKnowledgeBase,
};
