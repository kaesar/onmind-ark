# OnMind-ARK

> Rotative backup script with daily, weekly, monthly, and yearly retention.

This is a rotative backup script created for [**OnMind-XDB**](https://github.com/kaesar/onmind-xdb) (eXpress Database) and it's useful for others projects. It compresses specified files into zip archives and organizes them with a retention policy that includes daily, weekly, monthly, and yearly backups. The script is designed to be run via command line and scheduled with cron for automated backups (for Linux and macOS).

## Install dependencies

```bash
bun install
```

## Run

**Single file:**
```bash
node ark.js /path/to/file.db /backup/dir
```

**Multiple files:**
```bash
node ark.js /path/to/xy.db,/path/to/xy.sql /backup/dir
```

**With debug:**
```bash
DEBUG=1 node ark.js /path/to/file.db /backup/dir
```

## Compile to binary

**Linux x64:**
```bash
bun build --compile --target=bun-linux-x64 ./ark.js --outfile ark
```

**Linux ARM64:**
```bash
bun build --compile --target=bun-linux-arm64 ./ark.js --outfile ark
```

**Current platform:**
```bash
bun build --compile ./ark.js --outfile ark
```

## Execute binary

```bash
./ark /path/to/xy.db,/path/to/xy.sql /backup/dir
```

## Retention policy for backups and schedule with cron

- **Daily**: Last 7 days
- **Weekly**: Sundays of current month
- **Monthly**: Last day of each month in current year
- **Yearly**: December 31st of previous years

**Run daily at 11:55 PM:**
```bash
55 23 * * * /usr/bin/node /path/to/ark.js /path/to/xy.db,/path/to/xy.sql /backup/dir
```

**Using compiled binary:**
```bash
55 23 * * * /path/to/ark /path/to/xy.db,/path/to/xy.sql /backup/dir
```

**Edit crontab:**
```bash
crontab -e
```

## About ark-zip.js

`ark-zip.js` is the alternative to `ark.js` without dependencies and thinked to use the `zip` command invoked with shell from the script (for Linux and macOS). With this it's not necesary to compile the script, just used directly with the system.
