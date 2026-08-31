/* ==============================================================================
   Disha Automated Database Migration Runner
   Sequentially and idempotently applies database migrations inside transactions.
   Tracks migration state in `schema_migrations` table. Fail-safe: rolls back on error.
   ============================================================================== */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { db } from '../config/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MIGRATIONS_DIR = path.resolve(__dirname, '../migrations');

export async function runMigrations() {
  console.log('================================================================================');
  console.log('DISHA POSTGRESQL AUTOMATED MIGRATION RUNNER');
  console.log('================================================================================\n');

  try {
    // 1. Ensure tracking table exists
    await db.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 2. Query applied migrations
    const appliedRes = await db.query('SELECT version FROM schema_migrations ORDER BY version ASC');
    const appliedVersions = new Set(appliedRes.rows.map(r => r.version));

    // 3. Scan migrations directory
    const files = fs.readdirSync(MIGRATIONS_DIR)
      .filter(f => f.endsWith('.sql'))
      .sort();

    console.log(`[Migrations] Found ${files.length} migration file(s) in ${MIGRATIONS_DIR}`);

    let appliedCount = 0;
    let skippedCount = 0;

    for (const file of files) {
      if (appliedVersions.has(file)) {
        console.log(`  [SKIPPED] ${file} (Already applied)`);
        skippedCount++;
        continue;
      }

      const filePath = path.join(MIGRATIONS_DIR, file);
      const sql = fs.readFileSync(filePath, 'utf-8');

      console.log(`  [APPLYING] ${file}...`);

      // 4. Execute inside a transactional block
      await db.transaction(async (client) => {
        // Execute migration SQL
        await client.query(sql);

        // Record migration in schema_migrations
        await client.query(
          'INSERT INTO schema_migrations (version, applied_at) VALUES ($1, NOW()) ON CONFLICT (version) DO NOTHING',
          [file]
        );
      });

      console.log(`  [SUCCESS] ${file} applied successfully.`);
      appliedCount++;
    }

    console.log('\n================================================================================');
    console.log(`MIGRATION SUMMARY: ${appliedCount} applied, ${skippedCount} skipped, total ${files.length} files.`);
    console.log('================================================================================\n');

    return { success: true, appliedCount, skippedCount, total: files.length };
  } catch (err) {
    console.error('\n[FATAL MIGRATION ERROR]: Transaction rolled back. Reason:', err.message);
    throw err;
  }
}

if (process.argv[1] && process.argv[1].endsWith('migrate.js')) {
  runMigrations()
    .then(() => {
      db.close();
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      db.close();
      process.exit(1);
    });
}
