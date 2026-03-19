const { sendJson, methodNotAllowed } = require('../../lib/http');
const { buildExpiredSessionCookie } = require('../../lib/session');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    methodNotAllowed(res, 'POST');
    return;
  }

  res.setHeader('Set-Cookie', buildExpiredSessionCookie());
  sendJson(res, 200, { ok: true });
};
