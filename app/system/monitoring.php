<?php

declare(strict_types = 1);

$maxAmount            = 43800;
$masterUpdateInterval = 300;
$updateIntervals      = [
    4          => 1,
    60         => 2,
    300        => 5,
    1440       => 15,
    10080      => 60,
    $maxAmount => $masterUpdateInterval,
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

/**
 * Atomically writes JSON data to a file.
 *
 * The temporary file must be on the same filesystem as the target file so
 * rename() remains atomic.
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

/**
 * Loads a JSON object from disk.
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

    if (!is_array($data)) {
        return [];
    }

    return $data;
}

/**
 * Ensures timestamp keys are integers and ordered chronologically.
 *
 * JSON object keys are decoded as integers when they are valid integer strings,
 * but normalising them here also protects against malformed legacy data.
 */
function normalise_monitoring_data(array $data): array
{
    $normalised = [];

    foreach ($data as $timestamp => $sample) {
        $timestamp = (int)$timestamp;

        if ($timestamp <= 0 || !is_array($sample)) {
            continue;
        }

        $normalised[$timestamp] = $sample;
    }

    ksort($normalised, SORT_NUMERIC);

    return $normalised;
}

/**
 * Removes expired entries from an ordered timestamp-keyed array.
 *
 * Since entries are chronological, this stops at the first retained timestamp
 * instead of scanning the entire array.
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

/**
 * Builds one retained time window from the master database.
 *
 * This is only used during startup. Runtime updates append directly to every
 * window and do not repeatedly scan the master database.
 */
function build_monitoring_window(array $master, int $cutoff): array
{
    $window = [];

    foreach ($master as $timestamp => $sample) {
        if ((int)$timestamp < $cutoff) {
            continue;
        }

        $window[$timestamp] = $sample;
    }

    return $window;
}

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
    $used  = (float)$parts[2];

    if ($total <= 0) {
        return null;
    }

    $value = ($used / $total) * 100;

    if ($value < 0 || !is_finite($value)) {
        return null;
    }

    return round($value, 2);
}

/**
 * Reads the first aggregate CPU line from the stat snapshot.
 *
 * Returns:
 *
 * [
 *     "idle"  => int,
 *     "total" => int
 * ]
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

/**
 * Calculates CPU usage between two snapshots.
 */
function calculate_cpu_usage(
    array $firstSnapshot,
    array $secondSnapshot
): ?float {
    $totalDifference =
        $secondSnapshot["total"]
        - $firstSnapshot["total"];

    $idleDifference =
        $secondSnapshot["idle"]
        - $firstSnapshot["idle"];

    if ($totalDifference <= 0) {
        return null;
    }

    $usage = (
            1
            - ($idleDifference / $totalDifference)
        ) * 100;

    if ($usage < 0 || !is_finite($usage)) {
        return null;
    }

    return round(min($usage, 100), 2);
}

/**
 * Reads the network counters used by the original implementation.
 *
 * Returns:
 *
 * [
 *     "rx" => int,
 *     "tx" => int
 * ]
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

/**
 * Calculates network usage in megabits per second.
 *
 * This assumes approximately one second between snapshots, matching the
 * original behaviour.
 */
function calculate_network_usage(
    array $firstSnapshot,
    array $secondSnapshot
): ?array {
    $receivedBytes =
        $secondSnapshot["rx"]
        - $firstSnapshot["rx"];

    $transmittedBytes =
        $secondSnapshot["tx"]
        - $firstSnapshot["tx"];

    if ($receivedBytes < 0 || $transmittedBytes < 0) {
        return null;
    }

    return [
        "down" => round(
            ($receivedBytes * 8) / 1000000,
            2
        ),
        "up"   => round(
            ($transmittedBytes * 8) / 1000000,
            2
        ),
    ];
}

/*
 * Create the master file if it does not exist.
 */
if (!is_file($dbFile)) {
    write_json_file_atomic($dbFile, []);
}

/*
 * Precompute all output filenames.
 */
$dbFiles = [];

foreach ($updateIntervals as $allowedAmount => $_interval) {
    $dbFiles[$allowedAmount] =
        $dbDirectory
        . "/monitoring-"
        . $allowedAmount
        . ".json";

    if (!is_file($dbFiles[$allowedAmount])) {
        write_json_file_atomic(
            $dbFiles[$allowedAmount],
            []
        );
    }
}

/*
 * Load and normalise the master database once.
 */
$masterDatabase = normalise_monitoring_data(
    load_json_file($dbFile)
);

$startupTime  = time();
$masterCutoff = $startupTime - ($maxAmount * 60);

prune_monitoring_data(
    $masterDatabase,
    $masterCutoff
);

/*
 * Build all split arrays once during startup.
 *
 * After this, every sample is appended directly to every window.
 */
$databases = [];

foreach ($updateIntervals as $allowedAmount => $_interval) {
    $cutoff =
        $startupTime
        - ($allowedAmount * 60);

    $databases[$allowedAmount] =
        build_monitoring_window(
            $masterDatabase,
            $cutoff
        );
}

/*
 * The first successful sample writes every range file immediately.
 *
 * The master is delayed by its configured interval because it has already been
 * loaded from disk. Set this to 0 instead if an immediate master rewrite is
 * preferred.
 */
$lastWritten = [
    "master" => $startupTime,
];

foreach ($updateIntervals as $allowedAmount => $_interval) {
    $lastWritten[$allowedAmount] = 0;
}

while (true) {
    try {
        $measurementStarted = microtime(true);

        $firstCpuSnapshot     = read_cpu_snapshot();
        $firstNetworkSnapshot = read_network_snapshot();

        if (
            $firstCpuSnapshot === null
            || $firstNetworkSnapshot === null
        ) {
            usleep(1000000);
            continue;
        }

        $elapsed   = microtime(true) - $measurementStarted;
        $remaining = 1.0 - $elapsed;

        if ($remaining > 0) {
            usleep((int)round($remaining * 1000000));
        }

        $secondCpuSnapshot     = read_cpu_snapshot();
        $secondNetworkSnapshot = read_network_snapshot();
        $ram                   = get_server_memory_usage();

        if (
            $secondCpuSnapshot === null
            || $secondNetworkSnapshot === null
            || $ram === null
        ) {
            continue;
        }

        $cpu = calculate_cpu_usage(
            $firstCpuSnapshot,
            $secondCpuSnapshot
        );

        $network = calculate_network_usage(
            $firstNetworkSnapshot,
            $secondNetworkSnapshot
        );

        if ($cpu === null || $network === null) {
            continue;
        }

        /*
         * Take the timestamp after the measurement has completed.
         *
         * This avoids assigning a sample to the second before the sleep.
         */
        $now = time();

        $sample = [
            "cpu"     => $cpu,
            "ram"     => $ram,
            "network" => $network,
        ];

        /*
         * Replace an existing entry if the loop happens to produce two samples
         * in the same Unix second.
         */
        $masterDatabase[$now] = $sample;

        foreach ($databases as &$database) {
            $database[$now] = $sample;
        }

        unset($database);

        /*
         * Prune the master database.
         */
        $masterCutoff =
            $now
            - ($maxAmount * 60);

        prune_monitoring_data(
            $masterDatabase,
            $masterCutoff
        );

        /*
         * Prune every split database independently.
         *
         * Each operation removes only newly expired entries from the beginning
         * of its array. It does not scan or copy the master database.
         */
        foreach ($databases as $allowedAmount => &$database) {
            $cutoff =
                $now
                - ($allowedAmount * 60);

            prune_monitoring_data(
                $database,
                $cutoff
            );
        }

        unset($database);

        /*
         * Persist the master database as crash-recovery storage.
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
         * Persist each static range file according to its own interval.
         */
        foreach (
            $updateIntervals
            as $allowedAmount => $interval
        ) {
            if (
                $now - $lastWritten[$allowedAmount]
                < $interval
            ) {
                continue;
            }

            write_json_file_atomic(
                $dbFiles[$allowedAmount],
                $databases[$allowedAmount]
            );

            $lastWritten[$allowedAmount] = $now;
        }
    } catch (Throwable $exception) {
        /*
         * Avoid a tight CPU loop when a persistent filesystem or data-source
         * error occurs.
         *
         * Uncomment this during diagnosis:
         *
         * error_log(
         *     $exception->getMessage()
         * );
         */
        usleep(1000000);
    }
}