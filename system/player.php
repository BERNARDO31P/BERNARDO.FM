<?php
ini_set('memory_limit', -1);

$db = json_decode(file_get_contents(__DIR__ . "/../db/songs.json"), true);
usort($db, function ($a, $b) {
    return $a['category'] <=> $b['category'];
});

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
function recursive_paging($array, $page, $pageCount): array
{
    return array();
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
function search_songs($search): array
{
    global $db;
    $songs = array();

    foreach ($db as $song) {
        if (
            (stripos($song["name"], $search) !== false) ||
            (stripos($song["artist"], $search) !== false) ||
            (stripos($song["category"], $search) !== false)
        ) {
            $songs[] = $song;
        }
    }

    return $songs;
}

// TODO: Comment
function search_song($id)
{
    global $db;

    foreach ($db as $arrID => $data) {
        if ($data["id"] == $id)
            return $data;
    }
    return array();
}

if (isset($_GET["id"])) {
    $song = search_song($_GET["id"]);

    if (isset($_GET["time"])) {
        include_once __DIR__ . "/vendor/autoload.php";
        $newName = "/temp/" . bin2hex(random_bytes(22)) . ".mp3";

        $ffmpeg = FFMpeg\FFMpeg::create(
            array(
                'ffmpeg.binaries' => "/usr/bin/ffmpeg",
                'ffprobe.binaries' => "/usr/bin/ffprobe",
                'timeout' => 10,
                'ffmpeg.threads' => 4,
            )
        );
        $audio = $ffmpeg->open(__DIR__ . "/music/" . $song["fileName"]);

        $time = 0;
        if ($_GET["time"] < 50) {
            $time = 5;
        } elseif ($_GET["time"] < 75) {
            $time = 10;
        } else {
            $time = 20;
        }

        $audio->filters()->clip(FFMpeg\Coordinate\TimeCode::fromSeconds($_GET["time"]), FFMpeg\Coordinate\TimeCode::fromSeconds($time));
        $format = new FFMpeg\Format\Audio\Mp3();
        $audio->save($format, __DIR__ . $newName);

        header('Content-Type: audio/mpeg');
        echo file_get_contents(__DIR__ . $newName);
        unlink(__DIR__ . $newName);
    } else {
        header('Content-Type: application/json');
        if (isset($song["playlist"])) {
            $playlist = array();
            foreach ($song["playlist"] as $songID) {
                $playlist[] = search_song($songID);
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
    }
} else {
    header('Content-Type: application/json');
    if (isset($_GET["search"]) && $_GET["search"] !== "") {
        $db = search_songs($_GET["search"]);

        recursive_unset($db, "fileName");
        recursive_prepend($db, "url", "system/img/");

        $db = sorting_by_category($db);
    } else {
        recursive_unset($db, "fileName");
        recursive_prepend($db, "url", "system/img/");
        $db = sorting_by_category($db);
        kshuffle($db, 2);
    }


    // TODO: Implement sorting system (ex. most views or newest first)

    echo json_encode($db);
}
