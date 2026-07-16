import type { Feature, Task, Tool } from '../backlog/schema.js';

/**
 * Empacotamento de tasks em blocos que cabem na janela de contexto do modelo
 * que vai implementar, consumindo no maximo uma fracao (default 70%) da sessao.
 *
 * Objetivo: apos a etapa de `tasks`, dividir as tasks em blocos executaveis e
 * medir tokens por bloco/task para analytics, mantendo a ordem topologica (as
 * dependencias vem antes no tasks.md gerado pelo speckit).
 */

/** Fracao da janela de contexto reservada para uma sessao de implementacao. */
export const SESSION_BUDGET_RATIO = 0.7;

/** Janela de contexto padrao quando o modelo/tool nao e reconhecido (tokens). */
export const DEFAULT_CONTEXT_WINDOW = 200_000;

/** Custo base estimado por task (prompt, instrucoes, overhead de skill). */
export const DEFAULT_BASE_TOKENS_PER_TASK = 1_500;

/** ~4 caracteres por token e a heuristica usual para texto em ingles/pt. */
const CHARS_PER_TOKEN = 4;

/**
 * Janela de contexto por modelo/tool (tokens). Chaves em minusculo; a busca faz
 * match por substring para tolerar sufixos de versao (ex.: `claude-opus-4-8`).
 */
export const MODEL_CONTEXT_WINDOWS: Record<string, number> = {
  // Claude
  haiku: 200_000,
  sonnet: 200_000,
  opus: 200_000,
  claude: 200_000,
  // Codex / GPT
  'gpt-5': 256_000,
  'gpt-4': 128_000,
  codex: 256_000,
  o3: 200_000,
  // OpenCode e outros locais tendem a janelas menores por default
  opencode: 128_000,
};

/** Janela de contexto por tool quando nao ha modelo explicito. */
const TOOL_CONTEXT_WINDOWS: Record<string, number> = {
  claude: 200_000,
  codex: 256_000,
  opencode: 128_000,
};

export interface BlockTask {
  id: string;
  title: string;
  estimatedTokens: number;
}

export interface TaskBlock {
  index: number;
  tasks: BlockTask[];
  totalTokens: number;
}

export interface BlockPlan {
  contextWindow: number;
  budgetRatio: number;
  /** contextWindow * budgetRatio, arredondado. */
  budgetTokens: number;
  blocks: TaskBlock[];
  totalTokens: number;
  totalTasks: number;
  /** Ids de tasks cujo custo individual excede o budget do bloco. */
  oversizedTasks: string[];
}

export interface PlanOptions {
  contextWindow?: number;
  budgetRatio?: number;
  baseTokensPerTask?: number;
}

/** Estima tokens de um texto livre pela heuristica de caracteres/token. */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Resolve a janela de contexto para o modelo/tool informados. Prioriza o modelo
 * explicito (match por substring), depois o tool, depois o default.
 */
export function resolveContextWindow(input: { model?: string; tool?: Tool }): number {
  const model = input.model?.toLowerCase().trim();
  if (model) {
    if (MODEL_CONTEXT_WINDOWS[model]) return MODEL_CONTEXT_WINDOWS[model];
    for (const [key, window] of Object.entries(MODEL_CONTEXT_WINDOWS)) {
      if (model.includes(key)) return window;
    }
  }
  if (input.tool) {
    return TOOL_CONTEXT_WINDOWS[input.tool] ?? DEFAULT_CONTEXT_WINDOW;
  }
  return DEFAULT_CONTEXT_WINDOW;
}

/** Estima os tokens de uma task a partir do titulo e do custo base. */
export function estimateTaskTokens(
  task: Pick<Task, 'title'> & { body?: string },
  baseTokens: number = DEFAULT_BASE_TOKENS_PER_TASK,
): number {
  return baseTokens + estimateTokens(task.title) + estimateTokens(task.body ?? '');
}

/**
 * Empacota tasks (ja com `estimatedTokens`) em blocos que cabem no budget,
 * preservando a ordem para respeitar dependencias. Uma task maior que o budget
 * ocupa seu proprio bloco e e marcada como oversized.
 */
export function planTaskBlocks(tasks: BlockTask[], options: PlanOptions = {}): BlockPlan {
  const contextWindow = options.contextWindow ?? DEFAULT_CONTEXT_WINDOW;
  const budgetRatio = options.budgetRatio ?? SESSION_BUDGET_RATIO;
  const budgetTokens = Math.round(contextWindow * budgetRatio);

  const blocks: TaskBlock[] = [];
  const oversizedTasks: string[] = [];
  let current: BlockTask[] = [];
  let currentTokens = 0;

  const flush = (): void => {
    if (current.length === 0) return;
    blocks.push({ index: blocks.length, tasks: current, totalTokens: currentTokens });
    current = [];
    currentTokens = 0;
  };

  for (const task of tasks) {
    if (task.estimatedTokens > budgetTokens) {
      oversizedTasks.push(task.id);
      // Task nao cabe no budget: fecha o bloco atual e isola a task.
      flush();
      blocks.push({ index: blocks.length, tasks: [task], totalTokens: task.estimatedTokens });
      continue;
    }

    if (current.length > 0 && currentTokens + task.estimatedTokens > budgetTokens) {
      flush();
    }
    current.push(task);
    currentTokens += task.estimatedTokens;
  }
  flush();

  const totalTokens = blocks.reduce((sum, block) => sum + block.totalTokens, 0);
  const totalTasks = blocks.reduce((sum, block) => sum + block.tasks.length, 0);

  return {
    contextWindow,
    budgetRatio,
    budgetTokens,
    blocks,
    totalTokens,
    totalTasks,
    oversizedTasks,
  };
}

/**
 * Planeja os blocos de uma feature: resolve a janela de contexto do modelo/tool
 * da feature e estima cada task, produzindo o plano pronto para analytics.
 */
export function planFeatureTaskBlocks(
  feature: Pick<Feature, 'model' | 'tool' | 'tasks'>,
  options: PlanOptions = {},
): BlockPlan {
  const contextWindow = options.contextWindow
    ?? resolveContextWindow({ model: feature.model, tool: feature.tool });
  const baseTokens = options.baseTokensPerTask ?? DEFAULT_BASE_TOKENS_PER_TASK;

  const blockTasks: BlockTask[] = feature.tasks.map((task) => ({
    id: task.id,
    title: task.title,
    estimatedTokens: estimateTaskTokens(task, baseTokens),
  }));

  return planTaskBlocks(blockTasks, { ...options, contextWindow });
}
