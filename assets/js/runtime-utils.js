const TEAM_BUILDER_RUNTIME_UTILS = typeof window !== 'undefined' ? window : globalThis;

TEAM_BUILDER_RUNTIME_UTILS.safeParseJson = function safeParseJson(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' && !value.trim()) return null;
  try {
    return JSON.parse(value);
  } catch (e) {
    console.error('Invalid JSON payload:', e.message);
    return null;
  }
};

TEAM_BUILDER_RUNTIME_UTILS.normalizeName = function normalizeName(name) {
  return name.replace(/\s+/g, ' ').trim().slice(0, 32);
};

TEAM_BUILDER_RUNTIME_UTILS.normalizeWord = function normalizeWord(word) {
  return (word || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 5);
};

TEAM_BUILDER_RUNTIME_UTILS.normalizeChainWord = function normalizeChainWord(word) {
  return (word || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 16);
};

TEAM_BUILDER_RUNTIME_UTILS.normalizeCharadesAnswer = function normalizeCharadesAnswer(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
};

TEAM_BUILDER_RUNTIME_UTILS.getEmojiCharadesGuessOutcome = function getEmojiCharadesGuessOutcome(guess, answerKey, closeAccepted) {
  const guessKey = normalizeCharadesAnswer(guess);
  if (!guessKey) {
    return { guessKey: '', isExact: false, isCloseAccepted: false, points: 0 };
  }
  if (guessKey === answerKey) {
    return { guessKey, isExact: true, isCloseAccepted: false, points: 100 };
  }
  if (closeAccepted) {
    return { guessKey, isExact: false, isCloseAccepted: true, points: 100 };
  }
  return { guessKey, isExact: false, isCloseAccepted: false, points: 0 };
};

TEAM_BUILDER_RUNTIME_UTILS.normalizeEmoji = function normalizeEmoji(value) {
  return String(value || '').trim().slice(0, 8);
};

TEAM_BUILDER_RUNTIME_UTILS.isValidHexColor = function isValidHexColor(value) {
  return /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(String(value || '').trim());
};

TEAM_BUILDER_RUNTIME_UTILS.normalizeTopic = function normalizeTopic(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 80);
};

TEAM_BUILDER_RUNTIME_UTILS.normalizeRoomCode = function normalizeRoomCode(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
};

TEAM_BUILDER_RUNTIME_UTILS.normalizeTriviaOption = function normalizeTriviaOption(value) {
  const raw = String(value || '').trim();
  return raw
    .replace(/^\s*[A-D]\s*[:\)\.\-]\s*/i, '')
    .replace(/^\s*[A-D]\s+/i, '')
    .trim();
};

TEAM_BUILDER_RUNTIME_UTILS.normalizeAnswerIndex = function normalizeAnswerIndex(value) {
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  const text = String(value || '').trim().toUpperCase();
  const asNumber = Number.parseInt(text, 10);
  if (!Number.isNaN(asNumber)) return asNumber;
  if (/^[A-D]$/.test(text)) return text.charCodeAt(0) - 65;
  return Number.NaN;
};

TEAM_BUILDER_RUNTIME_UTILS.escapeHtml = function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

TEAM_BUILDER_RUNTIME_UTILS.extractFirstJson = function extractFirstJson(text) {
  if (!text) return null;
  const trimmed = String(text).trim();
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) return trimmed;
  const start = trimmed.indexOf('[');
  const end = trimmed.lastIndexOf(']');
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1);
  return null;
};
