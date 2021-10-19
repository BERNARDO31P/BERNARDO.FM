<?php
ini_set('memory_limit', -1);

$db = json_decode(file_get_contents(__DIR__ . "/../db/songs.json"), true);
usort($db, function ($a, $b) {
	return $a['category'] <=> $b['category'];
});

function recursive_unset(&$array, $unwanted_key)
{
	unset($array[$unwanted_key]);
	foreach ($array as &$value) {
		if (is_array($value))
			recursive_unset($value, $unwanted_key);
	}
}

function search_songs($search): array
{
	global $db;
	$songs = array();

	foreach ($db as $arrID => $data) {
		if ((stripos($data["name"], $search) !== false)) {
			array_push($songs, $data);
		} else if ((stripos($data["artist"], $search) !== false)) {
			array_push($songs, $data);
		} else if ((stripos($data["category"], $search) !== false)) {
			array_push($songs, $data);
		}
	}

	return $songs;
}

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
                'ffmpeg.binaries'  => "/usr/bin/ffmpeg",
                'ffprobe.binaries' => "/usr/bin/ffprobe",
                'timeout'          => 10,
                'ffmpeg.threads'   => 4,
            )
        );
		$audio = $ffmpeg->open(__DIR__ . "/music/" . $song["fileName"]);
		$audio->filters()->clip(FFMpeg\Coordinate\TimeCode::fromSeconds($_GET["time"]), FFMpeg\Coordinate\TimeCode::fromSeconds(20));
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
            echo json_encode($playlist);
        } else {
            recursive_unset($song, "fileName");
            echo json_encode($song);
        }
    }
} else {
    header('Content-Type: application/json');
	recursive_unset($db, "fileName");

	if (isset($_GET["search"]) && $_GET["search"] !== "")
		echo json_encode(search_songs($_GET["search"]));
	else {
		shuffle($db);
		echo json_encode($db);
	}
}
