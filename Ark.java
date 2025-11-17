///usr/bin/env jbang "$0" "$@" ; exit $?
// Usage: java Ark.java <filePaths> <backupDir>
// Usage with JBang: jbang Ark.java <filePaths> <backupDir>
// Example: java Ark.java /path/to/xy.db /opt/backup
// Example: java Ark.java /path/to/xy.db,/path/to/xy.sql /opt/backup
// With debug: DEBUG=1 java Ark.java /path/to/xy.db /opt/backup

import java.io.*;
import java.nio.file.*;
import java.time.*;
import java.time.format.DateTimeFormatter;
import java.time.temporal.TemporalAdjusters;
import java.util.*;
import java.util.stream.Collectors;
import java.util.zip.*;

public class Ark {
    private static final boolean DEBUG = "1".equals(System.getenv("DEBUG"));
    private static final DateTimeFormatter FMT = DateTimeFormatter.ofPattern("yyyyMMdd");

    private static void log(Object... args) {
        if (DEBUG) System.out.println(Arrays.stream(args).map(String::valueOf).collect(Collectors.joining(" ")));
    }

    private static void createBackup(List<String> filePaths, String backupDir) throws IOException {
        LocalDate now = LocalDate.now();
        String filename = "export" + now.format(FMT) + ".zip";
        Path outputPath = Paths.get(backupDir, filename);

        if (Files.exists(outputPath)) {
            System.out.println("Backup " + filename + " already exists. Skipping creation.");
            return;
        }

        long start = System.nanoTime();
        try (ZipOutputStream zos = new ZipOutputStream(new FileOutputStream(outputPath.toFile()))) {
            for (String filePath : filePaths) {
                Path path = Paths.get(filePath);
                ZipEntry entry = new ZipEntry(path.getFileName().toString());
                zos.putNextEntry(entry);
                Files.copy(path, zos);
                zos.closeEntry();
            }
        }
        double elapsed = (System.nanoTime() - start) / 1_000_000_000.0;
        System.out.printf("Created backup: %s (%.3fs)%n", filename, elapsed);
    }

    private static void rotateBackups(String backupDir) throws IOException {
        log("[DEBUG] Starting rotateBackups");
        LocalDate now = LocalDate.now();
        List<Path> files = Files.list(Paths.get(backupDir))
            .filter(p -> p.getFileName().toString().startsWith("export") && p.getFileName().toString().endsWith(".zip"))
            .collect(Collectors.toList());
        log("[DEBUG] Backup files found:", files.size());

        Set<String> toKeep = new HashSet<>();

        // Daily: last 7 days
        log("[DEBUG] Processing daily backups");
        for (int i = 0; i < 7; i++) {
            toKeep.add("export" + now.minusDays(i).format(FMT) + ".zip");
        }

        // Weekly: Sundays in current month
        log("[DEBUG] Processing weekly backups");
        LocalDate weekEnd = now.minusDays(7).with(TemporalAdjusters.nextOrSame(DayOfWeek.SUNDAY));
        LocalDate monthStart = now.withDayOfMonth(1);
        int weekCount = 0;
        while (weekEnd.getMonth() == now.getMonth() && !weekEnd.isBefore(monthStart) && weekCount < 10) {
            toKeep.add("export" + weekEnd.format(FMT) + ".zip");
            weekEnd = weekEnd.minusDays(7).with(TemporalAdjusters.nextOrSame(DayOfWeek.SUNDAY));
            weekCount++;
        }

        // Monthly: last day of previous months in current year
        log("[DEBUG] Processing monthly backups");
        for (int m = 1; m < now.getMonthValue(); m++) {
            LocalDate monthEnd = now.minusMonths(m).with(TemporalAdjusters.lastDayOfMonth());
            toKeep.add("export" + monthEnd.format(FMT) + ".zip");
        }

        // Yearly: Dec 31 of previous years
        log("[DEBUG] Processing yearly backups");
        if (!files.isEmpty()) {
            int minYear = files.stream()
                .map(p -> p.getFileName().toString().substring(6, 10))
                .mapToInt(Integer::parseInt)
                .min().orElse(now.getYear());
            for (int y = minYear; y < now.getYear(); y++) {
                LocalDate yearEnd = LocalDate.of(y, 12, 31);
                toKeep.add("export" + yearEnd.format(FMT) + ".zip");
            }
        }

        // Delete files not in toKeep
        log("[DEBUG] Processing deletions");
        for (Path file : files) {
            String filename = file.getFileName().toString();
            if (!toKeep.contains(filename)) {
                Files.delete(file);
                System.out.println("Deleted old backup: " + filename);
            }
        }
        log("[DEBUG] rotateBackups completed");
    }

    public static void main(String[] args) {
        if (args.length < 2) {
            System.err.println("Usage: java Ark.java <filePath1[,filePath2,...]> <backupDir>");
            System.err.println("Example: java Ark.java /path/to/xy.db /opt/backup");
            System.err.println("Example: java Ark.java /path/to/xy.db,/path/to/xy.sql /opt/backup");
            System.exit(1);
        }

        List<String> filePaths = Arrays.stream(args[0].split(","))
            .map(String::trim)
            .collect(Collectors.toList());
        String backupDir = args[1];

        try {
            Files.createDirectories(Paths.get(backupDir));
            createBackup(filePaths, backupDir);
            rotateBackups(backupDir);
            System.out.println("Backup and rotation completed.");
            System.exit(0);
        } catch (Exception e) {
            System.err.println("Error: " + e.getMessage());
            e.printStackTrace();
            System.exit(1);
        }
    }
}
