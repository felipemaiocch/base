const {
  MAX_CONTEXT_CHARS,
  MAX_SELECTED_CHUNKS,
  buildSearchText,
  formatChunkForPrompt,
  selectLexicalKnowledgeChunks,
} = require('./knowledge-base');
const { cosineSimilarity, requestEmbedding, resolveEmbeddingConfig } = require('./embeddings');

function rankChunksByEmbedding(chunks, queryEmbedding) {
  return chunks
    .filter((chunk) => Array.isArray(chunk.embedding) && chunk.embedding.length > 0)
    .map((chunk) => ({
      chunk,
      similarity: cosineSimilarity(queryEmbedding, chunk.embedding),
    }))
    .filter((item) => Number.isFinite(item.similarity) && item.similarity > 0)
    .sort((left, right) => right.similarity - left.similarity);
}

function mergeHybridCandidates(vectorRanked, lexicalChunks) {
  const lexicalIds = new Set(lexicalChunks.map((chunk) => chunk.chunkIndex ?? chunk.chunk_index));
  const candidates = new Map();

  for (const item of vectorRanked.slice(0, 8)) {
    const chunkId = item.chunk.chunkIndex ?? item.chunk.chunk_index;
    candidates.set(chunkId, {
      chunk: item.chunk,
      score: item.similarity * 100,
    });
  }

  for (const chunk of lexicalChunks) {
    const chunkId = chunk.chunkIndex ?? chunk.chunk_index;
    const current = candidates.get(chunkId);

    if (current) {
      current.score += 8;
      continue;
    }

    candidates.set(chunkId, {
      chunk,
      score: lexicalIds.has(chunkId) ? 8 : 0,
    });
  }

  return [...candidates.values()].sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }

    return Number(left.chunk.chunkIndex ?? left.chunk.chunk_index ?? 0) - Number(right.chunk.chunkIndex ?? right.chunk.chunk_index ?? 0);
  });
}

function buildContextFromCandidates(candidates) {
  const selectedChunks = [];
  const contextParts = [];
  let currentLength = 0;

  for (const item of candidates) {
    const promptText = formatChunkForPrompt(item.chunk);

    if (selectedChunks.length > 0 && currentLength + promptText.length > MAX_CONTEXT_CHARS) {
      break;
    }

    selectedChunks.push(item.chunk);
    contextParts.push(promptText);
    currentLength += promptText.length;

    if (selectedChunks.length >= MAX_SELECTED_CHUNKS) {
      break;
    }
  }

  return {
    selectedChunks,
    contextText: contextParts.join('\n\n'),
  };
}

async function selectRelevantKnowledgeChunks(chunks, message, history) {
  const lexicalSelection = selectLexicalKnowledgeChunks(chunks, message, history);
  const embeddingConfig = resolveEmbeddingConfig();

  if (!embeddingConfig) {
    return {
      ...lexicalSelection,
      retrievalMode: 'lexical',
    };
  }

  const searchText = buildSearchText(message, history);
  const chunksWithEmbeddings = chunks.filter((chunk) => Array.isArray(chunk.embedding) && chunk.embedding.length > 0);

  if (!searchText || chunksWithEmbeddings.length === 0) {
    return {
      ...lexicalSelection,
      retrievalMode: 'lexical',
    };
  }

  try {
    const queryEmbedding = await requestEmbedding(searchText);
    const vectorRanked = rankChunksByEmbedding(chunksWithEmbeddings, queryEmbedding);

    if (vectorRanked.length === 0) {
      return {
        ...lexicalSelection,
        retrievalMode: 'lexical',
      };
    }

    const hybridCandidates = mergeHybridCandidates(vectorRanked, lexicalSelection.selectedChunks);
    const hybridSelection = buildContextFromCandidates(hybridCandidates);

    if (hybridSelection.selectedChunks.length === 0) {
      return {
        ...lexicalSelection,
        retrievalMode: 'lexical',
      };
    }

    return {
      ...hybridSelection,
      retrievalMode: 'embedding_hybrid',
      searchText,
    };
  } catch (error) {
    console.error('Falha ao recuperar por embeddings:', error);
    return {
      ...lexicalSelection,
      retrievalMode: 'lexical',
    };
  }
}

module.exports = {
  selectRelevantKnowledgeChunks,
};
