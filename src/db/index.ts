import { accessSync, constants, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import { DB_PATH_ENV, resolveDbPath, ensureDataDir } from '../config/index.js';
import { BUILTIN_WORKFLOW_TEMPLATES } from '../core/workflow/stageSkills.js';
import { backfillRunExecutionSnapshots } from './backfill.js';

let db: Database.Database | null = null;
let dbMode: 'readonly' | 'readwrite' | null = null;

export class DbAccessError extends Error {
  public constructor(
    public readonly dbPath: string,
    detail: string,
  ) {
    super(
      [
        `SQLite database not writable at: ${dbPath}`,
        detail,
        `Fix file/directory permissions or set ${DB_PATH_ENV} to a writable path.`,
        `Example: ${DB_PATH_ENV}=$(pwd)/.metal-squad/app.db msq run --feature feat-1`,
      ].join('\n'),
    );
    this.name = 'DbAccessError';
  }
}

export function assertWritableDbPath(
  dbPath = resolveDbPath(),
  options: { createDataDir?: boolean } = {},
): void {
  const dataDir = dirname(dbPath);

  if (options.createDataDir !== false) {
    try {
      ensureDataDir(dbPath);
    } catch {
      throw new DbAccessError(
        dbPath,
        `Nao foi possivel criar ou acessar o diretório do banco: ${dataDir}`,
      );
    }
  }

  try {
    accessSync(dataDir, constants.W_OK);
  } catch {
    throw new DbAccessError(
      dbPath,
      `Diretório sem permissão de escrita: ${dataDir}`,
    );
  }

  if (!existsSync(dbPath)) return;

  try {
    accessSync(dbPath, constants.W_OK);
  } catch {
    throw new DbAccessError(
      dbPath,
      `Arquivo do banco sem permissão de escrita: ${dbPath}`,
    );
  }
}

export function getDb(mode: 'readonly' | 'readwrite' = 'readwrite'): Database.Database {
  if (db && (dbMode === 'readwrite' || dbMode === mode)) return db;
  if (db) {
    db.close();
    db = null;
    dbMode = null;
  }

  const dbPath = resolveDbPath();

  try {
    if (mode === 'readonly') {
      db = new Database(dbPath, { readonly: true, fileMustExist: true });
      dbMode = 'readonly';
      return db;
    }

    assertWritableDbPath(dbPath);
    db = new Database(dbPath);
    dbMode = 'readwrite';
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    migrate(db);
    return db;
  } catch (error) {
    db?.close();
    db = null;
    dbMode = null;
    throw toDbAccessError(error, dbPath);
  }
}

export function resetDb(): void {
  if (!db) return;
  db.close();
  db = null;
  dbMode = null;
}

/** Runs a write callback inside the shared SQLite transaction boundary. */
export function withTransaction<T>(callback: (database: Database.Database) => T): T {
  const database = getDb('readwrite');
  return database.transaction(() => callback(database))();
}

function migrate(d: Database.Database): void {
  d.exec(`
    CREATE TABLE IF NOT EXISTS repos (
      repo_id   TEXT PRIMARY KEY,
      path      TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS projects (
      project_id   TEXT PRIMARY KEY,
      name         TEXT NOT NULL,
      description  TEXT,
      position     INTEGER NOT NULL DEFAULT 0,
      archived_at  TEXT,
      deleted_at   TEXT,
      revision     INTEGER NOT NULL DEFAULT 1,
      created_at   TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
      CHECK (archived_at IS NULL OR deleted_at IS NULL)
    );

    CREATE INDEX IF NOT EXISTS idx_projects_position ON projects(position);
    CREATE INDEX IF NOT EXISTS idx_projects_archived_at ON projects(archived_at);
    CREATE INDEX IF NOT EXISTS idx_projects_deleted_at ON projects(deleted_at);

    CREATE TABLE IF NOT EXISTS project_repos (
      repo_id      TEXT PRIMARY KEY REFERENCES repos(repo_id) ON DELETE RESTRICT,
      project_id   TEXT NOT NULL REFERENCES projects(project_id) ON DELETE RESTRICT,
      position     INTEGER NOT NULL DEFAULT 0,
      created_at   TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_project_repos_project ON project_repos(project_id, position);

    CREATE TABLE IF NOT EXISTS workflow_templates (
      template_id      TEXT PRIMARY KEY,
      scope_project_id TEXT REFERENCES projects(project_id),
      name             TEXT NOT NULL,
      definition_json  TEXT NOT NULL,
      version          INTEGER NOT NULL DEFAULT 1,
      builtin          INTEGER NOT NULL DEFAULT 0,
      archived_at      TEXT,
      revision         INTEGER NOT NULL DEFAULT 1,
      created_at       TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at       TEXT NOT NULL DEFAULT (datetime('now')),
      CHECK (builtin IN (0, 1)),
      CHECK (builtin = 0 OR scope_project_id IS NULL)
    );

    CREATE INDEX IF NOT EXISTS idx_workflow_templates_scope ON workflow_templates(scope_project_id);
    CREATE INDEX IF NOT EXISTS idx_workflow_templates_archived_at ON workflow_templates(archived_at);

    CREATE TABLE IF NOT EXISTS project_work_item_templates (
      project_id     TEXT NOT NULL REFERENCES projects(project_id),
      work_item_type TEXT NOT NULL,
      template_id    TEXT NOT NULL REFERENCES workflow_templates(template_id),
      updated_at     TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (project_id, work_item_type),
      CHECK (work_item_type IN ('feature','bug'))
    );

    CREATE INDEX IF NOT EXISTS idx_project_work_item_templates_template
      ON project_work_item_templates(template_id);

    CREATE TABLE IF NOT EXISTS audit_events (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id   TEXT,
      actor        TEXT,
      entity_kind  TEXT NOT NULL,
      entity_id    TEXT NOT NULL,
      action       TEXT NOT NULL,
      before_json  TEXT,
      after_json   TEXT,
      created_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_audit_events_entity ON audit_events(entity_kind, entity_id, id DESC);

    CREATE TABLE IF NOT EXISTS runs (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      repo_id    TEXT NOT NULL REFERENCES repos(repo_id),
      feature_id TEXT NOT NULL,
      tool       TEXT NOT NULL,
      pipeline_id INTEGER REFERENCES pipelines(id),
      stage      TEXT,
      status     TEXT NOT NULL DEFAULT 'running',
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      ended_at   TEXT,
      input_tokens INTEGER,
      cached_input_tokens INTEGER,
      output_tokens INTEGER,
      total_tokens INTEGER,
      token_data_quality TEXT,
      context_window_tokens INTEGER,
      context_window_percent REAL,
      publish_verified INTEGER,
      publish_error TEXT,
      branch_name TEXT,
      base_branch TEXT,
      commit_sha TEXT,
      remote_branch TEXT,
      pr_number INTEGER,
      pr_url TEXT,
      session_status TEXT,
      session_started_at TEXT,
      session_updated_at TEXT,
      session_elapsed_ms INTEGER,
      session_last_output_at TEXT,
      session_idle_ms INTEGER,
      session_reason TEXT,
      session_terminal INTEGER NOT NULL DEFAULT 0,
      adapter_session_tool TEXT,
      adapter_session_id TEXT,
      model TEXT,
      effort TEXT,
      thinking TEXT,
      tool_name TEXT,
      tool_version TEXT,
      pricing_profile_id TEXT,
      metrics_confidence TEXT DEFAULT 'unknown'
    );

    CREATE TABLE IF NOT EXISTS token_usage (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id    INTEGER NOT NULL REFERENCES runs(id),
      input     INTEGER NOT NULL DEFAULT 0,
      cached_input INTEGER NOT NULL DEFAULT 0,
      output    INTEGER NOT NULL DEFAULT 0,
      total     INTEGER NOT NULL DEFAULT 0,
      data_quality TEXT,
      raw_usage_json TEXT
    );

    CREATE TABLE IF NOT EXISTS gates (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id      INTEGER NOT NULL REFERENCES runs(id),
      feature_id  TEXT NOT NULL,
      repo_id     TEXT NOT NULL,
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      resolved_at TEXT,
      decision    TEXT
    );

    CREATE TABLE IF NOT EXISTS retry_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id INTEGER NOT NULL REFERENCES runs(id),
      attempt INTEGER NOT NULL,
      error TEXT,
      retried_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS run_output (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id     INTEGER NOT NULL REFERENCES runs(id),
      feature_id TEXT NOT NULL,
      tool       TEXT NOT NULL,
      stream     TEXT NOT NULL,
      source     TEXT NOT NULL,
      line       TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS run_tool_calls (
      run_id       INTEGER NOT NULL REFERENCES runs(id),
      id           TEXT NOT NULL,
      feature_id   TEXT NOT NULL,
      tool         TEXT NOT NULL,
      sequence     INTEGER NOT NULL,
      phase        TEXT NOT NULL,
      name         TEXT NOT NULL,
      arguments_json TEXT,
      output       TEXT,
      step         TEXT,
      started_at   TEXT NOT NULL,
      completed_at TEXT,
      error        TEXT,
      PRIMARY KEY (run_id, id)
    );
    CREATE INDEX IF NOT EXISTS idx_run_tool_calls_run_sequence ON run_tool_calls(run_id, sequence);

    CREATE TABLE IF NOT EXISTS context_queries (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id        INTEGER NOT NULL REFERENCES runs(id),
      feature_id    TEXT,
      tool          TEXT,
      query_tool    TEXT NOT NULL,
      kind          TEXT NOT NULL,
      target        TEXT,
      observed_bytes INTEGER NOT NULL DEFAULT 0,
      latency_ms    INTEGER,
      cache_hit     INTEGER,
      raw_line      TEXT NOT NULL,
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS task_runs (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id     INTEGER NOT NULL REFERENCES runs(id),
      task_id    TEXT NOT NULL,
      title      TEXT NOT NULL,
      status     TEXT NOT NULL DEFAULT 'pending',
      stage      TEXT,
      started_at TEXT,
      ended_at   TEXT,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      cached_input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      total_tokens INTEGER NOT NULL DEFAULT 0,
      token_data_quality TEXT,
      context_window_tokens INTEGER,
      context_window_percent REAL
    );

    CREATE TABLE IF NOT EXISTS pipelines (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      repo_id     TEXT NOT NULL REFERENCES repos(repo_id),
      feature_id  TEXT NOT NULL,
      status      TEXT NOT NULL DEFAULT 'running',
      cwd         TEXT,
      current_stage TEXT,
      auto_advance INTEGER NOT NULL DEFAULT 0,
      plan_json   TEXT NOT NULL DEFAULT '[]',
      done_json   TEXT NOT NULL DEFAULT '[]',
      pending_json TEXT NOT NULL DEFAULT '[]',
      active_json TEXT NOT NULL DEFAULT '[]',
      aborted_json TEXT NOT NULL DEFAULT '[]',
      workflow_snapshot_json TEXT NOT NULL DEFAULT '{}',
      requested_abort_feature_id TEXT,
      resume_count INTEGER NOT NULL DEFAULT 0,
      resume_summary TEXT,
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
      ended_at    TEXT
    );

    CREATE TABLE IF NOT EXISTS run_events (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id     INTEGER NOT NULL REFERENCES runs(id),
      event      TEXT NOT NULL,
      metadata   TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS stage_requests (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      pipeline_id INTEGER NOT NULL REFERENCES pipelines(id),
      run_id      INTEGER REFERENCES runs(id),
      feature_id  TEXT NOT NULL,
      stage       TEXT NOT NULL,
      kind        TEXT NOT NULL,
      prompt      TEXT NOT NULL,
      status      TEXT NOT NULL DEFAULT 'pending',
      response    TEXT,
      source      TEXT NOT NULL DEFAULT 'manual',
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      resolved_at TEXT
    );

    CREATE TABLE IF NOT EXISTS stage_transition_decisions (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      pipeline_id INTEGER NOT NULL REFERENCES pipelines(id),
      feature_id  TEXT NOT NULL,
      from_run_id INTEGER NOT NULL REFERENCES runs(id),
      from_stage  TEXT NOT NULL,
      to_stage    TEXT NOT NULL,
      policy_mode TEXT NOT NULL,
      decision    TEXT NOT NULL,
      reason      TEXT NOT NULL,
      context_window_percent REAL,
      previous_session_id TEXT,
      next_session_id TEXT,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_stage_transition_decisions_pipeline_feature
      ON stage_transition_decisions(pipeline_id, feature_id, id DESC);

    CREATE TABLE IF NOT EXISTS budget_state (
      key TEXT PRIMARY KEY,
      tokens INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS backlog_catalog_meta (
      repo_id       TEXT PRIMARY KEY REFERENCES repos(repo_id),
      repo          TEXT NOT NULL,
      version       INTEGER NOT NULL,
      defaults_json TEXT NOT NULL,
      budget_json   TEXT,
      updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS backlog_epics (
      epic_id     TEXT PRIMARY KEY,
      repo_id     TEXT REFERENCES repos(repo_id),
      title       TEXT NOT NULL,
      position    INTEGER NOT NULL,
      data_json   TEXT NOT NULL,
      archived_at TEXT,
      updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS backlog_features (
      feature_id  TEXT PRIMARY KEY,
      epic_id     TEXT NOT NULL REFERENCES backlog_epics(epic_id),
      repo_id     TEXT NOT NULL REFERENCES repos(repo_id),
      title       TEXT NOT NULL,
      depends_on  TEXT NOT NULL DEFAULT '[]',
      spec_file   TEXT,
      position    INTEGER NOT NULL,
      data_json   TEXT NOT NULL,
      archived_at TEXT,
      updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS backlog_tasks (
      task_id     TEXT NOT NULL,
      feature_id  TEXT NOT NULL REFERENCES backlog_features(feature_id),
      title       TEXT NOT NULL,
      status      TEXT NOT NULL DEFAULT 'todo',
      position    INTEGER NOT NULL,
      data_json   TEXT NOT NULL,
      archived_at TEXT,
      updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (task_id, feature_id)
    );

    CREATE TABLE IF NOT EXISTS feature_topic_associations (
      chat_id          TEXT NOT NULL,
      feature_id       TEXT NOT NULL,
      thread_id        INTEGER,
      title            TEXT NOT NULL,
      state            TEXT NOT NULL DEFAULT 'creating'
                       CHECK (state IN ('creating', 'active', 'invalid', 'error')),
      lease_token      TEXT,
      lease_expires_at TEXT,
      last_error       TEXT,
      created_at       TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at       TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (chat_id, feature_id),
      CHECK (state <> 'active' OR thread_id IS NOT NULL AND thread_id > 0)
    );

    CREATE INDEX IF NOT EXISTS idx_feature_topic_associations_state
      ON feature_topic_associations(state, lease_expires_at);
    CREATE INDEX IF NOT EXISTS idx_feature_topic_associations_thread
      ON feature_topic_associations(chat_id, thread_id);

    CREATE TABLE IF NOT EXISTS timeout_occurrences (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id INTEGER NOT NULL UNIQUE REFERENCES runs(id),
      pipeline_id INTEGER REFERENCES pipelines(id),
      feature_id TEXT NOT NULL,
      stage TEXT,
      timeout_ms INTEGER NOT NULL CHECK (timeout_ms > 0),
      runtime_ms INTEGER NOT NULL CHECK (runtime_ms >= 0),
      last_progress TEXT,
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'resolved', 'cancelled', 'superseded')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      resolved_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_timeout_occurrences_pipeline
      ON timeout_occurrences(pipeline_id, status);

    CREATE TABLE IF NOT EXISTS timeout_approval_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timeout_occurrence_id INTEGER NOT NULL UNIQUE REFERENCES timeout_occurrences(id),
      pipeline_id INTEGER REFERENCES pipelines(id),
      run_id INTEGER NOT NULL REFERENCES runs(id),
      feature_id TEXT NOT NULL,
      stage TEXT,
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'blocked', 'cancelled', 'superseded')),
      decision TEXT CHECK (decision IN ('retry', 'keep_blocked')),
      decision_source TEXT CHECK (decision_source IN ('telegram', 'system', 'resume')),
      notification_status TEXT NOT NULL DEFAULT 'pending'
        CHECK (notification_status IN ('pending', 'sent', 'failed')),
      notification_attempts INTEGER NOT NULL DEFAULT 0 CHECK (notification_attempts >= 0),
      last_notification_error TEXT,
      notified_at TEXT,
      retry_run_id INTEGER UNIQUE REFERENCES runs(id),
      retry_claimed INTEGER NOT NULL DEFAULT 0 CHECK (retry_claimed IN (0, 1)),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      resolved_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_timeout_requests_pending
      ON timeout_approval_requests(status, feature_id);

    CREATE TABLE IF NOT EXISTS recovery_decisions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timeout_occurrence_id INTEGER NOT NULL REFERENCES timeout_occurrences(id),
      approval_request_id INTEGER NOT NULL REFERENCES timeout_approval_requests(id),
      decision TEXT NOT NULL CHECK (decision IN ('retry', 'keep_blocked')),
      source TEXT NOT NULL CHECK (source IN ('telegram', 'system', 'resume')),
      retry_run_id INTEGER REFERENCES runs(id),
      reason TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(approval_request_id)
    );

    CREATE INDEX IF NOT EXISTS idx_recovery_decisions_occurrence
      ON recovery_decisions(timeout_occurrence_id);

    CREATE TABLE IF NOT EXISTS processed_callback_queries (
      callback_id TEXT PRIMARY KEY,
      action TEXT NOT NULL,
      payload TEXT,
      processed_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_processed_callback_queries_at
      ON processed_callback_queries(processed_at);
  `);

  const runColumns = d
    .prepare(`PRAGMA table_info(runs)`)
    .all() as { name?: string }[];
  const hasSummary = runColumns.some((column) => column.name === 'summary');
  if (!hasSummary) {
    d.exec(`ALTER TABLE runs ADD COLUMN summary TEXT`);
  }
  const hasInputTokens = runColumns.some((column) => column.name === 'input_tokens');
  if (!hasInputTokens) {
    d.exec(`ALTER TABLE runs ADD COLUMN input_tokens INTEGER`);
  }
  const hasOutputTokens = runColumns.some((column) => column.name === 'output_tokens');
  if (!hasOutputTokens) {
    d.exec(`ALTER TABLE runs ADD COLUMN output_tokens INTEGER`);
  }
  const hasCachedInputTokens = runColumns.some((column) => column.name === 'cached_input_tokens');
  if (!hasCachedInputTokens) {
    d.exec(`ALTER TABLE runs ADD COLUMN cached_input_tokens INTEGER`);
  }
  const hasTotalTokens = runColumns.some((column) => column.name === 'total_tokens');
  if (!hasTotalTokens) {
    d.exec(`ALTER TABLE runs ADD COLUMN total_tokens INTEGER`);
  }
  const hasContextWindowTokens = runColumns.some((column) => column.name === 'context_window_tokens');
  if (!hasContextWindowTokens) {
    d.exec(`ALTER TABLE runs ADD COLUMN context_window_tokens INTEGER`);
  }
  const hasContextWindowPercent = runColumns.some((column) => column.name === 'context_window_percent');
  if (!hasContextWindowPercent) {
    d.exec(`ALTER TABLE runs ADD COLUMN context_window_percent REAL`);
  }
  const hasPipelineId = runColumns.some((column) => column.name === 'pipeline_id');
  if (!hasPipelineId) {
    d.exec(`ALTER TABLE runs ADD COLUMN pipeline_id INTEGER REFERENCES pipelines(id)`);
  }
  const hasStage = runColumns.some((column) => column.name === 'stage');
  if (!hasStage) {
    d.exec(`ALTER TABLE runs ADD COLUMN stage TEXT`);
  }
  const ensureRunColumn = (name: string, sql: string): void => {
    if (!runColumns.some((column) => column.name === name)) {
      d.exec(sql);
      runColumns.push({ name });
    }
  };
  ensureRunColumn('publish_verified', `ALTER TABLE runs ADD COLUMN publish_verified INTEGER`);
  ensureRunColumn('publish_error', `ALTER TABLE runs ADD COLUMN publish_error TEXT`);
  ensureRunColumn('branch_name', `ALTER TABLE runs ADD COLUMN branch_name TEXT`);
  ensureRunColumn('base_branch', `ALTER TABLE runs ADD COLUMN base_branch TEXT`);
  ensureRunColumn('commit_sha', `ALTER TABLE runs ADD COLUMN commit_sha TEXT`);
  ensureRunColumn('remote_branch', `ALTER TABLE runs ADD COLUMN remote_branch TEXT`);
  ensureRunColumn('pr_number', `ALTER TABLE runs ADD COLUMN pr_number INTEGER`);
  ensureRunColumn('pr_url', `ALTER TABLE runs ADD COLUMN pr_url TEXT`);
  ensureRunColumn('model', `ALTER TABLE runs ADD COLUMN model TEXT`);
  ensureRunColumn('effort', `ALTER TABLE runs ADD COLUMN effort TEXT`);
  ensureRunColumn('thinking', `ALTER TABLE runs ADD COLUMN thinking TEXT`);
  ensureRunColumn('tool_name', `ALTER TABLE runs ADD COLUMN tool_name TEXT`);
  ensureRunColumn('tool_version', `ALTER TABLE runs ADD COLUMN tool_version TEXT`);
  ensureRunColumn('pricing_profile_id', `ALTER TABLE runs ADD COLUMN pricing_profile_id TEXT`);
  ensureRunColumn('metrics_confidence', `ALTER TABLE runs ADD COLUMN metrics_confidence TEXT`);
  ensureRunColumn('token_data_quality', `ALTER TABLE runs ADD COLUMN token_data_quality TEXT`);

  const usageColumns = d
    .prepare(`PRAGMA table_info(token_usage)`)
    .all() as { name?: string }[];
  const hasCachedInputUsage = usageColumns.some((column) => column.name === 'cached_input');
  if (!hasCachedInputUsage) {
    d.exec(`ALTER TABLE token_usage ADD COLUMN cached_input INTEGER NOT NULL DEFAULT 0`);
  }
  if (!usageColumns.some((column) => column.name === 'data_quality')) {
    d.exec(`ALTER TABLE token_usage ADD COLUMN data_quality TEXT`);
  }
  if (!usageColumns.some((column) => column.name === 'raw_usage_json')) {
    d.exec(`ALTER TABLE token_usage ADD COLUMN raw_usage_json TEXT`);
  }

  const taskRunColumns = d
    .prepare(`PRAGMA table_info(task_runs)`)
    .all() as { name?: string }[];
  const ensureTaskRunColumn = (name: string, sql: string): void => {
    if (!taskRunColumns.some((column) => column.name === name)) {
      d.exec(sql);
    }
  };
  ensureTaskRunColumn('input_tokens', `ALTER TABLE task_runs ADD COLUMN input_tokens INTEGER NOT NULL DEFAULT 0`);
  ensureTaskRunColumn('cached_input_tokens', `ALTER TABLE task_runs ADD COLUMN cached_input_tokens INTEGER NOT NULL DEFAULT 0`);
  ensureTaskRunColumn('output_tokens', `ALTER TABLE task_runs ADD COLUMN output_tokens INTEGER NOT NULL DEFAULT 0`);
  ensureTaskRunColumn('total_tokens', `ALTER TABLE task_runs ADD COLUMN total_tokens INTEGER NOT NULL DEFAULT 0`);
  ensureTaskRunColumn('token_data_quality', `ALTER TABLE task_runs ADD COLUMN token_data_quality TEXT`);
  ensureTaskRunColumn('context_window_tokens', `ALTER TABLE task_runs ADD COLUMN context_window_tokens INTEGER`);
  ensureTaskRunColumn('context_window_percent', `ALTER TABLE task_runs ADD COLUMN context_window_percent REAL`);

  const runOutputColumns = d
    .prepare(`PRAGMA table_info(run_output)`)
    .all() as { name?: string }[];
  const ensureRunOutputColumn = (name: string, sql: string): void => {
    if (!runOutputColumns.some((column) => column.name === name)) {
      d.exec(sql);
    }
  };
  ensureRunOutputColumn('tool_name', `ALTER TABLE run_output ADD COLUMN tool_name TEXT`);
  ensureRunOutputColumn('level', `ALTER TABLE run_output ADD COLUMN level TEXT`);

  const pipelineColumns = d
    .prepare(`PRAGMA table_info(pipelines)`)
    .all() as { name?: string }[];
  const ensurePipelineColumn = (name: string, sql: string): void => {
    if (!pipelineColumns.some((column) => column.name === name)) {
      d.exec(sql);
      pipelineColumns.push({ name });
    }
  };
  ensurePipelineColumn('cwd', `ALTER TABLE pipelines ADD COLUMN cwd TEXT`);
  ensurePipelineColumn('plan_json', `ALTER TABLE pipelines ADD COLUMN plan_json TEXT NOT NULL DEFAULT '[]'`);
  ensurePipelineColumn('done_json', `ALTER TABLE pipelines ADD COLUMN done_json TEXT NOT NULL DEFAULT '[]'`);
  ensurePipelineColumn('pending_json', `ALTER TABLE pipelines ADD COLUMN pending_json TEXT NOT NULL DEFAULT '[]'`);
  ensurePipelineColumn('active_json', `ALTER TABLE pipelines ADD COLUMN active_json TEXT NOT NULL DEFAULT '[]'`);
  ensurePipelineColumn('aborted_json', `ALTER TABLE pipelines ADD COLUMN aborted_json TEXT NOT NULL DEFAULT '[]'`);
  ensurePipelineColumn('workflow_snapshot_json', `ALTER TABLE pipelines ADD COLUMN workflow_snapshot_json TEXT NOT NULL DEFAULT '{}'`);
  ensurePipelineColumn('requested_abort_feature_id', `ALTER TABLE pipelines ADD COLUMN requested_abort_feature_id TEXT`);
  ensurePipelineColumn('resume_count', `ALTER TABLE pipelines ADD COLUMN resume_count INTEGER NOT NULL DEFAULT 0`);
  ensurePipelineColumn('resume_summary', `ALTER TABLE pipelines ADD COLUMN resume_summary TEXT`);

  const sessionColumns: [string, string][] = [
    ['session_status', `ALTER TABLE runs ADD COLUMN session_status TEXT`],
    ['session_started_at', `ALTER TABLE runs ADD COLUMN session_started_at TEXT`],
    ['session_updated_at', `ALTER TABLE runs ADD COLUMN session_updated_at TEXT`],
    ['session_elapsed_ms', `ALTER TABLE runs ADD COLUMN session_elapsed_ms INTEGER`],
    ['session_last_output_at', `ALTER TABLE runs ADD COLUMN session_last_output_at TEXT`],
    ['session_idle_ms', `ALTER TABLE runs ADD COLUMN session_idle_ms INTEGER`],
    ['session_reason', `ALTER TABLE runs ADD COLUMN session_reason TEXT`],
    ['session_terminal', `ALTER TABLE runs ADD COLUMN session_terminal INTEGER NOT NULL DEFAULT 0`],
    ['adapter_session_tool', `ALTER TABLE runs ADD COLUMN adapter_session_tool TEXT`],
    ['adapter_session_id', `ALTER TABLE runs ADD COLUMN adapter_session_id TEXT`],
  ];
  for (const [name, sql] of sessionColumns) {
    if (!runColumns.some((column) => column.name === name)) {
      d.exec(sql);
      runColumns.push({ name });
    }
  }

  const retryHistoryColumns = d
    .prepare(`PRAGMA table_info(retry_history)`)
    .all() as { name?: string }[];
  const ensureRetryHistoryColumn = (name: string, sql: string): void => {
    if (!retryHistoryColumns.some((column) => column.name === name)) {
      d.exec(sql);
    }
  };
  ensureRetryHistoryColumn('tool', `ALTER TABLE retry_history ADD COLUMN tool TEXT`);
  ensureRetryHistoryColumn('model', `ALTER TABLE retry_history ADD COLUMN model TEXT`);
  backfillRunExecutionSnapshots(d);

  const stageRequestColumns = d
    .prepare(`PRAGMA table_info(stage_requests)`)
    .all() as { name?: string }[];
  const ensureStageRequestColumn = (name: string, sql: string): void => {
    if (!stageRequestColumns.some((column) => column.name === name)) {
      d.exec(sql);
    }
  };
  ensureStageRequestColumn('options', `ALTER TABLE stage_requests ADD COLUMN options TEXT`);

  const epicColumns = d
    .prepare(`PRAGMA table_info(backlog_epics)`)
    .all() as { name?: string }[];
  const ensureEpicColumn = (name: string, sql: string): void => {
    if (!epicColumns.some((column) => column.name === name)) {
      d.exec(sql);
      epicColumns.push({ name });
    }
  };
  ensureEpicColumn('project_id', `ALTER TABLE backlog_epics ADD COLUMN project_id TEXT REFERENCES projects(project_id)`);
  ensureEpicColumn('description', `ALTER TABLE backlog_epics ADD COLUMN description TEXT`);
  ensureEpicColumn('status', `ALTER TABLE backlog_epics ADD COLUMN status TEXT`);
  ensureEpicColumn('deleted_at', `ALTER TABLE backlog_epics ADD COLUMN deleted_at TEXT`);
  ensureEpicColumn('revision', `ALTER TABLE backlog_epics ADD COLUMN revision INTEGER NOT NULL DEFAULT 1`);
  d.exec(`CREATE INDEX IF NOT EXISTS idx_backlog_epics_project ON backlog_epics(project_id)`);
  d.exec(`CREATE INDEX IF NOT EXISTS idx_backlog_epics_deleted_at ON backlog_epics(deleted_at)`);
  d.exec(`CREATE INDEX IF NOT EXISTS idx_backlog_epics_project_lifecycle ON backlog_epics(project_id, archived_at, deleted_at, position)`);

  const repoIdNotnull = (epicColumns.find((c) => c.name === 'repo_id') as { name: string; notnull?: number } | undefined)?.notnull;
  if (repoIdNotnull === 1) {
    d.pragma('foreign_keys = OFF');
    d.exec(`
      DROP TABLE IF EXISTS backlog_epics_new;
      CREATE TABLE backlog_epics_new (
        epic_id     TEXT PRIMARY KEY,
        repo_id     TEXT REFERENCES repos(repo_id),
        title       TEXT NOT NULL,
        position    INTEGER NOT NULL,
        data_json   TEXT NOT NULL,
        archived_at TEXT,
        updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
        project_id  TEXT REFERENCES projects(project_id),
        description TEXT,
        status      TEXT,
        deleted_at  TEXT,
        revision    INTEGER NOT NULL DEFAULT 1
      );
      INSERT INTO backlog_epics_new SELECT * FROM backlog_epics;
      DROP TABLE backlog_epics;
      ALTER TABLE backlog_epics_new RENAME TO backlog_epics;
      CREATE INDEX IF NOT EXISTS idx_backlog_epics_project ON backlog_epics(project_id);
      CREATE INDEX IF NOT EXISTS idx_backlog_epics_deleted_at ON backlog_epics(deleted_at);
      CREATE INDEX IF NOT EXISTS idx_backlog_epics_project_lifecycle ON backlog_epics(project_id, archived_at, deleted_at, position);
    `);
    d.pragma('foreign_keys = ON');
  }

  const backlogFeatureColumns = d
    .prepare(`PRAGMA table_info(backlog_features)`)
    .all() as { name?: string }[];
  const ensureBacklogFeatureColumn = (name: string, sql: string): void => {
    if (!backlogFeatureColumns.some((column) => column.name === name)) {
      d.exec(sql);
      backlogFeatureColumns.push({ name });
    }
  };
  ensureBacklogFeatureColumn('description', `ALTER TABLE backlog_features ADD COLUMN description TEXT`);
  ensureBacklogFeatureColumn('deleted_at', `ALTER TABLE backlog_features ADD COLUMN deleted_at TEXT`);
  ensureBacklogFeatureColumn('revision', `ALTER TABLE backlog_features ADD COLUMN revision INTEGER NOT NULL DEFAULT 1`);
  ensureBacklogFeatureColumn('type', `ALTER TABLE backlog_features ADD COLUMN type TEXT NOT NULL DEFAULT 'feature'`);
  d.exec(`CREATE INDEX IF NOT EXISTS idx_backlog_features_deleted_at ON backlog_features(deleted_at)`);
  d.exec(`CREATE INDEX IF NOT EXISTS idx_backlog_features_repo_epic_lifecycle ON backlog_features(repo_id, epic_id, archived_at, deleted_at, position)`);

  ensureRunColumn('project_id', `ALTER TABLE runs ADD COLUMN project_id TEXT REFERENCES projects(project_id)`);
  d.exec(`CREATE INDEX IF NOT EXISTS idx_runs_project ON runs(project_id)`);
  d.exec(`CREATE INDEX IF NOT EXISTS idx_runs_project_status ON runs(project_id, status, id DESC)`);
  d.exec(`CREATE INDEX IF NOT EXISTS idx_runs_model_confidence ON runs(model, metrics_confidence, started_at DESC)`);

  ensurePipelineColumn('project_id', `ALTER TABLE pipelines ADD COLUMN project_id TEXT REFERENCES projects(project_id)`);
  d.exec(`CREATE INDEX IF NOT EXISTS idx_pipelines_project ON pipelines(project_id)`);
  d.exec(`CREATE INDEX IF NOT EXISTS idx_pipelines_project_feature ON pipelines(project_id, feature_id)`);

  seedBuiltinWorkflowTemplates(d);
}

/**
 * Seeds the builtin workflow templates (PRJ-23).
 *
 * Idempotent by construction: builtins carry stable ids and `DO NOTHING` on
 * conflict, so repeated `migrate()` calls neither duplicate nor overwrite them.
 * Builtins are immutable — a user customises one by duplicating it into a
 * Project scope.
 */
function seedBuiltinWorkflowTemplates(d: Database.Database): void {
  const insert = d.prepare(
    `INSERT INTO workflow_templates (template_id, scope_project_id, name, definition_json, version, builtin)
     VALUES (?, NULL, ?, ?, 1, 1)
     ON CONFLICT(template_id) DO NOTHING`,
  );
  for (const template of BUILTIN_WORKFLOW_TEMPLATES) {
    insert.run(template.templateId, template.name, JSON.stringify(template.definition));
  }
}

function toDbAccessError(error: unknown, dbPath: string): Error {
  if (error instanceof DbAccessError) return error;

  const message = error instanceof Error ? error.message : String(error);
  if (
    message.includes('readonly database')
    || message.includes('SQLITE_READONLY')
    || message.includes('SQLITE_CANTOPEN')
    || message.includes('SQLITE_PERM')
  ) {
    return new DbAccessError(
      dbPath,
      `Falha ao abrir o banco em modo leitura/escrita: ${message}`,
    );
  }

  return error instanceof Error ? error : new Error(message);
}
