/* ==============================================================================
   Disha Database Backup & Schema Export Utility
   Creates snapshot backups of database state and verifies backup readiness.
   ============================================================================== */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { db } from '../config/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BACKUPS_DIR = path.resolve(__dirname, '../../backups');

export async function createDatabaseBackup() {
  if (!fs.existsSync(BACKUPS_DIR)) {
    fs.mkdirSync(BACKUPS_DIR, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFile = path.join(BACKUPS_DIR, `disha_backup_${timestamp}.json`);

  console.log(`[Backup] Initiating database snapshot to: ${backupFile}`);

  try {
    const backupData = {
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      schema_version: '003',
      tables: {}
    };

    const tables = [
      'users',
      'user_sessions',
      'question_categories',
      'questions',
      'quizzes',
      'quiz_attempts',
      'submitted_answers',
      'wallets',
      'wallet_transactions',
      'payment_orders',
      'withdrawals',
      'audit_logs',
      'schema_migrations'
    ];

    for (const table of tables) {
      try {
        const res = await db.query(`SELECT * FROM ${table}`);
        backupData.tables[table] = res.rows || [];
      } catch (e) {
        // Table may not exist yet if unmigrated
        backupData.tables[table] = [];
      }
    }

    fs.writeFileSync(backupFile, JSON.stringify(backupData, null, 2), 'utf-8');
    console.log(`[Backup] Successfully exported database state to ${backupFile}`);
    return { success: true, backupFile, recordCounts: Object.fromEntries(Object.entries(backupData.tables).map(([k, v]) => [k, v.length])) };
  } catch (err) {
    console.error('[Backup Error]:', err.message);
    throw err;
  }
}

if (process.argv[1] && process.argv[1].endsWith('backup.js')) {
  createDatabaseBackup()
    .then((res) => {
      console.log('Backup result:', res);
      db.close();
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      db.close();
      process.exit(1);
    });
}
