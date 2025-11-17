// Script for database backup and rotation
// Usage: node ark.js <filePaths> <backupDir>
// Example: node ark.js /path/to/xy.db /opt/backup
// Example: node ark.js /path/to/xy.db,/path/to/xy.sql /opt/backup
// Dependencies: npm install adm-zip
// bun build --compile --target=bun-linux-x64 ./ark.js --outfile ark
// Schedule with cron: 55 23 * * * /usr/bin/node /path/to/ark.js /path/to/xy.db,/path/to/xy.sql /opt/backup

const fs = require('fs/promises');
const path = require('path');
const AdmZip = require('adm-zip');

const DEBUG = process.env.DEBUG === '1';
const log = (...args) => DEBUG && console.log(...args);

const format = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
};

const parse = (str) => {
  const y = parseInt(str.slice(0, 4));
  const m = parseInt(str.slice(4, 6)) - 1;
  const d = parseInt(str.slice(6, 8));
  return new Date(y, m, d);
};

const subDays = (date, days) => new Date(date.getTime() - days * 86400000);
const startOfMonth = (date) => new Date(date.getFullYear(), date.getMonth(), 1);
const endOfMonth = (date) => new Date(date.getFullYear(), date.getMonth() + 1, 0);
const endOfYear = (date) => new Date(date.getFullYear(), 11, 31);
const isSameMonth = (d1, d2) => d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth();
const endOfWeek = (date) => {
  const day = date.getDay();
  const diff = day === 0 ? 0 : 7 - day;
  return new Date(date.getTime() + diff * 86400000);
};

async function createBackup(filePaths, backupDir) {
  const now = new Date();
  const filename = `export${format(now)}.zip`;
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
  const zip = new AdmZip();
  filePaths.forEach(filePath => zip.addLocalFile(filePath));
  zip.writeZip(outputPath);
  const elapsed = ((performance.now() - startTime) / 1000).toFixed(3);
  console.log(`Created backup: ${filename} (${elapsed}s)`);
}

async function rotateBackups(backupDir) {
  log('[DEBUG] Starting rotateBackups');
  const now = new Date();
  const files = await fs.readdir(backupDir);
  log('[DEBUG] Files read:', files.length);
  const backupFiles = files.filter(f => f.startsWith('export') && f.endsWith('.zip'));
  log('[DEBUG] Backup files found:', backupFiles.length);

  const backups = backupFiles.map(f => {
    const dateStr = f.slice(6, -4); // exportYYYYMMdd.zip -> YYYYMMdd
    const date = parse(dateStr);
    return { file: f, date, year: date.getFullYear() };
  }).filter(b => !isNaN(b.date.getTime()));

  const toKeep = new Set();

  // Keep daily for last 7 days (today - 6 days)
  log('[DEBUG] Processing daily backups');
  for (let i = 0; i < 7; i++) {
    const d = subDays(now, i);
    const key = `export${format(d)}.zip`;
    toKeep.add(key);
  }
  log('[DEBUG] Daily backups processed');

  // Keep weekly (end of week: Sunday) for earlier in current month
  log('[DEBUG] Processing weekly backups');
  const currentMonthStart = startOfMonth(now);
  let weekEndDate = endOfWeek(subDays(now, 7));
  let weekCount = 0;
  while (isSameMonth(weekEndDate, now) && weekEndDate >= currentMonthStart && weekCount < 10) {
    const key = `export${format(weekEndDate)}.zip`;
    toKeep.add(key);
    weekEndDate = endOfWeek(subDays(weekEndDate, 7));
    weekCount++;
  }
  log('[DEBUG] Weekly backups processed');

  // Keep monthly (last day of month) for previous months in current year
  log('[DEBUG] Processing monthly backups');
  for (let m = 1; m < now.getMonth() + 1; m++) {
    const prevMonthEnd = endOfMonth(new Date(now.getFullYear(), now.getMonth() - m, 1));
    const key = `export${format(prevMonthEnd)}.zip`;
    toKeep.add(key);
  }
  log('[DEBUG] Monthly backups processed');

  // Keep yearly (Dec 31) for previous years, based on existing backups
  log('[DEBUG] Processing yearly backups');
  if (backups.length > 0) {
    const minYear = Math.min(...backups.map(b => b.year));
    for (let y = minYear; y < now.getFullYear(); y++) {
      const yearEnd = endOfYear(new Date(y, 0, 1));
      const key = `export${format(yearEnd)}.zip`;
      toKeep.add(key);
    }
  }
  log('[DEBUG] Yearly backups processed');

  // Delete files not in toKeep
  log('[DEBUG] Processing deletions');
  for (const { file } of backups) {
    if (!toKeep.has(file)) {
      const filePath = path.join(backupDir, file);
      await fs.unlink(filePath);
      console.log(`Deleted old backup: ${file}`);
    }
  }
  log('[DEBUG] rotateBackups completed');
}

async function main() {
  const filePathsArg = process.argv[2];
  const backupDir = process.argv[3];

  if (!filePathsArg || !backupDir) {
    console.error('Usage: node ark.js <filePath1[,filePath2,...]> <backupDir>');
    console.error('Example: node ark.js /path/to/xy.db /opt/backup');
    console.error('Example: node ark.js /path/to/xy.db,/path/to/xy.sql /opt/backup');
    process.exit(1);
  }

  const filePaths = filePathsArg.split(',').map(f => f.trim());

  try {
    await fs.mkdir(backupDir, { recursive: true });
    await createBackup(filePaths, backupDir);
    await rotateBackups(backupDir);
    console.log('Backup and rotation completed.');
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main();
