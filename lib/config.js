const path = require('path');

const ROOT_DIR = path.join(__dirname, '..');
const SESSION_COOKIE = 'admin_session';
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 8;
const DEFAULT_GROQ_MODEL = 'llama-3.3-70b-versatile';
const DEFAULT_AI_GATEWAY_MODEL = 'groq/llama-3.3-70b-versatile';

module.exports = {
  ROOT_DIR,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  DEFAULT_GROQ_MODEL,
  DEFAULT_AI_GATEWAY_MODEL,
};
