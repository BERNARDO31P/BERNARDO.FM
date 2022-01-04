<?php
/*
 * Funktion: special_split()
 * Autor: Bernardo de Oliveira & lonesomeday (https://stackoverflow.com/a/4538153)
 * Argumente:
 *  string: (String) Definiert den Text, welcher geteilt werden soll
 *  columns: (String) Definiert den Spaltentext
 *
 * Da str_split() keine Zusammenhänge erkennt und nur ein Zeichen beachtet, wurde diese Funktion programmiert
 * Funktioniert wie str_split(), teilt bei jedem Leerzeichen, beachtet aber zusammenhängende Zeichen
 * Teilt nicht, wenn die Zeichenfolge sich zwischen Klammern () oder zwischen \/**\/ befindet (ohne \).
 */
function special_split($string, $columns): array
{
    $column = (strpos(strtolower($string), 'pkts') !== false || strpos(strtolower($string), 'chain') !== false);
    $level = 0;
    $ret = array("");
    $cur = 0;
    $found = false;
    $whitespace = false;
    $extra = false;

    for ($i = 0; $i < strlen($string); $i++) {
        switch ($string[$i]) {
            case "/":
                if (isset($string[$i + 1]) && $string[$i + 1] === "*") $level++;
                elseif (isset($string[$i - 1]) && $string[$i - 1] === "*") $level--;

                $ret[$cur] .= "/";
                break;
            case '(':
                $level++;
                $ret[$cur] .= '(';
                break;
            case ')':
                $level--;
                $ret[$cur] .= ')';
                break;
            case ' ':
                if (!$level) {
                    if (!$column) {
                        if (strlen($columns) < $i) {
                            $extra = true;
                            $ret[$cur] .= ' ';
                            break;
                        }

                        if ($i && !$extra) {
                            if ($string[$i - 1] !== " " && !$found) {
                                $found = true;
                                $cur++;
                                $ret[$cur] = "";
                                break;
                            }

                            if (isset($columns[$i]) && $columns[$i] === " " && !$found) {
                                $found = true;
                                $cur++;
                                $ret[$cur] = "";
                                break;
                            }

                            if (isset($columns[$i + 1]) && $columns[$i + 1] !== " " && !$whitespace) {
                                $hasValue = false;
                                for ($j = $i + 1; $j < 999; $j++) {
                                    if (isset($columns[$j]) && $columns[$j] === " ") break;

                                    if (isset($string[$j]) && $string[$j] !== " ") {
                                        $hasValue = true;
                                        break;
                                    }
                                }

                                if (!$hasValue) {
                                    $whitespace = true;
                                    $cur++;
                                    $ret[$cur] = "";
                                    break;
                                }
                            }
                        }
                    } else {
                        if (!$found && $i) {
                            $found = true;
                            $cur++;
                            $ret[$cur] = "";
                            break;
                        }
                    }
                }
            case '\t':
                if (!$level) break;
            default:
                $found = false;
                $whitespace = false;
                $ret[$cur] .= $string[$i];
        }
    }

    return $ret;
}

/*
 * Funktion: clearArray()
 * Autor: Bernardo de Oliveira
 * Argumente:
 *  array: (Array) Definiert das Array welches bereinigt werden soll
 *
 * Entfernt rekursiv alle leeren Elemente aus dem Array
 */
function clearArray($array, $columns = ""): array
{
    $array = array_filter($array);
    foreach ($array as $arrID => $value) {
        if (is_array($value)) {
            $array[$arrID] = clearArray($value, $columns);
        } else {
            $array[$arrID] = special_split($value, $columns);
            if (strpos(strtolower($value), 'pkts') !== false) {
                $columns = $value;
                $array[$arrID] = array_filter($array[$arrID]);
            }
        }

    }
    return array_filter($array);
}

/*
 * Funktion: sort_recursive()
 * Autor: Bernardo de Oliveira
 * Argumente:
 *  array: (Array) Definiert das Array welches sortiert werden soll
 *
 * Definiert die Array-Schlüssel neu, wenn diese aus Zahlen bestehen, damit keine Lücken vorhanden sind
 */
function sort_recursive(&$array)
{
    foreach ($array as &$value) {
        if (is_array($value)) sort_recursive($value);
    }
    unset($value);

    if (array_filter(array_keys($array), "is_int")) {
        $i = 0;
        $sorted = array();

        foreach ($array as $value) {
            $sorted[$i] = $value;
            $i++;
        }
        $array = $sorted;
    }
}

/*
 * Funktion: structureArray()
 * Autor: Bernardo de Oliveira
 * Argumente:
 *  array: (Array) Definiert das Array, welches neu strukturiert werden soll
 *
 * Findet heraus, welche Zeile die Array-Schlüssel beinhaltet
 * Ändert die nummerischen Array-Schlüssel von den Werten um zu den gefundenen Text-Schlüssel
 * Beispiel:
 *  Aus dem: array(array("Pakete", "Aktion", "IP"), array(300, "ACCEPT", "0.0.0.0/0"))
 *  Wird dem: array(array("Pakete" => 300, "Aktion" => "ACCEPT", "IP" => "0.0.0.0/0"))
 */
function structureArray($array): array
{
    $chain = null;
    $keys = array();
    foreach ($array as $arrID => &$value) {
        if (!is_int($arrID) && is_array($value)) {
            foreach ($value as $ruleID => $rule) {


                if (strtolower($rule[0]) === "chain") {
                    $chain = $rule[1];
                    unset($value[$ruleID]);
                    continue;
                }

                if ($rule[0] === "pkts") {
                    $keys = $rule;
                    unset($value[$ruleID]);
                    continue;
                }

                $removed = array();
                if (count($keys) !== count($rule)) {
                    $chunk = array_chunk($rule, count($keys), true);
                    if (isset($chunk[1])) {
                        $removed = $chunk[1];
                        $rule = array_slice($rule, 0, count($keys));
                    }

                }

                $extraKeys = array();
                if (count($removed)) {
                    foreach ($removed as $column) {
                        $matches = array();
                        if (preg_match('/dpt:(.*?)\s/', $column, $matches)) {
                            $extraKeys[] = "dport";
                            $rule[] = $matches[1];
                        }

                        if (preg_match('(NEW|RELATED|ESTABLISHED)', $column, $matches)) {
                            $extraKeys[] = "state";
                            $rule[] = $column;
                        }

                        if (preg_match('/\/\* (.*?) \*\//', $column, $matches)) {
                            $extraKeys[] = "comment";
                            $rule[] = $matches[1];
                        }
                    }
                }

                if (count($rule) === count(array_merge($keys, $extraKeys))) {
                    $value[$chain][] = array_combine(array_merge($keys, $extraKeys), $rule);
                }
                unset($value[$ruleID]);
            }
        }
    }
    return $array;
}

/*
 * Autor: Bernardo de Oliveira
 *
 * Holt die Regeln von der Firewall und speichert alle Tabellen in einem Array
 * Löscht alle leeren Elemente aus dem Array
 * Sortiert die Daten
 * Strukturiert die Daten neu
 * Speichert diese ab
 */
while (sleep(2) !== null) {
    $raw = shell_exec("sudo iptables -t raw -L -n -v | sed '/^[[:space:]]*$/d'");
    $mangle = shell_exec("sudo iptables -t mangle -L -n -v | sed '/^[[:space:]]*$/d'");
    $nat = shell_exec("sudo iptables -t nat -L -n -v | sed '/^[[:space:]]*$/d'");
    $filter = shell_exec("sudo iptables -t filter -L -n -v | sed '/^[[:space:]]*$/d'");

    $data = array();
    $data["raw"] = explode("\n", $raw);
    $data["mangle"] = explode("\n", $mangle);
    $data["nat"] = explode("\n", $nat);
    $data["filter"] = explode("\n", $filter);

    $data = clearArray($data);

    sort_recursive($data);

    $data = structureArray($data);

    file_put_contents(__DIR__ . "/../db/firewall.json", json_encode($data));
}
