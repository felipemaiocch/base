const { neon } = require('@neondatabase/serverless');
const { createKnowledgeBaseChunks } = require('./knowledge-base');

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

async function queryKnowledgeBaseChunkVersion() {
  const result = await getSql().query(
    `
      SELECT value
      FROM app_settings
      WHERE key = 'knowledge_base_chunk_version'
    `
  );

  return result[0]?.value || '0';
}

async function queryKnowledgeBaseChunks() {
  const result = await getSql().query(
    `
      SELECT chunk_index, section_title, content, searchable_text
      FROM knowledge_base_chunks
      ORDER BY chunk_index ASC
    `
  );

  return result.map((chunk) => ({
    ...chunk,
    chunk_index: Number(chunk.chunk_index || 0),
  }));
}

async function replaceKnowledgeBaseChunks(content) {
  const sql = getSql();
  const chunks = createKnowledgeBaseChunks(content);

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
        updated_at
      )
      VALUES (
        ${chunk.chunkIndex},
        ${chunk.sectionTitle},
        ${chunk.content},
        ${chunk.searchableText},
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

  return chunks.length;
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
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
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
    })();
  }

  return schemaPromise;
}

async function getKnowledgeBase() {
  await ensureSchema();

  const [knowledgeBase, currentChunkCount, currentChunkVersion] = await Promise.all([
    queryKnowledgeBaseSetting(),
    queryKnowledgeBaseChunkCount(),
    queryKnowledgeBaseChunkVersion(),
  ]);

  const rawValue = knowledgeBase[0]?.value || '';
  const updatedAt = knowledgeBase[0]?.updated_at || null;
  let chunkCount = currentChunkCount;

  if (rawValue.trim() && (chunkCount === 0 || currentChunkVersion !== KNOWLEDGE_BASE_CHUNK_VERSION)) {
    chunkCount = await replaceKnowledgeBaseChunks(rawValue);
  }

  if (knowledgeBase.length === 0) {
    return {
      value: '',
      updated_at: null,
      chunk_count: chunkCount,
    };
  }

  return {
    value: rawValue,
    updated_at: updatedAt,
    chunk_count: chunkCount,
  };
}

async function getKnowledgeBaseChunks() {
  await ensureSchema();

  let [result, currentChunkVersion] = await Promise.all([
    queryKnowledgeBaseChunks(),
    queryKnowledgeBaseChunkVersion(),
  ]);

  if (result.length === 0 || currentChunkVersion !== KNOWLEDGE_BASE_CHUNK_VERSION) {
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

  const chunkCount = await replaceKnowledgeBaseChunks(content);

  return {
    ...result[0],
    chunk_count: chunkCount,
  };
}

module.exports = {
  ensureSchema,
  getKnowledgeBase,
  getKnowledgeBaseChunks,
  saveKnowledgeBase,
};
