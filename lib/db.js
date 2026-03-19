const { neon } = require('@neondatabase/serverless');

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

  const result = await getSql().query(
    `
      SELECT value, updated_at
      FROM app_settings
      WHERE key = 'knowledge_base'
    `
  );

  if (result.length === 0) {
    return {
      value: '',
      updated_at: null,
    };
  }

  return result[0];
}

async function saveKnowledgeBase(content) {
  await ensureSchema();

  const result = await getSql()`
      INSERT INTO app_settings (key, value, updated_at)
      VALUES ('knowledge_base', ${content}, NOW())
      ON CONFLICT (key)
      DO UPDATE SET
        value = ${content},
        updated_at = NOW()
      RETURNING updated_at
    `;

  return result[0];
}

module.exports = {
  ensureSchema,
  getKnowledgeBase,
  saveKnowledgeBase,
};
