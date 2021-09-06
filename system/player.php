<?php
ini_set('memory_limit', -1);

$db = json_decode(file_get_contents(__DIR__ . "/../db/songs.json"), true);

function recursive_unset(&$array, $unwanted_key) {
    unset($array[$unwanted_key]);
    foreach ($array as &$value) {
        if (is_array($value))
            recursive_unset($value, $unwanted_key);
    }
}

function search_songs($search) {
    global $db;
    $songs = array();

    foreach($db as $arrID => $data) {
        if ((stripos($data["name"], $search) !== false)) {
            array_push($songs, $data);
        } else if ((stripos($data["artist"], $search) !== false)) {
            array_push($songs, $data);
        }
    }

    return $songs;
}

function search_song($id) {
    global $db;

    foreach ($db as $arrID => $data) {
        if ($data["id"] == $id)
            return $data;
    }
    return array();
}

ob_start();
header('Content-Type: application/json');
if (isset($_GET["id"])) {
    include_once __DIR__ . "/vendor/autoload.php";

    $song = search_song($_GET["id"]);
    $newName = "/temp/" . bin2hex(random_bytes(22)) . ".mp3";

    $time = 0;
    $timeSet = false;
    if (isset($_GET["time"]) && $_GET["time"] !== 0) {
        $time += $_GET["time"];
        $timeSet = true;
    }

    \falahati\PHPMP3\MpegAudio::fromFile(__DIR__ . "/music/" . $song["fileName"])->trim($time, $time + 20)->saveFile(__DIR__ . $newName);

    recursive_unset($song, "fileName");
    $song["location"] = "/system" . $newName;

    if ($timeSet) {
        recursive_unset($song, "id");
        recursive_unset($song, "name");
        recursive_unset($song, "artist");
        recursive_unset($song, "length");
    }

    echo json_encode($song);
} else {
    recursive_unset($db, "fileName");

    if (isset($_GET["search"]) && $_GET["search"] !== "")
        echo json_encode(search_songs($_GET["search"]));
    else
        echo json_encode($db);
}

$size = ob_get_length();
header("Content-Encoding: none");
header("Content-Length: " . $size);
header("Connection: close");

ob_end_flush();
@ob_flush();
flush();

if (session_id()) session_write_close();

$files = glob(__DIR__ . "/temp/*");
foreach ($files as $file) {
    if (is_file($file) && time() - filemtime($file) >= 60 * 60 * 24)
        unlink($file);
}