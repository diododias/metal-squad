import { homedir } from 'node:os';
import { join } from 'node:path';
import { backupDb } from '../dist/db/backup.js';

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = join(homedir(), '.config', 'metal-squad', 'backup', timestamp);
const backupPath = join(backupDir, 'app.db');

await backupDb(backupPath);
console.log(`SQLite backup created at ${backupPath}`);
