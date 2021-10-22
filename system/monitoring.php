<?php
function get_server_memory_usage() {
    $free = shell_exec('free');
    $free = (string)trim($free);
    $free_arr = explode("\n", $free);
    $mem = explode(" ", $free_arr[1]);
    $mem = array_filter($mem);
    $mem = array_merge($mem);
    return $mem[2]/$mem[1]*100;
}

function get_server_cpu_usage() {
    $load = sys_getloadavg();
    return $load[0];
}

function get_server_network_usage() {
    $int="eth0";

    $rx[] = @file_get_contents("/sys/class/net/$int/statistics/rx_bytes");
    $tx[] = @file_get_contents("/sys/class/net/$int/statistics/tx_bytes");
    sleep(1);
    $rx[] = @file_get_contents("/sys/class/net/$int/statistics/rx_bytes");
    $tx[] = @file_get_contents("/sys/class/net/$int/statistics/tx_bytes");

    $tbps = $tx[1] - $tx[0];
    $rbps = $rx[1] - $rx[0];

    $round_rx=round($rbps/1024, 2);
    $round_tx=round($tbps/1024, 2);
}

echo get_server_cpu_usage();