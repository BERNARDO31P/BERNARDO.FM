<?php

use Audero\WavExtractor\AuderoWavExtractor;
use Bramus\Router\Router;

include_once __DIR__ . "/vendor/autoload.php";
ini_set('memory_limit', '256M');

// TODO: Comment
function recursive_unset(&$array, $unwanted_key)
{
    unset($array[$unwanted_key]);
    foreach ($array as &$value) {
        if (is_array($value)) recursive_unset($value, $unwanted_key);
    }
}

// TODO: Comment
function recursive_prepend(&$array, $key, $data)
{
    foreach ($array as $arrKey => &$value) {
        if (is_array($value)) recursive_prepend($value, $key, $data);
        else {
            if ($arrKey === $key) {
                $value = $data . $value;
            }
        }
    }
}

// TODO: Comment
function sorting_by_category($array): array
{
    $parsed = array();
    foreach ($array as $id => $song) {
        $key = $song["category"];

        if (!array_key_exists($key, $parsed))
            $parsed[$key] = array();

        $parsed[$key][$id] = $song;
    }
    return $parsed;
}

// TODO: Comment
function paging($array, $page, $count = 10): array
{
    return $array;
}

// TODO: Comment
function kshuffle(&$array)
{
    $tmp = array();
    foreach ($array as $key => $value) {
        if (is_array($value)) kshuffle($value);

        if (is_int($key)) {
            $tmp[] = array('v' => $value);
        } else {
            $tmp[] = array('k' => $key, 'v' => $value);
        }

    }
    shuffle($tmp);
    $array = array();
    foreach ($tmp as $entry) {
        if (isset($entry['k'])) {
            $array[$entry['k']] = $entry['v'];
        } else {
            $array[] = $entry['v'];
        }
    }
}

// TODO: Comment
function search_songs($search, $db): array
{
    $songs = array();

    foreach ($db as $song) {
        if (
            (stripos($song["name"] ?? "", $search) !== false) ||
            (stripos($song["artist"] ?? "", $search) !== false) ||
            (stripos($song["category"] ?? "", $search) !== false)
        ) {
            $songs[] = $song;
        }
    }

    return $songs;
}

// TODO: Comment
function search_song($id, $db): array
{
    foreach ($db as $arrID => $data) {
        if ($data["id"] == $id)
            return $data;
    }
    return array();
}

// TODO: Comment
function loadDatabase() {
    $db = json_decode(file_get_contents(__DIR__ . "/db/songs.json"), true);
    usort($db, function ($a, $b) {
        return $a['category'] <=> $b['category'];
    });

    return $db;
}

$router = new Router();

$router->get('/songs(/\d+)?', function ($page = 1, $search = "") {
    $db = loadDatabase();

    header('Content-Type: application/json');
    recursive_unset($db, "fileName");
    recursive_prepend($db, "url", "system/img/");

    $db = sorting_by_category($db);
    $db = paging($db, $page);
    kshuffle($db);

    echo json_encode($db);
});

$router->get('/songs(/.*)?', function ($search) {
    $db = loadDatabase();

    header('Content-Type: application/json');
    $db = search_songs($search, $db);

    recursive_unset($db, "fileName");
    recursive_prepend($db, "url", "system/img/");

    $db = sorting_by_category($db);
    echo json_encode($db);
});

$router->get('/song/([\d]+)', function ($id) {
    $db = loadDatabase();
    $song = search_song($id, $db);

    header('Content-Type: application/json');
    if (isset($song["playlist"])) {
        $playlist = array();
        foreach ($song["playlist"] as $songID) {
            $playlist[] = search_song($songID, $db);
        }
        recursive_unset($playlist, "fileName");
        recursive_prepend($playlist, "url", "system/img/");

        shuffle($playlist);
        echo json_encode($playlist);
    } else {
        recursive_unset($song, "fileName");
        recursive_prepend($song, "url", "system/img/");

        echo json_encode($song);
    }
});

$router->get('/song/([\d]+)/([\d]+)', function ($id, $timeGet) {
    $time = 0;
    if ($timeGet < 50) {
        $time = 5;
    } elseif ($timeGet < 75) {
        $time = 10;
    } else {
        $time = 20;
    }

    $db = loadDatabase();
    $song = search_song($id, $db);

    try {
        $extractor = new AuderoWavExtractor(__DIR__ . "/music/" . $song["fileName"]);
        $part = $extractor->getChunk($timeGet * 1000, ($timeGet + $time) * 1000);

        header('Content-Type: audio/wav');
        header('Content-Length: ' . strlen($part));
        echo $part;
    } catch (\Exception $ex) {
        echo 'An error has occurred: ' . $ex->getMessage();
    }
});

$router->get('/monitoring', function () {
    header('Content-Type: application/json');
    echo file_get_contents(__DIR__ . "/db/monitoring.json");
});

$router->get('/firewall', function () {
    header('Content-Type: application/json');
    echo file_get_contents(__DIR__ . "/db/firewall.json");
});

$router->get('/changelog', function () {
    header('Content-Type: application/json');
    echo file_get_contents(__DIR__ . "/db/changelog.json");
});

$router->get('/img/(.*)', function ($image) {
    $imageUrl = __DIR__ . "/img/" . $image;
    $contentType = mime_content_type($imageUrl);

    header('Content-Type: ' . $contentType);
    echo file_get_contents(__DIR__ . "/img/" . $image);
});

$router->run();
