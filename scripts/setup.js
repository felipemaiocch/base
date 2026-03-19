const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const projectRoot = path.join(__dirname, '..');
const envPath = path.join(projectRoot, '.env');

function randomSecret(size) {
  return crypto.randomBytes(size).toString('base64url');
}

function parseEnvFile(content) {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .reduce((acc, line) => {
      const separatorIndex = line.indexOf('=');
      if (separatorIndex === -1) {
        return acc;
      }

      const key = line.slice(0, separatorIndex).trim();
      let value = line.slice(separatorIndex + 1).trim();

      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      acc[key] = value;
      return acc;
    }, {});
}

function readExistingEnv() {
  if (!fs.existsSync(envPath)) {
    return {};
  }

  return parseEnvFile(fs.readFileSync(envPath, 'utf8'));
}

function buildEnvContent(config) {
  const orderedKeys = [
    'PORT',
    'DATABASE_URL',
    'GROQ_API_KEY',
    'AI_GATEWAY_API_KEY',
    'AI_GATEWAY_MODEL',
    'AI_EMBEDDING_MODEL',
    'OPENAI_API_KEY',
    'OPENAI_EMBEDDING_MODEL',
    'EMBEDDING_DIMENSIONS',
    'EMBEDDING_BATCH_SIZE',
    'ADMIN_PASSWORD',
    'SESSION_SECRET',
    'GROQ_MODEL',
  ];

  return `${orderedKeys
    .map((key) => `${key}=${JSON.stringify(config[key] || '')}`)
    .join('\n')}\n`;
}

function main() {
  const existing = readExistingEnv();

  const config = {
    PORT: existing.PORT || process.env.PORT || '3000',
    DATABASE_URL: existing.DATABASE_URL || process.env.DATABASE_URL || '',
    GROQ_API_KEY: existing.GROQ_API_KEY || process.env.GROQ_API_KEY || '',
    AI_GATEWAY_API_KEY: existing.AI_GATEWAY_API_KEY || process.env.AI_GATEWAY_API_KEY || '',
    AI_GATEWAY_MODEL:
      existing.AI_GATEWAY_MODEL ||
      process.env.AI_GATEWAY_MODEL ||
      'groq/llama-3.3-70b-versatile',
    AI_EMBEDDING_MODEL:
      existing.AI_EMBEDDING_MODEL ||
      process.env.AI_EMBEDDING_MODEL ||
      'openai/text-embedding-3-small',
    OPENAI_API_KEY: existing.OPENAI_API_KEY || process.env.OPENAI_API_KEY || '',
    OPENAI_EMBEDDING_MODEL:
      existing.OPENAI_EMBEDDING_MODEL ||
      process.env.OPENAI_EMBEDDING_MODEL ||
      'text-embedding-3-small',
    EMBEDDING_DIMENSIONS:
      existing.EMBEDDING_DIMENSIONS ||
      process.env.EMBEDDING_DIMENSIONS ||
      '1536',
    EMBEDDING_BATCH_SIZE:
      existing.EMBEDDING_BATCH_SIZE ||
      process.env.EMBEDDING_BATCH_SIZE ||
      '32',
    ADMIN_PASSWORD: existing.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD || randomSecret(18),
    SESSION_SECRET: existing.SESSION_SECRET || process.env.SESSION_SECRET || randomSecret(32),
    GROQ_MODEL: existing.GROQ_MODEL || process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
  };

  fs.writeFileSync(envPath, buildEnvContent(config), 'utf8');

  const missing = [];
  if (!config.DATABASE_URL) {
    missing.push('DATABASE_URL');
  }
  if (!config.GROQ_API_KEY && !config.AI_GATEWAY_API_KEY) {
    missing.push('GROQ_API_KEY ou AI_GATEWAY_API_KEY');
  }

  console.log('Arquivo .env preparado em', envPath);
  console.log('ADMIN_PASSWORD:', config.ADMIN_PASSWORD);

  if (missing.length > 0) {
    console.log(`Ainda faltam configurar: ${missing.join(', ')}`);
  } else {
    console.log('Configuracao minima pronta para subir o servidor.');
  }
}

main();
