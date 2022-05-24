<?php
$amount = 30;
$dbFile = __DIR__ . "/db/monitoring.json";

if (!file_exists($dbFile)) touch($dbFile);

$db = json_decode(file_get_contents($dbFile), true) ?? array();
$db = array_slice($db, -($amount * 4), $amount * 4, true);

function get_server_memory_usage(): float
{
    $free = file_get_contents(__DIR__ . "/data/free");
    $free = (string)trim($free);
    $free_arr = explode("\n", $free);
    $mem = explode(" ", $free_arr[1]);
    $mem = array_filter($mem);
    $mem = array_merge($mem);
    return round($mem[2] / $mem[1] * 100, 2);
}

function get_server_cpu_usage(): float
{
    $cont = file(__DIR__ . "/data/stat");
    $cpuloadtmp = explode(' ', $cont[0]);
    $cpuload0[0] = $cpuloadtmp[2] + $cpuloadtmp[4];
    $cpuload0[1] = $cpuloadtmp[2] + $cpuloadtmp[4] + $cpuloadtmp[5];
    sleep(1);
    $cont = file(__DIR__ . "/data/stat");
    $cpuloadtmp = explode(' ', $cont[0]);
    $cpuload1[0] = $cpuloadtmp[2] + $cpuloadtmp[4];
    $cpuload1[1] = $cpuloadtmp[2] + $cpuloadtmp[4] + $cpuloadtmp[5];

    if ($cpuload1[0] - $cpuload0[0] != 0 && $cpuload1[1] - $cpuload0[1] != 0) {
        return round(($cpuload1[0] - $cpuload0[0]) * 100 / ($cpuload1[1] - $cpuload0[1]), 2);
    } else {
        return get_server_cpu_usage();
    }
}

function get_server_network_usage(): array
{
    $rx[] = file_get_contents(__DIR__ . "/data/rx_bytes");
    $tx[] = file_get_contents(__DIR__ . "/data/tx_bytes");
    sleep(1);
    $rx[] = file_get_contents(__DIR__ . "/data/rx_bytes");
    $tx[] = file_get_contents(__DIR__ . "/data/tx_bytes");

    $tbps = intval($tx[1]) - intval($tx[0]);
    $rbps = intval($rx[1]) - intval($rx[0]);

    $round_rx = round($rbps / 1000000, 2);
    $round_tx = round($tbps / 1000000, 2);

    return ["down" => $round_rx * 8, "up" => $round_tx * 8];
}

while (true) {
    try {
	    if (count($db) == $amount * 4)
		    unset($db[key($db)]);

	    $db[time()] = array(
		    "cpu" => get_server_cpu_usage(),
		    "ram" => get_server_memory_usage(),
		    "network" => get_server_network_usage()
	    );

	    file_put_contents($dbFile, json_encode($db));
    } catch (Exception $ignored) {}
}