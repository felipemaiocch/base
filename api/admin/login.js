const { parseJsonBody, sendJson, methodNotAllowed } = require('../../lib/http');
const { safeEqual, createSessionToken, buildSessionCookie } = require('../../lib/session');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    methodNotAllowed(res, 'POST');
    return;
  }

  try {
    const body = await parseJsonBody(req);
    const password = typeof body.password === 'string' ? body.password : '';

    if (!password) {
      sendJson(res, 400, { error: 'Informe a senha do painel.' });
      return;
    }

    if (!safeEqual(password, process.env.ADMIN_PASSWORD || '')) {
      sendJson(res, 401, { error: 'Senha invalida.' });
      return;
    }

    res.setHeader('Set-Cookie', buildSessionCookie(createSessionToken()));
    sendJson(res, 200, { ok: true });
  } catch (error) {
    console.error(error);
    sendJson(res, 500, { error: error.message || 'Erro interno do servidor.' });
  }
};
