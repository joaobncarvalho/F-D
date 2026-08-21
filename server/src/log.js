// F&D — logger leve e estruturado (sem dependências).
//
// Uma linha por evento: timestamp + nível + mensagem + metadados JSON. Nível
// controlado por LOG_LEVEL (error|warn|info|debug; default info). Durante o
// playtest isto dá rasto ao que corre mal — sem ele, um bug numa sala é invisível.

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const THRESHOLD = LEVELS[process.env.LOG_LEVEL] ?? LEVELS.info;

function emit(level, msg, meta) {
  if (LEVELS[level] > THRESHOLD) return;
  const time = new Date().toISOString();
  const suffix = meta && Object.keys(meta).length ? ' ' + safeJson(meta) : '';
  const line = `${time} [${level.toUpperCase()}] ${msg}${suffix}`;
  const sink = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  sink(line);
}

function safeJson(meta) {
  try {
    return JSON.stringify(meta);
  } catch {
    return '[meta não serializável]';
  }
}

export const log = {
  error: (msg, meta) => emit('error', msg, meta),
  warn: (msg, meta) => emit('warn', msg, meta),
  info: (msg, meta) => emit('info', msg, meta),
  debug: (msg, meta) => emit('debug', msg, meta),
};
