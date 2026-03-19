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
- `OPENAI_API_KEY` ou `AI_GATEWAY_API_KEY` para embeddings
- `OPENAI_EMBEDDING_MODEL` ou `AI_EMBEDDING_MODEL`
- `EMBEDDING_DIMENSIONS`
- `EMBEDDING_BATCH_SIZE`

## Embeddings

- Sem `OPENAI_API_KEY` ou `AI_GATEWAY_API_KEY` valido para embeddings, o projeto continua em `busca lexical`.
- Com embeddings configurados, o backend gera vetores para cada bloco salvo e passa a usar `busca hibrida com embeddings`.
- Depois de adicionar a chave de embeddings na Vercel, abra o admin e clique em `Salvar base` uma vez para reindexar a base com vetores.
- Se existirem `OPENAI_API_KEY` e `AI_GATEWAY_API_KEY` ao mesmo tempo, embeddings priorizam `OPENAI_API_KEY`.
- Se usar `AI_GATEWAY_API_KEY`, o AI Gateway precisa estar funcional para embeddings no seu projeto. Se nao estiver, prefira `OPENAI_API_KEY`.
