<?php

$maxAmount      = 43800;
$allowedAmounts = [4, 60, 300, 1440, 10080, $maxAmount];

$dbFile = __DIR__ . "/db/monitoring.json";

if (!file_exists($dbFile)) {
    file_put_contents($dbFile, json_encode(array()));
}

foreach ($allowedAmounts as $allowedAmount) {
    $dbFileTime = __DIR__ . "/db/monitoring-$allowedAmount.json";

    if (!file_exists($dbFileTime)) {
        file_put_contents($dbFileTime, json_encode(array()));
    }
}

$db = json_decode(file_get_contents($dbFile), true);
if (!is_array($db)) {
    $db = array();
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

    $parts = array_values(array_filter(explode(" ", $lines[1])));
    if (count($parts) < 3 || $parts[1] <= 0) {
        return null;
    }

    $value = ($parts[2] / $parts[1]) * 100;
    return ($value >= 0 && is_finite($value)) ? round($value, 2) : null;
}

function get_server_cpu_usage(): ?float
{
    $stat1 = @file(__DIR__ . "/data/stat");
    if ($stat1 === false || !isset($stat1[0])) {
        return null;
    }

    $a = array_values(array_filter(explode(" ", $stat1[0])));
    if (count($a) < 6) {
        return null;
    }

    $idle1  = $a[3] + $a[4];
    $total1 = array_sum(array_slice($a, 1, 7));

    sleep(1);

    $stat2 = @file(__DIR__ . "/data/stat");
    if ($stat2 === false || !isset($stat2[0])) {
        return null;
    }

    $b = array_values(array_filter(explode(" ", $stat2[0])));
    if (count($b) < 6) {
        return null;
    }

    $idle2  = $b[3] + $b[4];
    $total2 = array_sum(array_slice($b, 1, 7));

    $totalDiff = $total2 - $total1;
    $idleDiff  = $idle2 - $idle1;

    if ($totalDiff <= 0) {
        return null;
    }

    $usage = (1 - ($idleDiff / $totalDiff)) * 100;
    return ($usage >= 0 && is_finite($usage)) ? round($usage, 2) : null;
}

function get_server_network_usage(): ?array
{
    $rx1 = @file_get_contents(__DIR__ . "/data/rx_bytes");
    $tx1 = @file_get_contents(__DIR__ . "/data/tx_bytes");
    if ($rx1 === false || $tx1 === false) {
        return null;
    }

    sleep(1);

    $rx2 = @file_get_contents(__DIR__ . "/data/rx_bytes");
    $tx2 = @file_get_contents(__DIR__ . "/data/tx_bytes");
    if ($rx2 === false || $tx2 === false) {
        return null;
    }

    $rbps = intval($rx2) - intval($rx1);
    $tbps = intval($tx2) - intval($tx1);

    if ($rbps < 0 || $tbps < 0) {
        return null;
    }

    return array(
        "down" => round(($rbps * 8) / 1000000, 2),
        "up"   => round(($tbps * 8) / 1000000, 2)
    );
}

while (true) {
    try {
        $cpu = get_server_cpu_usage();
        $ram = get_server_memory_usage();
        $net = get_server_network_usage();

        if ($cpu === null || $ram === null || $net === null) {
            continue;
        }

        $db[time()] = array(
            "cpu"     => $cpu,
            "ram"     => $ram,
            "network" => $net
        );

        $cutoff = intval(time() - ($maxAmount * 60));

        $db = array_filter($db, function ($key) use ($cutoff) {
            return intval($key) >= $cutoff;
        }, ARRAY_FILTER_USE_KEY);

        file_put_contents($dbFile, json_encode($db));

        foreach ($allowedAmounts as $allowedAmount) {
            $dbFileTime = __DIR__ . "/db/monitoring-$allowedAmount.json";
            $cutoffTime = intval(time() - ($allowedAmount * 60));

            $dbTime = array_filter($db, function ($key) use ($cutoffTime) {
                return intval($key) >= $cutoffTime;
            }, ARRAY_FILTER_USE_KEY);

            file_put_contents($dbFileTime, json_encode($dbTime));
        }
    } catch (Throwable $e) {
        continue;
    }
}
