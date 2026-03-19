const NO_INFO_REPLY = 'Desculpe, nao tenho essa informacao na minha base de conhecimento. Por favor, consulte o seu supervisor ou gestor da area.';

const TARGET_CHUNK_CHARS = 1200;
const MAX_CHUNK_CHARS = 1600;
const MAX_CONTEXT_CHARS = 7000;
const MAX_SELECTED_CHUNKS = 6;

const STOP_WORDS = new Set([
  'a',
  'ao',
  'aos',
  'as',
  'com',
  'como',
  'da',
  'das',
  'de',
  'do',
  'dos',
  'e',
  'em',
  'entre',
  'essa',
  'esse',
  'esta',
  'estao',
  'este',
  'foi',
  'la',
  'na',
  'nas',
  'no',
  'nos',
  'o',
  'os',
  'ou',
  'para',
  'por',
  'pra',
  'qual',
  'quais',
  'que',
  'se',
  'sem',
  'ser',
  'seu',
  'sua',
  'sao',
  'tem',
  'uma',
  'umas',
  'um',
  'uns',
  'via',
]);

const TITLE_CASE_CONNECTORS = new Set([
  'a',
  'ao',
  'as',
  'com',
  'da',
  'das',
  'de',
  'do',
  'dos',
  'e',
  'em',
  'na',
  'nas',
  'no',
  'nos',
  'ou',
  'para',
  'por',
  'sem',
  'via',
  'x',
]);

function normalizeForSearch(text) {
  return (text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeForStorage(text) {
  return (text || '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function isNoiseLine(line) {
  return /^vers[aã]o$/i.test(line) || /^\d{1,3}$/.test(line) || /^\d{2}\/\d{2}\/\d{4}$/.test(line);
}

function isAllCapsHeading(line) {
  if (!line || line.length < 4 || line.length > 120) {
    return false;
  }

  const lettersOnly = line.replace(/[^A-Za-zÀ-ÿ]/g, '');
  if (!lettersOnly) {
    return false;
  }

  const uppercaseOnly = line.replace(/[^A-ZÀ-Ý]/g, '');
  const uppercaseRatio = uppercaseOnly.length / lettersOnly.length;
  const wordCount = line.split(/\s+/).filter(Boolean).length;

  return uppercaseRatio >= 0.8 && wordCount <= 12;
}

function isTitleCaseHeading(line) {
  if (!line || line.length < 4 || line.length > 80 || /[.:;!?]$/.test(line)) {
    return false;
  }

  const words = line.split(/\s+/).filter(Boolean);
  if (words.length === 0 || words.length > 8) {
    return false;
  }

  let significantWords = 0;
  let titleCaseWords = 0;

  for (const rawWord of words) {
    const word = rawWord.replace(/^[^A-Za-zÀ-ÿ0-9]+|[^A-Za-zÀ-ÿ0-9]+$/g, '');
    if (!word || /^\d+$/.test(word)) {
      continue;
    }

    const normalizedWord = normalizeForSearch(word);
    if (TITLE_CASE_CONNECTORS.has(normalizedWord)) {
      continue;
    }

    significantWords += 1;
    if (/^[A-ZÀ-Ý]/.test(word)) {
      titleCaseWords += 1;
    }
  }

  if (significantWords === 0) {
    return false;
  }

  return titleCaseWords >= Math.max(1, significantWords - 1);
}

function isLikelyHeading(line) {
  return isAllCapsHeading(line) || isTitleCaseHeading(line);
}

function sanitizeKnowledgeBaseInput(rawContent) {
  const normalized = normalizeForStorage(rawContent);
  if (!normalized) {
    return '';
  }

  const lines = normalized.split('\n');
  const cleanedLines = [];

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      if (cleanedLines.length > 0 && cleanedLines[cleanedLines.length - 1] !== '') {
        cleanedLines.push('');
      }
      continue;
    }

    if (isNoiseLine(trimmed)) {
      continue;
    }

    cleanedLines.push(trimmed);
  }

  while (cleanedLines[0] === '') {
    cleanedLines.shift();
  }

  while (cleanedLines[cleanedLines.length - 1] === '') {
    cleanedLines.pop();
  }

  return cleanedLines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function splitIntoSections(text) {
  if (!text) {
    return [];
  }

  const lines = text.split('\n');
  const sections = [];
  let currentTitle = 'Base geral';
  let currentLines = [];

  function pushCurrentSection() {
    const content = currentLines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
    if (!content) {
      currentLines = [];
      return;
    }

    sections.push({
      sectionTitle: currentTitle,
      content,
    });
    currentLines = [];
  }

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      if (currentLines.length > 0 && currentLines[currentLines.length - 1] !== '') {
        currentLines.push('');
      }
      continue;
    }

    if (isLikelyHeading(trimmed)) {
      pushCurrentSection();
      currentTitle = trimmed;
      continue;
    }

    currentLines.push(trimmed);
  }

  pushCurrentSection();

  return sections;
}

function splitByLines(text, maxChars) {
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
  if (lines.length <= 1) {
    return [];
  }

  const parts = [];
  let current = '';

  for (const line of lines) {
    const candidate = current ? `${current}\n${line}` : line;
    if (candidate.length <= maxChars || !current) {
      current = candidate;
      continue;
    }

    parts.push(current);
    current = line;
  }

  if (current) {
    parts.push(current);
  }

  return parts;
}

function splitBySentences(text, maxChars) {
  const sentences = text.match(/[^.!?]+[.!?]?/g);
  if (!sentences || sentences.length <= 1) {
    return [];
  }

  const parts = [];
  let current = '';

  for (const rawSentence of sentences) {
    const sentence = rawSentence.trim();
    if (!sentence) {
      continue;
    }

    const candidate = current ? `${current} ${sentence}` : sentence;
    if (candidate.length <= maxChars || !current) {
      current = candidate;
      continue;
    }

    parts.push(current);
    current = sentence;
  }

  if (current) {
    parts.push(current);
  }

  return parts;
}

function splitLargePart(text, maxChars) {
  if (text.length <= maxChars) {
    return [text];
  }

  const byLines = splitByLines(text, maxChars);
  if (byLines.length > 1) {
    return byLines.flatMap((part) => splitLargePart(part, maxChars));
  }

  const bySentences = splitBySentences(text, maxChars);
  if (bySentences.length > 1) {
    return bySentences.flatMap((part) => splitLargePart(part, maxChars));
  }

  const slices = [];
  let index = 0;
  while (index < text.length) {
    slices.push(text.slice(index, index + maxChars).trim());
    index += maxChars;
  }
  return slices.filter(Boolean);
}

function splitSectionIntoChunks(sectionTitle, content) {
  const parts = content
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean)
    .flatMap((part) => splitLargePart(part, MAX_CHUNK_CHARS));

  const chunks = [];
  let current = '';

  for (const part of parts) {
    const candidate = current ? `${current}\n\n${part}` : part;
    if (candidate.length <= TARGET_CHUNK_CHARS || !current) {
      current = candidate;
      continue;
    }

    chunks.push({
      sectionTitle,
      content: current,
    });
    current = part;
  }

  if (current) {
    chunks.push({
      sectionTitle,
      content: current,
    });
  }

  return chunks;
}

function createKnowledgeBaseChunks(rawContent) {
  const cleanedContent = sanitizeKnowledgeBaseInput(rawContent);
  if (!cleanedContent) {
    return [];
  }

  const sections = splitIntoSections(cleanedContent);
  const chunks = [];

  for (const section of sections) {
    const sectionChunks = splitSectionIntoChunks(section.sectionTitle, section.content);
    for (const chunk of sectionChunks) {
      chunks.push({
        chunkIndex: chunks.length,
        sectionTitle: chunk.sectionTitle,
        content: chunk.content,
        searchableText: normalizeForSearch(`${chunk.sectionTitle} ${chunk.content}`),
      });
    }
  }

  return chunks;
}

function extractTerms(text) {
  const normalized = normalizeForSearch(text);
  if (!normalized) {
    return [];
  }

  const seen = new Set();
  const terms = [];

  for (const token of normalized.split(' ')) {
    if (!token || seen.has(token)) {
      continue;
    }

    if ((token.length < 3 && !/^\d+$/.test(token)) || STOP_WORDS.has(token)) {
      continue;
    }

    seen.add(token);
    terms.push(token);
  }

  if (terms.length > 0) {
    return terms;
  }

  return normalized.split(' ').filter(Boolean).slice(0, 6);
}

function buildSearchText(message, history) {
  const trimmedMessage = (message || '').trim();
  const messageTerms = extractTerms(trimmedMessage);
  if (messageTerms.length >= 5 || trimmedMessage.length >= 60) {
    return trimmedMessage;
  }

  const previousUserMessages = Array.isArray(history)
    ? history
        .filter((item) => item && item.role === 'user' && typeof item.content === 'string')
        .map((item) => item.content.trim())
        .filter(Boolean)
        .slice(-2)
    : [];

  return [...previousUserMessages, trimmedMessage].filter(Boolean).join(' ');
}

function countOccurrences(text, term) {
  if (!text || !term) {
    return 0;
  }

  let count = 0;
  let startIndex = 0;

  while (startIndex < text.length) {
    const index = text.indexOf(term, startIndex);
    if (index === -1) {
      break;
    }

    count += 1;
    startIndex = index + term.length;
  }

  return count;
}

function buildPhrases(terms) {
  const phrases = [];
  const limit = Math.min(terms.length, 8);

  for (let index = 0; index < limit; index += 1) {
    if (index + 1 < limit) {
      phrases.push(`${terms[index]} ${terms[index + 1]}`);
    }
    if (index + 2 < limit) {
      phrases.push(`${terms[index]} ${terms[index + 1]} ${terms[index + 2]}`);
    }
  }

  return phrases;
}

function scoreChunk(chunk, terms, phrases) {
  const sectionTitle = normalizeForSearch(chunk.section_title || chunk.sectionTitle || '');
  const searchableText = chunk.searchable_text || chunk.searchableText || normalizeForSearch(chunk.content || '');

  let score = 0;

  for (const phrase of phrases) {
    if (phrase.length < 7) {
      continue;
    }

    if (sectionTitle.includes(phrase)) {
      score += 40;
    } else if (searchableText.includes(phrase)) {
      score += 18;
    }
  }

  for (const term of terms) {
    const titleHits = countOccurrences(sectionTitle, term);
    const contentHits = countOccurrences(searchableText, term);

    if (titleHits > 0) {
      score += 16 + Math.min(titleHits, 2) * 5;
    }

    if (contentHits > 0) {
      score += Math.min(contentHits, 6) * Math.min(term.length, 8);
    }
  }

  return score;
}

function formatChunkForPrompt(chunk) {
  const chunkIndex = Number(chunk.chunk_index ?? chunk.chunkIndex ?? 0) + 1;
  const sectionTitle = chunk.section_title || chunk.sectionTitle || 'Base geral';

  return `[Bloco ${chunkIndex} - ${sectionTitle}]\n${chunk.content}`;
}

function selectRelevantKnowledgeChunks(chunks, message, history) {
  if (!Array.isArray(chunks) || chunks.length === 0) {
    return {
      selectedChunks: [],
      contextText: '',
      searchText: '',
    };
  }

  const searchText = buildSearchText(message, history);
  const terms = extractTerms(searchText);
  const phrases = buildPhrases(terms);

  const scoredChunks = chunks
    .map((chunk) => ({
      chunk,
      score: scoreChunk(chunk, terms, phrases),
    }))
    .filter((item) => item.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return Number(left.chunk.chunk_index ?? left.chunk.chunkIndex ?? 0) - Number(right.chunk.chunk_index ?? right.chunk.chunkIndex ?? 0);
    });

  const selectedChunks = [];
  const contextParts = [];
  let currentLength = 0;

  for (const item of scoredChunks) {
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
    searchText,
  };
}

module.exports = {
  NO_INFO_REPLY,
  createKnowledgeBaseChunks,
  selectRelevantKnowledgeChunks,
  sanitizeKnowledgeBaseInput,
};
