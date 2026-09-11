<?php

declare(strict_types=1);

/*
 * Firewall parser
 *
 * Supported input formats:
 *  1. Preferred: iptables-save -c -t <table>
 *  2. Legacy:    iptables -t <table> -L -n -v
 *
 * Output format stays compatible with the existing frontend:
 * {
 *     "raw": {
 *         "CHAIN": [ rule, rule, ... ]
 *     },
 *     "mangle": { ... },
 *     "nat": { ... },
 *     "filter": { ... }
 * }
 */

const FIREWALL_TABLES = ["raw", "mangle", "nat", "filter"];

function cleanParserValue($value): string
{
    if ($value === null) {
        return "";
    }

    return trim(preg_replace("/\s+/", " ", (string) $value) ?? "");
}

function addModule(array &$matches, string $module): void
{
    if (!isset($matches["modules"]) || !is_array($matches["modules"])) {
        $matches["modules"] = [];
    }

    if (!in_array($module, $matches["modules"], true)) {
        $matches["modules"][] = $module;
    }
}

function tokenizeIptablesRule(string $line): array
{
    $tokens = [];
    $current = "";
    $quote = null;
    $escaped = false;
    $started = false;
    $length = strlen($line);

    for ($i = 0; $i < $length; $i++) {
        $char = $line[$i];

        if ($escaped) {
            $current .= $char;
            $escaped = false;
            $started = true;
            continue;
        }

        if ($char === "\\") {
            $escaped = true;
            $started = true;
            continue;
        }

        if ($quote !== null) {
            if ($char === $quote) {
                $quote = null;
            } else {
                $current .= $char;
            }

            $started = true;
            continue;
        }

        if ($char === "\"" || $char === chr(39)) {
            $quote = $char;
            $started = true;
            continue;
        }

        if (ctype_space($char)) {
            if ($started) {
                $tokens[] = $current;
                $current = "";
                $started = false;
            }

            continue;
        }

        $current .= $char;
        $started = true;
    }

    if ($escaped) {
        $current .= "\\";
    }

    if ($started) {
        $tokens[] = $current;
    }

    return $tokens;
}

function nextToken(array $tokens, int &$index): string
{
    if (!isset($tokens[$index + 1])) {
        return "";
    }

    $index++;
    return (string) $tokens[$index];
}

function readPossiblyInvertedValue(array $tokens, int &$index, bool &$inverted): string
{
    $value = nextToken($tokens, $index);

    if ($value === "!" && isset($tokens[$index + 1])) {
        $inverted = true;
        $value = nextToken($tokens, $index);
    }

    return $value;
}

function parseIptablesSaveRule(array $tokens, string $pkts, string $bytes): array
{
    $row = [
        "pkts" => $pkts,
        "bytes" => $bytes,
        "target" => "",
        "prot" => "all",
        "opt" => "--",
        "in" => "*",
        "out" => "*",
        "source" => "0.0.0.0/0",
        "destination" => "0.0.0.0/0"
    ];

    $matches = [
        "source_format" => "iptables-save",
        "modules" => [],
        "raw" => implode(" ", $tokens)
    ];

    $pendingInvert = false;
    $count = count($tokens);

    for ($i = 0; $i < $count; $i++) {
        $token = (string) $tokens[$i];

        if ($token === "!") {
            $pendingInvert = true;
            continue;
        }

        switch ($token) {
            case "-m":
            case "--match":
                $module = strtolower(nextToken($tokens, $i));

                if ($module !== "") {
                    addModule($matches, $module);
                }

                $pendingInvert = false;
                break;

            case "-j":
            case "--jump":
                $row["target"] = nextToken($tokens, $i);
                $pendingInvert = false;
                break;

            case "-g":
            case "--goto":
                $row["target"] = nextToken($tokens, $i);
                $matches["goto"] = true;
                $pendingInvert = false;
                break;

            case "-p":
            case "--protocol":
                $value = readPossiblyInvertedValue($tokens, $i, $pendingInvert);
                $row["prot"] = ($pendingInvert ? "!" : "") . $value;
                $pendingInvert = false;
                break;

            case "-i":
            case "--in-interface":
                $value = readPossiblyInvertedValue($tokens, $i, $pendingInvert);
                $row["in"] = ($pendingInvert ? "!" : "") . $value;
                $pendingInvert = false;
                break;

            case "-o":
            case "--out-interface":
                $value = readPossiblyInvertedValue($tokens, $i, $pendingInvert);
                $row["out"] = ($pendingInvert ? "!" : "") . $value;
                $pendingInvert = false;
                break;

            case "-s":
            case "--source":
                $value = readPossiblyInvertedValue($tokens, $i, $pendingInvert);
                $row["source"] = ($pendingInvert ? "!" : "") . $value;
                $pendingInvert = false;
                break;

            case "-d":
            case "--destination":
                $value = readPossiblyInvertedValue($tokens, $i, $pendingInvert);
                $row["destination"] = ($pendingInvert ? "!" : "") . $value;
                $pendingInvert = false;
                break;

            case "--dport":
            case "--destination-port":
                $value = readPossiblyInvertedValue($tokens, $i, $pendingInvert);
                $row["dport"] = ($pendingInvert ? "!" : "") . $value;
                $matches["destination_port"] = [
                    "value" => $value,
                    "invert" => $pendingInvert
                ];
                $pendingInvert = false;
                break;

            case "--sport":
            case "--source-port":
                $value = readPossiblyInvertedValue($tokens, $i, $pendingInvert);
                $row["sport"] = ($pendingInvert ? "!" : "") . $value;
                $matches["source_port"] = [
                    "value" => $value,
                    "invert" => $pendingInvert
                ];
                $pendingInvert = false;
                break;

            case "--dports":
                $value = readPossiblyInvertedValue($tokens, $i, $pendingInvert);
                $row["dport"] = ($pendingInvert ? "!" : "") . $value;
                $matches["multiport"] = [
                    "direction" => "dports",
                    "ports" => $value,
                    "invert" => $pendingInvert
                ];
                $pendingInvert = false;
                break;

            case "--sports":
                $value = readPossiblyInvertedValue($tokens, $i, $pendingInvert);
                $row["sport"] = ($pendingInvert ? "!" : "") . $value;
                $matches["multiport"] = [
                    "direction" => "sports",
                    "ports" => $value,
                    "invert" => $pendingInvert
                ];
                $pendingInvert = false;
                break;

            case "--ports":
                $value = readPossiblyInvertedValue($tokens, $i, $pendingInvert);
                $matches["multiport"] = [
                    "direction" => "ports",
                    "ports" => $value,
                    "invert" => $pendingInvert
                ];
                $pendingInvert = false;
                break;

            case "--ctstate":
            case "--state":
                $value = readPossiblyInvertedValue($tokens, $i, $pendingInvert);
                $row["state"] = ($pendingInvert ? "!" : "") . $value;
                $matches["conntrack"] = [
                    "state" => $value,
                    "invert" => $pendingInvert
                ];
                $pendingInvert = false;
                break;

            case "--tcp-flags":
                $mask = nextToken($tokens, $i);
                $comparison = nextToken($tokens, $i);
                $matches["tcp_flags"] = [
                    "mask" => $mask,
                    "comparison" => $comparison,
                    "invert" => $pendingInvert
                ];
                $row["flags"] = ($pendingInvert ? "!" : "") . $mask . "/" . $comparison;
                $pendingInvert = false;
                break;

            case "--syn":
                $matches["tcp_flags"] = [
                    "mask" => "SYN,RST,ACK,FIN",
                    "comparison" => "SYN",
                    "invert" => $pendingInvert,
                    "syn_shortcut" => true
                ];
                $row["flags"] = ($pendingInvert ? "!" : "") . "SYN,RST,ACK,FIN/SYN";
                $pendingInvert = false;
                break;

            case "--tcp-option":
                $value = nextToken($tokens, $i);
                $matches["tcp_option"] = [
                    "option" => $value,
                    "invert" => $pendingInvert
                ];
                $row["tcp options"] = ($pendingInvert ? "!" : "") . $value;
                $pendingInvert = false;
                break;

            case "--mss":
                $value = nextToken($tokens, $i);
                $matches["tcp_mss"] = [
                    "range" => $value,
                    "invert" => $pendingInvert
                ];
                $row["tcp mss"] = ($pendingInvert ? "!" : "") . $value;
                $pendingInvert = false;
                break;

            case "--limit":
                $value = nextToken($tokens, $i);
                $matches["limit"] = $matches["limit"] ?? [];
                $matches["limit"]["rate"] = $value;
                $matches["limit"]["invert"] = $pendingInvert;
                $pendingInvert = false;
                break;

            case "--limit-burst":
                $matches["limit"] = $matches["limit"] ?? [];
                $matches["limit"]["burst"] = nextToken($tokens, $i);
                $pendingInvert = false;
                break;

            case "--hashlimit-above":
            case "--hashlimit-upto":
                $value = nextToken($tokens, $i);
                $matches["hashlimit"] = $matches["hashlimit"] ?? [];
                $matches["hashlimit"]["comparison"] = $token === "--hashlimit-above" ? "above" : "upto";
                $matches["hashlimit"]["rate"] = $value;
                $matches["hashlimit"]["invert"] = $pendingInvert;
                $pendingInvert = false;
                break;

            case "--hashlimit-burst":
                $matches["hashlimit"] = $matches["hashlimit"] ?? [];
                $matches["hashlimit"]["burst"] = nextToken($tokens, $i);
                $pendingInvert = false;
                break;

            case "--hashlimit-mode":
                $matches["hashlimit"] = $matches["hashlimit"] ?? [];
                $matches["hashlimit"]["mode"] = nextToken($tokens, $i);
                $pendingInvert = false;
                break;

            case "--hashlimit-name":
                $matches["hashlimit"] = $matches["hashlimit"] ?? [];
                $matches["hashlimit"]["name"] = nextToken($tokens, $i);
                $pendingInvert = false;
                break;

            case "--hashlimit-htable-expire":
                $matches["hashlimit"] = $matches["hashlimit"] ?? [];
                $matches["hashlimit"]["htable_expire"] = nextToken($tokens, $i);
                $pendingInvert = false;
                break;

            case "--hashlimit-htable-size":
                $matches["hashlimit"] = $matches["hashlimit"] ?? [];
                $matches["hashlimit"]["htable_size"] = nextToken($tokens, $i);
                $pendingInvert = false;
                break;

            case "--hashlimit-htable-max":
                $matches["hashlimit"] = $matches["hashlimit"] ?? [];
                $matches["hashlimit"]["htable_max"] = nextToken($tokens, $i);
                $pendingInvert = false;
                break;

            case "--hashlimit-htable-gcinterval":
                $matches["hashlimit"] = $matches["hashlimit"] ?? [];
                $matches["hashlimit"]["htable_gcinterval"] = nextToken($tokens, $i);
                $pendingInvert = false;
                break;

            case "--hashlimit-srcmask":
                $matches["hashlimit"] = $matches["hashlimit"] ?? [];
                $matches["hashlimit"]["srcmask"] = nextToken($tokens, $i);
                $pendingInvert = false;
                break;

            case "--hashlimit-dstmask":
                $matches["hashlimit"] = $matches["hashlimit"] ?? [];
                $matches["hashlimit"]["dstmask"] = nextToken($tokens, $i);
                $pendingInvert = false;
                break;

            case "--u32":
                $matches["u32"] = [
                    "expression" => nextToken($tokens, $i),
                    "invert" => $pendingInvert
                ];
                $pendingInvert = false;
                break;

            case "--string":
                $matches["string"] = $matches["string"] ?? [];
                $matches["string"]["value"] = nextToken($tokens, $i);
                $matches["string"]["hex"] = false;
                $matches["string"]["invert"] = $pendingInvert;
                $pendingInvert = false;
                break;

            case "--hex-string":
                $matches["string"] = $matches["string"] ?? [];
                $matches["string"]["value"] = nextToken($tokens, $i);
                $matches["string"]["hex"] = true;
                $matches["string"]["invert"] = $pendingInvert;
                $pendingInvert = false;
                break;

            case "--algo":
                $matches["string"] = $matches["string"] ?? [];
                $matches["string"]["algorithm"] = nextToken($tokens, $i);
                $pendingInvert = false;
                break;

            case "--from":
                $matches["string"] = $matches["string"] ?? [];
                $matches["string"]["from"] = nextToken($tokens, $i);
                $pendingInvert = false;
                break;

            case "--to":
                $matches["string"] = $matches["string"] ?? [];
                $matches["string"]["to"] = nextToken($tokens, $i);
                $pendingInvert = false;
                break;

            case "--icase":
                $matches["string"] = $matches["string"] ?? [];
                $matches["string"]["ignore_case"] = true;
                $pendingInvert = false;
                break;

            case "--validmark":
                $matches["rpfilter"] = $matches["rpfilter"] ?? [];
                $matches["rpfilter"]["validmark"] = true;
                $pendingInvert = false;
                break;

            case "--loose":
                $matches["rpfilter"] = $matches["rpfilter"] ?? [];
                $matches["rpfilter"]["loose"] = true;
                $pendingInvert = false;
                break;

            case "--accept-local":
                $matches["rpfilter"] = $matches["rpfilter"] ?? [];
                $matches["rpfilter"]["accept_local"] = true;
                $pendingInvert = false;
                break;

            case "--invert":
                $matches["rpfilter"] = $matches["rpfilter"] ?? [];
                $matches["rpfilter"]["invert"] = true;
                $pendingInvert = false;
                break;

            case "--name":
                $matches["recent"] = $matches["recent"] ?? [];
                $matches["recent"]["name"] = nextToken($tokens, $i);
                $pendingInvert = false;
                break;

            case "--set":
                $matches["recent"] = $matches["recent"] ?? [];
                $matches["recent"]["operation"] = "set";
                $matches["recent"]["invert"] = $pendingInvert;
                $pendingInvert = false;
                break;

            case "--rcheck":
                $matches["recent"] = $matches["recent"] ?? [];
                $matches["recent"]["operation"] = "rcheck";
                $matches["recent"]["invert"] = $pendingInvert;
                $pendingInvert = false;
                break;

            case "--update":
                $matches["recent"] = $matches["recent"] ?? [];
                $matches["recent"]["operation"] = "update";
                $matches["recent"]["invert"] = $pendingInvert;
                $pendingInvert = false;
                break;

            case "--remove":
                $matches["recent"] = $matches["recent"] ?? [];
                $matches["recent"]["operation"] = "remove";
                $matches["recent"]["invert"] = $pendingInvert;
                $pendingInvert = false;
                break;

            case "--seconds":
                $matches["recent"] = $matches["recent"] ?? [];
                $matches["recent"]["seconds"] = nextToken($tokens, $i);
                $pendingInvert = false;
                break;

            case "--hitcount":
                $matches["recent"] = $matches["recent"] ?? [];
                $matches["recent"]["hitcount"] = nextToken($tokens, $i);
                $pendingInvert = false;
                break;

            case "--rsource":
                $matches["recent"] = $matches["recent"] ?? [];
                $matches["recent"]["side"] = "source";
                $pendingInvert = false;
                break;

            case "--rdest":
                $matches["recent"] = $matches["recent"] ?? [];
                $matches["recent"]["side"] = "destination";
                $pendingInvert = false;
                break;

            case "--mask":
                $matches["recent"] = $matches["recent"] ?? [];
                $matches["recent"]["mask"] = nextToken($tokens, $i);
                $pendingInvert = false;
                break;

            case "--rttl":
                $matches["recent"] = $matches["recent"] ?? [];
                $matches["recent"]["rttl"] = true;
                $pendingInvert = false;
                break;

            case "--reap":
                $matches["recent"] = $matches["recent"] ?? [];
                $matches["recent"]["reap"] = true;
                $pendingInvert = false;
                break;

            case "--comment":
                $row["comment"] = nextToken($tokens, $i);
                $pendingInvert = false;
                break;

            case "--to-destination":
            case "--to-dest":
                $matches["nat"] = $matches["nat"] ?? [];
                $matches["nat"]["to_destination"] = nextToken($tokens, $i);
                $pendingInvert = false;
                break;

            case "--to-source":
                $matches["nat"] = $matches["nat"] ?? [];
                $matches["nat"]["to_source"] = nextToken($tokens, $i);
                $pendingInvert = false;
                break;

            case "--to-ports":
                $matches["nat"] = $matches["nat"] ?? [];
                $matches["nat"]["to_ports"] = nextToken($tokens, $i);
                $pendingInvert = false;
                break;

            case "--reject-with":
                $matches["reject"] = [
                    "with" => nextToken($tokens, $i)
                ];
                $pendingInvert = false;
                break;

            default:
                break;
        }
    }

    if (isset($matches["rpfilter"])) {
        addModule($matches, "rpfilter");
        $rp = [];

        if (!empty($matches["rpfilter"]["invert"])) {
            $rp[] = "invert";
        }

        if (!empty($matches["rpfilter"]["validmark"])) {
            $rp[] = "validmark";
        }

        if (!empty($matches["rpfilter"]["loose"])) {
            $rp[] = "loose";
        }

        if (!empty($matches["rpfilter"]["accept_local"])) {
            $rp[] = "accept-local";
        }

        $row["rpfilter"] = implode(" ", $rp);
    }

    if (isset($matches["recent"]) && !isset($matches["recent"]["side"])) {
        $matches["recent"]["side"] = "source";
    }

    $row["_matches"] = $matches;

    return $row;
}

function parseIptablesSaveDump(string $content): array
{
    $chains = [];
    $lines = preg_split("/\R/", $content) ?: [];

    foreach ($lines as $line) {
        $line = trim($line);

        if ($line === "" || str_starts_with($line, "#") || str_starts_with($line, "*") || $line === "COMMIT") {
            continue;
        }

        if (preg_match("/^:([^\s]+)\s+([^\s]+)\s+\[([^\]]+)\]\s*\$/", $line, $matches)) {
            $chain = $matches[1];
            $chains[$chain] = $chains[$chain] ?? [];
            continue;
        }

        $pkts = "";
        $bytes = "";
        $ruleText = $line;

        if (preg_match("/^\[([0-9]+):([0-9]+)\]\s+(.*)\$/", $line, $matches)) {
            $pkts = $matches[1];
            $bytes = $matches[2];
            $ruleText = $matches[3];
        }

        $tokens = tokenizeIptablesRule($ruleText);

        if (count($tokens) < 2 || $tokens[0] !== "-A") {
            continue;
        }

        $chain = (string) $tokens[1];
        $chains[$chain] = $chains[$chain] ?? [];
        $chains[$chain][] = parseIptablesSaveRule(array_slice($tokens, 2), $pkts, $bytes);
    }

    return $chains;
}

function getListHeaderOffsets(string $headerLine): array
{
    preg_match_all("/\S+/", $headerLine, $matches, PREG_OFFSET_CAPTURE);

    $offsets = [];

    foreach ($matches[0] ?? [] as $match) {
        $offsets[] = [
            "name" => strtolower((string) $match[0]),
            "offset" => (int) $match[1]
        ];
    }

    return $offsets;
}

function parseListBaseColumns(string $line, string $headerLine): ?array
{
    $offsets = getListHeaderOffsets($headerLine);
    $expected = ["pkts", "bytes", "target", "prot", "opt", "in", "out", "source", "destination"];

    if (count($offsets) < count($expected)) {
        return null;
    }

    foreach ($expected as $index => $name) {
        if (($offsets[$index]["name"] ?? "") !== $name) {
            return null;
        }
    }

    $row = [];

    for ($i = 0; $i < 8; $i++) {
        /*
         * Packet counters are right-aligned and may start one character
         * before the word "pkts" in the header when all digits are used.
         * The first field therefore starts at column 0, not at the p in pkts.
         */
        $start = $i === 0 ? 0 : $offsets[$i]["offset"];
        $end = $offsets[$i + 1]["offset"];
        $row[$expected[$i]] = trim(substr($line, $start, $end - $start));
    }

    $destinationStart = $offsets[8]["offset"];
    $tail = substr($line, $destinationStart);

    if (!preg_match("/^\s*(\S+)(?:\s+(.*))?\s*\$/", $tail, $matches)) {
        return null;
    }

    $row["destination"] = $matches[1];
    $row["_extra"] = isset($matches[2]) ? trim($matches[2]) : "";

    return $row;
}

function parseLegacyExtras(array $row): array
{
    $extra = cleanParserValue($row["_extra"] ?? "");
    unset($row["_extra"]);

    $matches = [
        "source_format" => "iptables-list",
        "modules" => [],
        "raw" => $extra
    ];

    if ($extra === "") {
        $row["_matches"] = $matches;
        return $row;
    }

    if (preg_match("/\/\*\s*(.*?)\s*\*\//", $extra, $match)) {
        $row["comment"] = cleanParserValue($match[1]);
        addModule($matches, "comment");
    }

    if (preg_match("/\bmultiport\s+dports\s+([^\s]+)/i", $extra, $match)) {
        $row["dport"] = $match[1];
        $matches["multiport"] = [
            "direction" => "dports",
            "ports" => $match[1],
            "invert" => false
        ];
        addModule($matches, "multiport");
    } elseif (preg_match("/\b(?:tcp|udp)\s+dpt:([^\s]+)/i", $extra, $match)) {
        $row["dport"] = $match[1];
        $matches["destination_port"] = [
            "value" => $match[1],
            "invert" => false
        ];
    }

    if (preg_match("/\bmultiport\s+sports\s+([^\s]+)/i", $extra, $match)) {
        $row["sport"] = $match[1];
        $matches["multiport"] = [
            "direction" => "sports",
            "ports" => $match[1],
            "invert" => false
        ];
        addModule($matches, "multiport");
    } elseif (preg_match("/\b(?:tcp|udp)\s+spt:([^\s]+)/i", $extra, $match)) {
        $row["sport"] = $match[1];
        $matches["source_port"] = [
            "value" => $match[1],
            "invert" => false
        ];
    }

    if (preg_match("/\b(?:ctstate|state)\s+(!?)([A-Z,]+)/i", $extra, $match)) {
        $inverted = $match[1] === "!";
        $row["state"] = ($inverted ? "!" : "") . $match[2];
        $matches["conntrack"] = [
            "state" => $match[2],
            "invert" => $inverted
        ];
        addModule($matches, "conntrack");
    }

    if (preg_match("/\btcp\s+flags:([^\s]+)/i", $extra, $match) || preg_match("/\bflags:([^\s]+)/i", $extra, $match)) {
        $flags = $match[1];
        $invert = str_starts_with($flags, "!");

        if ($invert) {
            $flags = substr($flags, 1);
        }

        $parts = explode("/", $flags, 2);
        $mask = $parts[0] ?? "";
        $comparison = $parts[1] ?? "";

        $row["flags"] = ($invert ? "!" : "") . $flags;
        $matches["tcp_flags"] = [
            "mask" => $mask,
            "comparison" => $comparison,
            "invert" => $invert
        ];
        addModule($matches, "tcp");
    }

    if (preg_match("/\btcp\s+option=(!?)([^\s]+)/i", $extra, $match)) {
        $inverted = $match[1] === "!";
        $row["tcp options"] = ($inverted ? "!" : "") . $match[2];
        $matches["tcp_option"] = [
            "option" => $match[2],
            "invert" => $inverted
        ];
        addModule($matches, "tcp");
    }

    if (preg_match("/\btcpmss\s+match\s+(!?)\s*([^\s]+)/i", $extra, $match)) {
        $inverted = $match[1] === "!";
        $row["tcp mss"] = ($inverted ? "!" : "") . $match[2];
        $matches["tcp_mss"] = [
            "range" => $match[2],
            "invert" => $inverted
        ];
        addModule($matches, "tcpmss");
    }

    if (stripos($extra, "rpfilter") !== false) {
        $matches["rpfilter"] = [
            "invert" => (bool) preg_match("/\brpfilter\b[^\r\n]*\b(?:invert|!)\b/i", $extra),
            "validmark" => stripos($extra, "validmark") !== false,
            "loose" => (bool) preg_match("/\brpfilter\b[^\r\n]*\bloose\b/i", $extra),
            "accept_local" => stripos($extra, "accept-local") !== false
        ];

        $rp = [];

        if ($matches["rpfilter"]["invert"]) {
            $rp[] = "invert";
        }

        if ($matches["rpfilter"]["validmark"]) {
            $rp[] = "validmark";
        }

        if ($matches["rpfilter"]["loose"]) {
            $rp[] = "loose";
        }

        if ($matches["rpfilter"]["accept_local"]) {
            $rp[] = "accept-local";
        }

        $row["rpfilter"] = implode(" ", $rp);
        addModule($matches, "rpfilter");
    }

    if (preg_match("/(?:^|\s)(!?)\s*u32\s+(!?)\s*(.*?)(?=\s+limit:|\s+multiport|\s+STRING\s+match|\s+recent:|\s+rpfilter|\s+\/\*|\s*\$)/i", $extra, $match)) {
        $matches["u32"] = [
            "expression" => trim($match[3]),
            "invert" => $match[1] === "!" || $match[2] === "!"
        ];
        addModule($matches, "u32");
    }

    if (preg_match("/STRING\s+match\s+\"([^\"]*)\"\s+ALGO\s+name\s+([^\s]+)(.*?)(?=\s+limit:|\s+recent:|\s+\/\*|\s*\$)/i", $extra, $match)) {
        $stringMatch = [
            "value" => $match[1],
            "hex" => str_starts_with($match[1], "|") && str_ends_with($match[1], "|"),
            "algorithm" => $match[2],
            "invert" => false
        ];

        if (preg_match("/\bFROM\s+([0-9]+)/i", $match[3], $fromMatch)) {
            $stringMatch["from"] = $fromMatch[1];
        }

        if (preg_match("/\bTO\s+([0-9]+)/i", $match[3], $toMatch)) {
            $stringMatch["to"] = $toMatch[1];
        }

        $matches["string"] = $stringMatch;
        addModule($matches, "string");
    }

    if (preg_match("/\blimit:\s+(avg|above|up\s+to)\s+([^\s]+)(?:\s+burst\s+([^\s]+))?(?:\s+mode\s+([^\s]+))?/i", $extra, $match)) {
        $kind = strtolower(preg_replace("/\s+/", "", $match[1]) ?? "");
        $rate = $match[2] ?? "";
        $burst = $match[3] ?? "";
        $mode = $match[4] ?? "";

        if ($kind === "above" || $kind === "upto" || $mode !== "") {
            $matches["hashlimit"] = [
                "comparison" => $kind === "above" ? "above" : "upto",
                "rate" => $rate,
                "burst" => $burst,
                "mode" => $mode,
                "invert" => false
            ];
            addModule($matches, "hashlimit");
        } else {
            $matches["limit"] = [
                "rate" => $rate,
                "burst" => $burst,
                "invert" => false
            ];
            addModule($matches, "limit");
        }
    }

    if (preg_match("/\brecent:\s+(SET|CHECK|UPDATE|REMOVE)(.*?)(?=\s+\/\*|\s*\$)/i", $extra, $match)) {
        $operationMap = [
            "SET" => "set",
            "CHECK" => "rcheck",
            "UPDATE" => "update",
            "REMOVE" => "remove"
        ];

        $recent = [
            "operation" => $operationMap[strtoupper($match[1])] ?? strtolower($match[1]),
            "side" => "source",
            "invert" => false
        ];
        $recentTail = $match[2];

        if (preg_match("/\bseconds:\s*([^\s]+)/i", $recentTail, $recentMatch)) {
            $recent["seconds"] = $recentMatch[1];
        }

        if (preg_match("/\bhit_count:\s*([^\s]+)/i", $recentTail, $recentMatch) || preg_match("/\bhitcount:\s*([^\s]+)/i", $recentTail, $recentMatch)) {
            $recent["hitcount"] = $recentMatch[1];
        }

        if (preg_match("/\bname:\s*([^\s]+)/i", $recentTail, $recentMatch)) {
            $recent["name"] = $recentMatch[1];
        }

        if (preg_match("/\bside:\s*(source|destination)/i", $recentTail, $recentMatch)) {
            $recent["side"] = strtolower($recentMatch[1]);
        }

        if (preg_match("/\bmask:\s*([^\s]+)/i", $recentTail, $recentMatch)) {
            $recent["mask"] = $recentMatch[1];
        }

        $matches["recent"] = $recent;
        addModule($matches, "recent");
    }

    if (preg_match("/\bto:([^\s]+)/i", $extra, $match)) {
        $matches["nat"] = ["to" => $match[1]];
    }

    if (preg_match("/\breject-with\s+([^\s]+)/i", $extra, $match)) {
        $matches["reject"] = ["with" => $match[1]];
    }

    $row["_matches"] = $matches;

    return $row;
}

function parseIptablesListDump(string $content): array
{
    $chains = [];
    $lines = preg_split("/\R/", $content) ?: [];
    $chain = null;
    $headerLine = null;

    foreach ($lines as $line) {
        if (trim($line) === "") {
            continue;
        }

        if (preg_match("/^Chain\s+([^\s]+)\s+\(/", trim($line), $match)) {
            $chain = $match[1];
            $chains[$chain] = $chains[$chain] ?? [];
            $headerLine = null;
            continue;
        }

        if ($chain === null) {
            continue;
        }

        if (preg_match("/^\s*pkts\s+bytes\s+target\s+prot\s+opt\s+in\s+out\s+source\s+destination\s*\$/i", $line)) {
            $headerLine = $line;
            continue;
        }

        if ($headerLine === null) {
            continue;
        }

        $row = parseListBaseColumns($line, $headerLine);

        if ($row === null) {
            continue;
        }

        $chains[$chain][] = parseLegacyExtras($row);
    }

    return $chains;
}

function parseFirewallDump(string $content): array
{
    if (preg_match("/^\s*\*/m", $content) || preg_match("/^\s*(?:\[[0-9]+:[0-9]+\]\s+)?-A\s+/m", $content)) {
        return parseIptablesSaveDump($content);
    }

    return parseIptablesListDump($content);
}

function writeJsonAtomically(string $path, array $data): void
{
    $json = json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);

    if ($json === false) {
        throw new RuntimeException("Could not encode firewall data as JSON: " . json_last_error_msg());
    }

    $directory = dirname($path);

    if (!is_dir($directory) && !mkdir($directory, 0775, true) && !is_dir($directory)) {
        throw new RuntimeException("Could not create directory: " . $directory);
    }

    $temporary = $path . ".tmp";

    if (file_put_contents($temporary, $json, LOCK_EX) === false) {
        throw new RuntimeException("Could not write temporary firewall JSON file.");
    }

    if (!rename($temporary, $path)) {
        @unlink($temporary);
        throw new RuntimeException("Could not replace firewall JSON file.");
    }
}

while (true) {
    try {
        $data = [];
        $complete = true;

        foreach (FIREWALL_TABLES as $table) {
            $path = __DIR__ . "/data/" . $table;
            $content = @file_get_contents($path);

            if ($content === false || trim($content) === "") {
                $complete = false;
                break;
            }

            $data[$table] = parseFirewallDump($content);
        }

        if ($complete) {
            writeJsonAtomically(__DIR__ . "/db/firewall.json", $data);
        }
    } catch (Throwable $throwable) {
        error_log("Firewall parser error: " . $throwable->getMessage());
    }

    sleep(2);
}
