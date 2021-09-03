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

function search_song($id) {
    GLOBAL $db;

    foreach($db as $arrID => $data) {
        if ($data["id"] == $id)
            return $data;
    }
    return array();
}

header('Content-Type: application/json');
if (isset($_GET["id"])) {
    include_once __DIR__ . "/assets/lib/mp3.class.php";

    $song = search_song($_GET["id"]);
    $newName =  "/temp/" . bin2hex(random_bytes(22)) . ".mp3";

    $time = 0;
    $timeSet = false;
    if (isset($_GET["time"]) && $_GET["time"] !== 0) {
        $time += $_GET["time"];
        $timeSet = true;
    }

    (new mp3)->cut_mp3(__DIR__ . "/music/" . $song["fileName"], __DIR__ . $newName, $time, $time + 20, 'second');

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
    echo json_encode($db);
}

