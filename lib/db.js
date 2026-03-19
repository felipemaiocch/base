const { Pool } = require('pg');

let schemaPromise;

function getPool() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL nao configurada.');
  }

  if (!global.__assistentePool) {
    global.__assistentePool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: {
        rejectUnauthorized: false,
      },
    });
  }

  return global.__assistentePool;
}

async function ensureSchema() {
  if (!schemaPromise) {
    schemaPromise = (async () => {
      const pool = getPool();

      await pool.query(`
        CREATE TABLE IF NOT EXISTS app_settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL DEFAULT '',
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      await pool.query(
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

  const result = await getPool().query(
    `
      SELECT value, updated_at
      FROM app_settings
      WHERE key = 'knowledge_base'
    `
  );

  if (result.rowCount === 0) {
    return {
      value: '',
      updated_at: null,
    };
  }

  return result.rows[0];
}

async function saveKnowledgeBase(content) {
  await ensureSchema();

  const result = await getPool().query(
    `
      INSERT INTO app_settings (key, value, updated_at)
      VALUES ('knowledge_base', $1, NOW())
      ON CONFLICT (key)
      DO UPDATE SET
        value = EXCLUDED.value,
        updated_at = NOW()
      RETURNING updated_at
    `,
    [content]
  );

  return result.rows[0];
}

module.exports = {
  ensureSchema,
  getKnowledgeBase,
  saveKnowledgeBase,
};
