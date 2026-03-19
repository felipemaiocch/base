# Assistente Corporativo

Chat publico com base de conhecimento privada no Neon e painel admin separado.

## Fluxo

- `http://localhost:3000/` abre o chat publico.
- `http://localhost:3000/admin/login` abre a area administrativa.
- A base de conhecimento fica no Neon.
- A chave da IA fica no backend.
- O deploy na Vercel usa paginas estaticas + funcoes em `api/`.
- O servidor local de desenvolvimento roda por `dev-server.js`.
- `https://seu-dominio/api/health` valida as envs e a funcao.
- `https://seu-dominio/api/db-health` valida a conexao com o Neon.

## Comandos

```bash
npm install
npm run bootstrap
```

O comando `bootstrap` gera ou atualiza o `.env` sem apagar credenciais ja existentes e depois sobe o servidor local.

## Variaveis de ambiente

- `DATABASE_URL`
- `ADMIN_PASSWORD`
- `SESSION_SECRET`
- `GROQ_API_KEY` ou `AI_GATEWAY_API_KEY`
- `GROQ_MODEL` ou `AI_GATEWAY_MODEL`
