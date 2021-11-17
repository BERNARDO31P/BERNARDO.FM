<?php

// TODO: Comment
function myFilter($var): bool
{
    return ($var !== NULL && $var !== FALSE && $var !== '');
}

// TODO: Comment
function specialSplit($string): array
{
    $level = 0;
    $ret = array('');
    $cur = 0;

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
                if ($level == 0) {
                    $cur++;
                    $ret[$cur] = '';
                    break;
                }
            default:
                $ret[$cur] .= $string[$i];
        }
    }

    return $ret;
}

// TODO: Comment
function clearArray($array): array
{
    foreach ($array as $arrID => $value) {
        if (is_array($value)) {
            $array[$arrID] = clearArray($value);
        } else {
            $array[$arrID] = array_filter(specialSplit($value), 'myFilter');
        }

    }
    return array_filter($array);
}

// TODO: Comment
function sort_recursive(&$array, $flags = null) {
    foreach ($array as &$value) {
        if (is_array($value)) sort_recursive($value, $flags);
    }
    unset($value);

    if (array_filter(array_keys($array), "is_int"))  {
        $i = 0;
        $sorted = array();

        foreach ($array as $value) {
            $sorted[$i] = $value;
            $i++;
        }
        $array = $sorted;
    }
}

// TODO: Comment
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

                // TODO: Keep keys which get removed (Add as extra)
                if (count($keys) !== count($rule)) {
                    $rule = array_slice($rule, 0, count($keys));
                }

                $value[$chain][] = array_combine($keys, $rule);
                unset($value[$ruleID]);
            }
        }
    }
    return $array;
}

//while (sleep(2) !== null) {
    $raw = shell_exec("sudo iptables -t raw -L -n -v");
    $mangle = shell_exec("sudo iptables -t mangle -L -n -v");
    $filter = shell_exec("sudo iptables -t filter -L -n -v");

    $data = array();
    $data["raw"] = explode("\n", $raw);
    $data["mangle"] = explode("\n", $mangle);
    $data["filter"] = explode("\n", $filter);

    $data = clearArray($data);
    sort_recursive($data, SORT_NUMERIC);
    $data = structureArray($data);

    print_r($data["raw"]);

    file_put_contents(__DIR__ . "/../db/firewall.json", json_encode($data));
//}
