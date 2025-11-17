// Script for database backup and rotation
// Usage: node backup.js <dbPath> <backupDir>
// Example: node backup.js /path/to/xy.db /opt/backup
// Dependencies: npm install archiver date-fns
// Schedule with cron: 55 23 * * * /usr/bin/node /path/to/backup.js /path/to/xy.db /opt/backup

const fs = require('fs/promises');
const path = require('path');
const archiver = require('archiver');
const { 
  format, 
  parse, 
  subDays, 
  startOfMonth, 
  endOfWeek, 
  isSameMonth, 
  addMonths, 
  endOfMonth, 
  isSameYear, 
  endOfYear 
} = require('date-fns');

async function createBackup(dbPath, backupDir) {
  const now = new Date();
  const filename = `export${format(now, 'yyyyMMdd')}.zip`;
  const outputPath = path.join(backupDir, filename);

  // Check if today's backup already exists; skip if it does
  try {
    await fs.access(outputPath);
    console.log(`Backup ${filename} already exists. Skipping creation.`);
    return;
  } catch {
    // Proceed to create
  }

  const startTime = performance.now();
  const output = require('fs').createWriteStream(outputPath);
  const archive = archiver('zip', { zlib: { level: 9 } });

  return new Promise((resolve, reject) => {
    archive.on('error', reject);
    output.on('close', () => {
      const elapsed = ((performance.now() - startTime) / 1000).toFixed(3);
      console.log(`Created backup: ${filename} ( ${elapsed}s )`);
      resolve();
    });

    archive.pipe(output);
    archive.file(dbPath, { name: path.basename(dbPath) });
    archive.finalize();
  });
}

async function rotateBackups(backupDir) {
  const now = new Date();
  const files = await fs.readdir(backupDir);
  const backupFiles = files.filter(f => f.startsWith('export') && f.endsWith('.zip'));

  const backups = backupFiles.map(f => {
    const dateStr = f.slice(6, -4); // exportYYYYMMdd.zip -> YYYYMMdd
    const date = parse(dateStr, 'yyyyMMdd', new Date());
    return { file: f, date, year: date.getFullYear() };
  }).filter(b => !isNaN(b.date.getTime()));

  const toKeep = new Set();

  // Options for week: start on Monday, end on Sunday
  const weekOptions = { weekStartsOn: 1 };

  // Keep daily for last 7 days (today - 6 days)
  for (let i = 0; i < 7; i++) {
    const d = subDays(now, i);
    const key = `export${format(d, 'yyyyMMdd')}.zip`;
    toKeep.add(key);
  }

  // Keep weekly (end of week: Sunday) for earlier in current month
  const currentMonthStart = startOfMonth(now);
  let weekEndDate = endOfWeek(subDays(now, 7), weekOptions); // End of previous week
  while (isSameMonth(weekEndDate, now) && weekEndDate >= currentMonthStart) {
    const key = `export${format(weekEndDate, 'yyyyMMdd')}.zip`;
    toKeep.add(key);
    weekEndDate = endOfWeek(subDays(weekEndDate, 7), weekOptions);
  }

  // Keep monthly (last day of month) for previous months in current year
  let prevMonthEnd = endOfMonth(addMonths(now, -1));
  while (isSameYear(prevMonthEnd, now) && prevMonthEnd < startOfMonth(now)) {
    const key = `export${format(prevMonthEnd, 'yyyyMMdd')}.zip`;
    toKeep.add(key);
    prevMonthEnd = endOfMonth(addMonths(prevMonthEnd, -1));
  }

  // Keep yearly (Dec 31) for previous years, based on existing backups
  if (backups.length > 0) {
    const minYear = Math.min(...backups.map(b => b.year));
    for (let y = minYear; y < now.getFullYear(); y++) {
      const yearEnd = endOfYear(new Date(y, 0, 1));
      const key = `export${format(yearEnd, 'yyyyMMdd')}.zip`;
      toKeep.add(key);
    }
  }

  // Delete files not in toKeep
  for (const { file } of backups) {
    if (!toKeep.has(file)) {
      const filePath = path.join(backupDir, file);
      await fs.unlink(filePath);
      console.log(`Deleted old backup: ${file}`);
    }
  }
}

async function main() {
  const dbPath = process.argv[2];
  const backupDir = process.argv[3];

  if (!dbPath || !backupDir) {
    console.error('Usage: node backup.js <dbPath> <backupDir>');
    process.exit(1);
  }

  try {
    await fs.mkdir(backupDir, { recursive: true });
    await createBackup(dbPath, backupDir);
    await rotateBackups(backupDir);
    console.log('Backup and rotation completed.');
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main();
