const { neon } = require('@neondatabase/serverless');
const { createKnowledgeBaseChunks } = require('./knowledge-base');

let schemaPromise;

function getSql() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL nao configurada.');
  }

  if (!global.__assistenteSql) {
    global.__assistenteSql = neon(process.env.DATABASE_URL);
  }

  return global.__assistenteSql;
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
    })();
  }

  return schemaPromise;
}

async function getKnowledgeBase() {
  await ensureSchema();

  const [knowledgeBase, chunkCountRow] = await Promise.all([
    getSql().query(
      `
        SELECT value, updated_at
        FROM app_settings
        WHERE key = 'knowledge_base'
      `
    ),
    getSql().query(
      `
        SELECT COUNT(*)::INTEGER AS chunk_count
        FROM knowledge_base_chunks
      `
    ),
  ]);

  if (knowledgeBase.length === 0) {
    return {
      value: '',
      updated_at: null,
      chunk_count: Number(chunkCountRow[0]?.chunk_count || 0),
    };
  }

  return {
    ...knowledgeBase[0],
    chunk_count: Number(chunkCountRow[0]?.chunk_count || 0),
  };
}

async function getKnowledgeBaseChunks() {
  await ensureSchema();

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

async function saveKnowledgeBase(content) {
  await ensureSchema();
  const sql = getSql();
  const chunks = createKnowledgeBaseChunks(content);

  const result = await sql`
      INSERT INTO app_settings (key, value, updated_at)
      VALUES ('knowledge_base', ${content}, NOW())
      ON CONFLICT (key)
      DO UPDATE SET
        value = ${content},
        updated_at = NOW()
      RETURNING updated_at
    `;

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

  return {
    ...result[0],
    chunk_count: chunks.length,
  };
}

module.exports = {
  ensureSchema,
  getKnowledgeBase,
  getKnowledgeBaseChunks,
  saveKnowledgeBase,
};
