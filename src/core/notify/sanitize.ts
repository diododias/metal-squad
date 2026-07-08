import { homedir } from 'node:os';

/**
 * Remove detalhes sensiveis de caminho das mensagens de notificacao.
 *
 * Notificacoes enviadas por canais externos (telegram, slack, desktop, etc.)
 * nao devem expor o caminho absoluto do checkout do usuario, que inclui o home
 * e o nome de usuario (`/Users/<user>/...`). Este helper reescreve qualquer
 * caminho absoluto embutido no texto para uma forma curta e relativa, mantendo
 * o suficiente para identificar epico/feature/task/arquivo.
 */
export function sanitizeNotificationMessage(
  message: string,
  cwd: string = process.cwd(),
  home: string = homedir(),
): string {
  if (!message) return message;
  // Captura caminhos POSIX absolutos (com ou sem prefixo de drive do Windows)
  // embutidos em texto livre. O lookbehind evita casar o "/" interno de um
  // caminho ja relativo (ex.: "src/b.ts"); so casamos quando o caminho comeca
  // no inicio do texto ou apos um separador.
  const absolutePathPattern = /(?<![\w.@~-])(?:[A-Za-z]:)?(?:\/[^\s,;()"'`]+)+/g;
  return message.replace(absolutePathPattern, (raw) => shortenPath(raw, cwd, home));
}

function stripTrailingSlash(value: string): string {
  return value.endsWith('/') && value.length > 1 ? value.slice(0, -1) : value;
}

function shortenPath(raw: string, cwd: string, home: string): string {
  // Preserva pontuacao de fim (ex.: "arquivo.ts." ou "path)") fora do caminho.
  const match = /[.,;:)\]}]+$/.exec(raw);
  const trailing = match ? match[0] : '';
  const path = trailing ? raw.slice(0, -trailing.length) : raw;

  const cwdNorm = stripTrailingSlash(cwd);
  const homeNorm = stripTrailingSlash(home);

  let relative = path;
  if (path === cwdNorm) {
    relative = '.';
  } else if (path.startsWith(`${cwdNorm}/`)) {
    // Sob o checkout atual: caminho relativo completo (epico/feature/arquivo).
    relative = path.slice(cwdNorm.length + 1);
  } else if (path.startsWith(`${homeNorm}/`)) {
    // Fora do checkout mas dentro do home: esconde home e mantem os ultimos
    // segmentos significativos.
    relative = lastSegments(path.slice(homeNorm.length + 1), 3);
  } else if (path.startsWith('/')) {
    // Caminho absoluto arbitrario: mantem apenas os ultimos segmentos.
    relative = lastSegments(path, 3);
  }

  return `${relative}${trailing}`;
}

function lastSegments(path: string, count: number): string {
  const segments = path.split('/').filter(Boolean);
  if (segments.length <= count) return segments.join('/');
  return segments.slice(-count).join('/');
}
