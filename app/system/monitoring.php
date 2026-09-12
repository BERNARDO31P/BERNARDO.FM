<?php

declare(strict_types = 1);

$maxAmount            = 43800;
$masterUpdateInterval = 300;

$rangeIntervals = [
    4          => 1,
    60         => 2,
    300        => 5,
    1440       => 15,
    10080      => 60,
    $maxAmount => 300,
];

$dbDirectory = __DIR__ . "/db";
$dbFile      = $dbDirectory . "/monitoring.json";

if (!is_dir($dbDirectory)) {
    if (!mkdir($dbDirectory, 0755, true) && !is_dir($dbDirectory)) {
        throw new RuntimeException(
            "Unable to create database directory: " . $dbDirectory
        );
    }
}

/*
 * Funktion: write_json_file_atomic()
 * Autor: Bernardo de Oliveira
 *
 * Schreibt JSON Daten atomar in eine Datei
 */
function write_json_file_atomic(string $file, array $data): void
{
    $json = json_encode($data);

    if ($json === false) {
        throw new RuntimeException(
            "Unable to encode JSON: " . json_last_error_msg()
        );
    }

    $temporaryFile = $file . ".tmp";

    $bytesWritten = file_put_contents(
        $temporaryFile,
        $json,
        LOCK_EX
    );

    if ($bytesWritten === false || $bytesWritten !== strlen($json)) {
        @unlink($temporaryFile);

        throw new RuntimeException(
            "Unable to completely write temporary file: " . $temporaryFile
        );
    }

    if (!rename($temporaryFile, $file)) {
        @unlink($temporaryFile);

        throw new RuntimeException(
            "Unable to replace file: " . $file
        );
    }
}

/*
 * Funktion: load_json_file()
 * Autor: Bernardo de Oliveira
 *
 * Liest eine JSON Datei ein
 */
function load_json_file(string $file): array
{
    if (!is_file($file)) {
        return [];
    }

    $contents = file_get_contents($file);

    if ($contents === false || $contents === "") {
        return [];
    }

    $data = json_decode($contents, true);

    return is_array($data) ? $data : [];
}

/*
 * Funktion: normalise_monitoring_data()
 * Autor: Bernardo de Oliveira
 *
 * Bereinigt die Monitoring Daten und sortiert diese chronologisch
 */
function normalise_monitoring_data(array $data): array
{
    $normalised = [];

    foreach ($data as $timestamp => $sample) {
        $timestamp = (int)$timestamp;

        if ($timestamp <= 0 || !is_array($sample)) {
            continue;
        }

        if (
            !isset($sample["network"])
            || !is_array($sample["network"])
            || !isset(
                $sample["network"]["down"],
                $sample["network"]["up"],
                $sample["cpu"],
                $sample["ram"]
            )
        ) {
            continue;
        }

        $normalised[$timestamp] = $sample;
    }

    ksort($normalised, SORT_NUMERIC);

    return $normalised;
}

/*
 * Funktion: prune_monitoring_data()
 * Autor: Bernardo de Oliveira
 *
 * Entfernt abgelaufene Werte aus der Master Datenbank
 */
function prune_monitoring_data(array &$data, int $cutoff): void
{
    foreach ($data as $timestamp => $_sample) {
        if ((int)$timestamp >= $cutoff) {
            break;
        }

        unset($data[$timestamp]);
    }
}

/*
 * Funktion: create_empty_range()
 * Autor: Bernardo de Oliveira
 *
 * Erstellt eine leere komprimierte Monitoring Range
 */
function create_empty_range(): array
{
    return [
        "series" => [
            "down" => [],
            "up"   => [],
            "cpu"  => [],
            "ram"  => [],
        ],
        "bucket_start" => null,
        "bucket"       => [],
    ];
}

/*
 * Funktion: get_monitoring_values()
 * Autor: Bernardo de Oliveira
 *
 * Holt die einzelnen Messwerte aus einem Monitoring Sample
 */
function get_monitoring_values(array $sample): ?array
{
    if (
        !isset($sample["network"])
        || !is_array($sample["network"])
        || !isset(
            $sample["network"]["down"],
            $sample["network"]["up"],
            $sample["cpu"],
            $sample["ram"]
        )
    ) {
        return null;
    }

    $values = [
        "down" => $sample["network"]["down"],
        "up"   => $sample["network"]["up"],
        "cpu"  => $sample["cpu"],
        "ram"  => $sample["ram"],
    ];

    foreach ($values as &$value) {
        if (!is_numeric($value)) {
            return null;
        }

        $value = (float)$value;

        if (!is_finite($value)) {
            return null;
        }
    }

    unset($value);

    return $values;
}

/*
 * Funktion: add_range_sample()
 * Autor: Bernardo de Oliveira
 *
 * Fügt einen Messwert zur entsprechenden Zeitgruppe hinzu
 * Innerhalb einer Zeitgruppe werden Durchschnitt, Minimum und Maximum gesammelt
 */
function add_range_sample(
    array &$range,
    int $timestamp,
    array $sample,
    int $interval
): void {
    $values = get_monitoring_values($sample);

    if ($values === null) {
        return;
    }

    $bucketStart = intdiv($timestamp, $interval) * $interval;

    if ($range["bucket_start"] === null) {
        $range["bucket_start"] = $bucketStart;
    } elseif ($range["bucket_start"] !== $bucketStart) {
        finalise_range_bucket($range);

        $range["bucket_start"] = $bucketStart;
    }

    foreach ($values as $metric => $value) {
        if (!isset($range["bucket"][$metric])) {
            $range["bucket"][$metric] = [
                "first_time" => $timestamp,
                "last_time"  => $timestamp,
                "sum"        => $value,
                "count"      => 1,
                "min"        => $value,
                "max"        => $value,
            ];

            continue;
        }

        $range["bucket"][$metric]["last_time"] = $timestamp;
        $range["bucket"][$metric]["sum"] += $value;
        $range["bucket"][$metric]["count"]++;

        if ($value < $range["bucket"][$metric]["min"]) {
            $range["bucket"][$metric]["min"] = $value;
        }

        if ($value > $range["bucket"][$metric]["max"]) {
            $range["bucket"][$metric]["max"] = $value;
        }
    }
}

/*
 * Funktion: finalise_range_bucket()
 * Autor: Bernardo de Oliveira
 *
 * Speichert pro Zeitgruppe genau einen Durchschnittswert
 * Minimum und Maximum bleiben als Zusatzinformationen erhalten
 */
function finalise_range_bucket(array &$range): void
{
    if (!$range["bucket"]) {
        $range["bucket_start"] = null;
        return;
    }

    foreach ($range["bucket"] as $metric => $bucket) {
        $count = max(1, (int)$bucket["count"]);

        /*
         * Der Timestamp liegt in der Mitte der tatsächlich vorhandenen
         * Messwerte des Buckets.
         */
        $timestamp = (int)round(
            (
                (int)$bucket["first_time"]
                + (int)$bucket["last_time"]
            ) / 2
        );

        $average = round(
            (float)$bucket["sum"] / $count,
            2
        );

        /*
         * Format:
         *
         * [timestamp, average, min, max]
         */
        $range["series"][$metric][] = [
            $timestamp,
            $average,
            round((float)$bucket["min"], 2),
            round((float)$bucket["max"], 2),
        ];
    }

    $range["bucket_start"] = null;
    $range["bucket"] = [];
}

/*
 * Funktion: prune_range_series()
 * Autor: Bernardo de Oliveira
 *
 * Entfernt abgelaufene Punkte aus einer komprimierten Range
 */
function prune_range_series(array &$range, int $cutoff): void
{
    foreach ($range["series"] as $metric => $points) {
        $firstValid = 0;
        $pointCount = count($points);

        while (
            $firstValid < $pointCount
            && isset($points[$firstValid][0])
            && (int)$points[$firstValid][0] < $cutoff
        ) {
            $firstValid++;
        }

        if ($firstValid > 0) {
            $range["series"][$metric] = array_slice(
                $points,
                $firstValid
            );
        }
    }
}

/*
 * Funktion: export_range_data()
 * Autor: Bernardo de Oliveira
 *
 * Erstellt die kompakte JSON Struktur für das Frontend
 * Pro Bucket wird genau ein Durchschnittswert ausgegeben
 */
function export_range_data(array $range, int $interval, int $cutoff): array
{
    $series = $range["series"];

    foreach ($series as $metric => $points) {
        $seen = [];

        foreach ($points as $point) {
            if (
                !is_array($point)
                || count($point) < 4
            ) {
                continue;
            }

            $timestamp = (int)$point[0];

            if ($timestamp < $cutoff) {
                continue;
            }

            $seen[$timestamp] = [
                $timestamp,
                (float)$point[1],
                (float)$point[2],
                (float)$point[3],
            ];
        }

        ksort($seen, SORT_NUMERIC);

        $series[$metric] = array_values($seen);
    }

    return [
        "version"  => 3,
        "interval" => $interval,
        "series"   => $series,
    ];
}

/*
 * Funktion: load_range_file()
 * Autor: Bernardo de Oliveira
 *
 * Liest eine bereits konvertierte Range Datei ein
 * Alte Version 2 Dateien werden absichtlich neu aus dem Master aufgebaut
 */
function load_range_file(string $file): ?array
{
    $data = load_json_file($file);

    if (
        ($data["version"] ?? null) !== 3
        || !isset($data["series"])
        || !is_array($data["series"])
    ) {
        return null;
    }

    $range = create_empty_range();

    foreach (["down", "up", "cpu", "ram"] as $metric) {
        if (
            !isset($data["series"][$metric])
            || !is_array($data["series"][$metric])
        ) {
            continue;
        }

        foreach ($data["series"][$metric] as $point) {
            if (
                !is_array($point)
                || count($point) < 4
                || !is_numeric($point[0])
                || !is_numeric($point[1])
                || !is_numeric($point[2])
                || !is_numeric($point[3])
            ) {
                continue;
            }

            $range["series"][$metric][] = [
                (int)$point[0],
                (float)$point[1],
                (float)$point[2],
                (float)$point[3],
            ];
        }
    }

    return $range;
}

/*
 * Funktion: get_latest_range_timestamp()
 * Autor: Bernardo de Oliveira
 *
 * Holt den neuesten Timestamp einer komprimierten Range
 */
function get_latest_range_timestamp(array $range): ?int
{
    $latest = null;

    foreach ($range["series"] as $points) {
        if (!$points) {
            continue;
        }

        $point = $points[count($points) - 1];

        if (!isset($point[0])) {
            continue;
        }

        $timestamp = (int)$point[0];

        if ($latest === null || $timestamp > $latest) {
            $latest = $timestamp;
        }
    }

    return $latest;
}

/*
 * Funktion: remove_range_points_after()
 * Autor: Bernardo de Oliveira
 *
 * Entfernt Punkte ab einem bestimmten Timestamp
 * Wird beim Start benutzt, damit der letzte Bucket sauber neu aufgebaut wird
 */
function remove_range_points_after(array &$range, int $timestamp): void
{
    foreach ($range["series"] as $metric => $points) {
        $result = [];

        foreach ($points as $point) {
            if (!isset($point[0])) {
                continue;
            }

            if ((int)$point[0] >= $timestamp) {
                break;
            }

            $result[] = $point;
        }

        $range["series"][$metric] = $result;
    }
}

/*
 * Funktion: prepare_range()
 * Autor: Bernardo de Oliveira
 *
 * Lädt eine bestehende kompakte Range oder baut diese aus dem Master neu auf
 */
function prepare_range(
    string $file,
    array $masterDatabase,
    int $allowedAmount,
    int $interval,
    int $now
): array {
    $cutoff = $now - ($allowedAmount * 60);
    $range = load_range_file($file);

    if ($range === null) {
        $range = create_empty_range();
        $rebuildStart = $cutoff;
    } else {
        $latestTimestamp = get_latest_range_timestamp($range);

        if ($latestTimestamp === null) {
            $rebuildStart = $cutoff;
        } else {
            $rebuildStart = max(
                $cutoff,
                intdiv($latestTimestamp, $interval) * $interval
            );
        }

        remove_range_points_after(
            $range,
            $rebuildStart
        );
    }

    foreach ($masterDatabase as $timestamp => $sample) {
        $timestamp = (int)$timestamp;

        if ($timestamp < $rebuildStart) {
            continue;
        }

        add_range_sample(
            $range,
            $timestamp,
            $sample,
            $interval
        );
    }

    prune_range_series(
        $range,
        $cutoff
    );

    return $range;
}

/*
 * Funktion: get_server_memory_usage()
 * Autor: Bernardo de Oliveira
 *
 * Holt die aktuelle RAM Auslastung
 */
function get_server_memory_usage(): ?float
{
    $free = @file_get_contents(__DIR__ . "/data/free");

    if ($free === false) {
        return null;
    }

    $lines = explode("\n", trim($free));

    if (!isset($lines[1])) {
        return null;
    }

    $parts = preg_split("/\s+/", trim($lines[1]));

    if (
        !is_array($parts)
        || count($parts) < 3
        || !is_numeric($parts[1])
        || !is_numeric($parts[2])
    ) {
        return null;
    }

    $total = (float)$parts[1];
    $used = (float)$parts[2];

    if ($total <= 0) {
        return null;
    }

    $value = ($used / $total) * 100;

    if ($value < 0 || !is_finite($value)) {
        return null;
    }

    return round(min($value, 100), 2);
}

/*
 * Funktion: read_cpu_snapshot()
 * Autor: Bernardo de Oliveira
 *
 * Liest die CPU Counter ein
 */
function read_cpu_snapshot(): ?array
{
    $stat = @file(__DIR__ . "/data/stat");

    if ($stat === false || !isset($stat[0])) {
        return null;
    }

    $parts = preg_split("/\s+/", trim($stat[0]));

    if (
        !is_array($parts)
        || count($parts) < 8
        || $parts[0] !== "cpu"
    ) {
        return null;
    }

    $values = [];

    for ($index = 1; $index <= 7; $index++) {
        if (!isset($parts[$index]) || !is_numeric($parts[$index])) {
            return null;
        }

        $values[] = (int)$parts[$index];
    }

    $idle = $values[3] + $values[4];

    return [
        "idle"  => $idle,
        "total" => array_sum($values),
    ];
}

/*
 * Funktion: calculate_cpu_usage()
 * Autor: Bernardo de Oliveira
 *
 * Berechnet die CPU Auslastung zwischen zwei Messungen
 */
function calculate_cpu_usage(
    array $firstSnapshot,
    array $secondSnapshot
): ?float {
    $totalDifference = $secondSnapshot["total"] - $firstSnapshot["total"];
    $idleDifference = $secondSnapshot["idle"] - $firstSnapshot["idle"];

    if ($totalDifference <= 0) {
        return null;
    }

    $usage = (1 - ($idleDifference / $totalDifference)) * 100;

    if ($usage < 0 || !is_finite($usage)) {
        return null;
    }

    return round(min($usage, 100), 2);
}

/*
 * Funktion: read_network_snapshot()
 * Autor: Bernardo de Oliveira
 *
 * Liest die Netzwerk Counter ein
 */
function read_network_snapshot(): ?array
{
    $rxContents = @file_get_contents(
        __DIR__ . "/data/filter_network"
    );

    $txContents = @file_get_contents(
        __DIR__ . "/data/tx_bytes"
    );

    if ($rxContents === false || $txContents === false) {
        return null;
    }

    if (
        !preg_match(
            "/^\s*\d+\s+(\d+)\s+ACCEPT.*monitoring/m",
            $rxContents,
            $matches
        )
    ) {
        return null;
    }

    $txContents = trim($txContents);

    if ($txContents === "" || !ctype_digit($txContents)) {
        return null;
    }

    return [
        "rx" => (int)$matches[1],
        "tx" => (int)$txContents,
    ];
}

/*
 * Funktion: calculate_network_usage()
 * Autor: Bernardo de Oliveira
 *
 * Berechnet die Netzwerk Auslastung in Mbit/s
 */
function calculate_network_usage(
    array $firstSnapshot,
    array $secondSnapshot,
    float $seconds
): ?array {
    if ($seconds <= 0) {
        return null;
    }

    $receivedBytes = $secondSnapshot["rx"] - $firstSnapshot["rx"];
    $transmittedBytes = $secondSnapshot["tx"] - $firstSnapshot["tx"];

    if ($receivedBytes < 0 || $transmittedBytes < 0) {
        return null;
    }

    return [
        "down" => round(
            (($receivedBytes * 8) / 1000000) / $seconds,
            2
        ),
        "up" => round(
            (($transmittedBytes * 8) / 1000000) / $seconds,
            2
        ),
    ];
}

/*
 * Master Datei erstellen
 */
if (!is_file($dbFile)) {
    write_json_file_atomic(
        $dbFile,
        []
    );
}

/*
 * Range Dateien vorbereiten
 */
$dbFiles = [];

foreach ($rangeIntervals as $allowedAmount => $_interval) {
    $dbFiles[$allowedAmount] =
        $dbDirectory
        . "/monitoring-"
        . $allowedAmount
        . ".json";
}

/*
 * Master Datenbank laden
 */
$masterDatabase = normalise_monitoring_data(
    load_json_file($dbFile)
);

$startupTime = time();
$masterCutoff = $startupTime - ($maxAmount * 60);

prune_monitoring_data(
    $masterDatabase,
    $masterCutoff
);

/*
 * Komprimierte Ranges laden
 */
$ranges = [];

foreach ($rangeIntervals as $allowedAmount => $interval) {
    $ranges[$allowedAmount] = prepare_range(
        $dbFiles[$allowedAmount],
        $masterDatabase,
        $allowedAmount,
        $interval,
        $startupTime
    );
}

/*
 * Schreibzeiten
 */
$lastWritten = [
    "master" => $startupTime,
];

foreach ($rangeIntervals as $allowedAmount => $_interval) {
    $lastWritten[$allowedAmount] = 0;
}

while (true) {
    try {
        $measurementStarted = microtime(true);

        $firstCpuSnapshot = read_cpu_snapshot();
        $firstNetworkSnapshot = read_network_snapshot();

        if (
            $firstCpuSnapshot === null
            || $firstNetworkSnapshot === null
        ) {
            usleep(1000000);
            continue;
        }

        $elapsed = microtime(true) - $measurementStarted;
        $remaining = 1.0 - $elapsed;

        if ($remaining > 0) {
            usleep(
                (int)round($remaining * 1000000)
            );
        }

        $secondCpuSnapshot = read_cpu_snapshot();
        $secondNetworkSnapshot = read_network_snapshot();
        $ram = get_server_memory_usage();

        if (
            $secondCpuSnapshot === null
            || $secondNetworkSnapshot === null
            || $ram === null
        ) {
            continue;
        }

        $measurementSeconds = microtime(true) - $measurementStarted;

        $cpu = calculate_cpu_usage(
            $firstCpuSnapshot,
            $secondCpuSnapshot
        );

        $network = calculate_network_usage(
            $firstNetworkSnapshot,
            $secondNetworkSnapshot,
            $measurementSeconds
        );

        if ($cpu === null || $network === null) {
            continue;
        }

        $now = time();

        $sample = [
            "cpu" => $cpu,
            "ram" => $ram,
            "network" => $network,
        ];

        /*
         * Full Resolution nur im Master speichern
         */
        $masterDatabase[$now] = $sample;

        /*
         * Neue Messung direkt in die komprimierten Ranges einfügen
         */
        foreach ($rangeIntervals as $allowedAmount => $interval) {
            add_range_sample(
                $ranges[$allowedAmount],
                $now,
                $sample,
                $interval
            );
        }

        /*
         * Master bereinigen
         */
        $masterCutoff = $now - ($maxAmount * 60);

        prune_monitoring_data(
            $masterDatabase,
            $masterCutoff
        );

        /*
         * Master als Crash Recovery speichern
         */
        if (
            $now - $lastWritten["master"]
            >= $masterUpdateInterval
        ) {
            write_json_file_atomic(
                $dbFile,
                $masterDatabase
            );

            $lastWritten["master"] = $now;
        }

        /*
         * Komprimierte Range Dateien speichern
         */
        foreach ($rangeIntervals as $allowedAmount => $interval) {
            if (
                $now - $lastWritten[$allowedAmount]
                < $interval
            ) {
                continue;
            }

            $cutoff = $now - ($allowedAmount * 60);

            prune_range_series(
                $ranges[$allowedAmount],
                $cutoff
            );

            $export = export_range_data(
                $ranges[$allowedAmount],
                $interval,
                $cutoff
            );

            write_json_file_atomic(
                $dbFiles[$allowedAmount],
                $export
            );

            $lastWritten[$allowedAmount] = $now;
        }

    } catch (Throwable $exception) {
        /*
         * Während der Entwicklung optional aktivieren:
         *
         * error_log(
         *     $exception->getMessage()
         * );
         */

        usleep(1000000);
    }
}