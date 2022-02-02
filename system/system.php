<?php

use Audero\WavExtractor\AuderoWavExtractor;
use Bramus\Router\Router;

include_once __DIR__ . "/vendor/autoload.php";
ini_set('memory_limit', '256M');
session_start();

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
function paging($array, $page, $count): array
{
	$new = array();

	foreach ($array as $category => $songs) {
		$new[$category] = array_splice($songs, ($page - 1) * $count, $count);
	}

	return $new;
}

// TODO: Comment
function category_paging($array, $page, $category, $count): array
{
	$new = array();

	$array = array_change_key_case($array);
	if (isset($array[$category])) {
		$new = array_splice($array[$category], ($page - 1) * $count, $count);
	}

	return $new;
}

// TODO: Comment
function shuffle_level(&$array, $level, $current = 0)
{
	if ($level === $current) {
		$keys = array_keys($array);
		shuffle($keys);

		$new = array();
		foreach ($keys as $key) {
			if (is_numeric($key))
				$new[] = $array[$key];
			else
				$new[$key] = $array[$key];
		}

		$array = $new;

	} else {
		foreach ($array as $value) {
			if (is_array($value))
				shuffle_level($value, $level, $current + 1);
		}
	}

	return true;
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
function loadDatabase()
{
	if ($_SESSION["database"] !== null && file_exists($_SESSION["database"]))
		$db = json_decode(file_get_contents($_SESSION["database"]), true);
	else {
		$db = json_decode(file_get_contents(__DIR__ . "/db/songs.json"), true);
		shuffle_level($db, 0);

		$tempDB = __DIR__ . "/temp/" . uniqid(rand(), true) . ".json";
		$_SESSION["database"] = $tempDB;
		file_put_contents($tempDB, json_encode($db));
	}

	usort($db, function ($a, $b) {
		return $a['category'] <=> $b['category'];
	});

	return $db;
}

// TODO: Comment
function loadHashDatabase()
{
	$dbFile = __DIR__ . "/db/hashes.json";
	if (!file_exists($dbFile)) touch($dbFile);

	return json_decode(file_get_contents($dbFile), true);
}

// TODO: Comment
function generatePictures(&$db, $hashDB, $length = 200): string
{
	$i = 0;
	$imagick = new Imagick();
	$hash = md5(http_build_query($db));
	$data = array("coverPos" => array());
	foreach ($db as &$category) {
		foreach ($category as &$song) {
			if (isset($song["cover"])) {
				$imagick->readImage("img/" . $song["cover"]);
				$imagick->scaleImage($length, $length);

				$pos = $i * $length;
				$song["coverPos"] = $pos;
				$data["coverPos"][$song["id"]] = $pos;
				$i++;
			}
		}
	}

	$imagick->resetIterator();
	$out = $imagick->appendImages(false);
	$out->setImageFormat("jpg");

	$newImage = "temp/" . uniqid(rand(), true) . ".jpg";
	$data["image"] = "system/" . $newImage;

	$out->writeimage($newImage);
	add_hash($hash, $data, $hashDB);

	return $data["image"];
}

// TODO: Comment
function category_generatePictures(&$db, $hashDB, $length = 200): string
{
	$i = 0;
	$imagick = new Imagick();
	$hash = md5(http_build_query($db));
	$data = array("coverPos" => array());
	foreach ($db as &$song) {
		if (isset($song["cover"])) {
			$imagick->readImage("img/" . $song["cover"]);
			$imagick->scaleImage($length, $length);

			$pos = $i * $length;
			$song["coverPos"] = $pos;
			$data["coverPos"][$song["id"]] = $pos;
			$i++;
		}
	}

	$imagick->resetIterator();
	$out = $imagick->appendImages(false);
	$out->setImageFormat("jpg");

	$newImage = "temp/" . uniqid(rand(), true) . ".jpg";
	$data["image"] = "system/" . $newImage;

	$out->writeimage($newImage);
	add_hash($hash, $data, $hashDB);

	return $data["image"];
}

// TODO: Comment
function add_hash($hash, $value, $hashDB)
{
	$dbFile = __DIR__ . "/db/hashes.json";
	$hashDB[$hash] = $value;

	file_put_contents($dbFile, json_encode($hashDB));
}

// TODO: Comment
function check_hash($db, $hashDB)
{
	$hash = md5(http_build_query($db));

	if (isset($hashDB[$hash]))
		return $hashDB[$hash]["image"];

	return null;
}

// TODO: Comment
function apply_hash(&$db, $hashDB)
{
	$hash = md5(http_build_query($db));
	foreach ($db as &$category) {
		foreach ($category as &$song) {
			$song["coverPos"] = $hashDB[$hash]["coverPos"][$song["id"]];
		}
	}
}

// TODO: Comment
function category_apply_hash(&$db, $hashDB)
{
	$hash = md5(http_build_query($db));
	foreach ($db as &$song) {
		$song["coverPos"] = $hashDB[$hash]["coverPos"][$song["id"]];
	}
}

$router = new Router();

// Normale Anfrage (Seite neu geladen)
$router->get('/songs/([\d]+)', function ($count) {
	$db = loadDatabase();

	header('Content-Type: application/json');

	$db = sorting_by_category($db);
	$db = paging($db, 1, $count);

	recursive_unset($db, "fileName");

	if (count($db)) {
		$hashDB = loadHashDatabase();

		$url = check_hash($db, $hashDB);
		if ($url === null) {
			$url = generatePictures($db, $hashDB);
		} else {
			apply_hash($db, $hashDB);
		}

		$db["cover"] = $url;
	}

	shuffle_level($db, 0);

	echo json_encode($db);
});

// Mehr laden (Nachdem die Seite geladen hat)
$router->get('/songs/([^\/]*)/([\d]+)/([\d]+)', function ($category, $page, $count) {
	$db = loadDatabase();

	header('Content-Type: application/json');

	$db = sorting_by_category($db);
	$db = category_paging($db, $page, strtolower($category), $count);

	recursive_unset($db, "fileName");

	if (count($db)) {
		$hashDB = loadHashDatabase();

		$url = check_hash($db, $hashDB);
		if ($url === null) {
			$url = category_generatePictures($db, $hashDB);
		} else {
			category_apply_hash($db, $hashDB);
		}

		$db["cover"] = $url;
	}

	shuffle_level($db, 0);

	echo json_encode($db);
});

// Suche
$router->get('/songs/([^\/]*)/([\d]+)', function ($search, $count) {
	$db = loadDatabase();

	header('Content-Type: application/json');
	$db = search_songs($search, $db);

	$db = sorting_by_category($db);
	$db = paging($db, 1, $count);

	recursive_unset($db, "fileName");

	if (count($db)) {
		$hashDB = loadHashDatabase();

		$url = check_hash($db, $hashDB);
		if ($url === null) {
			$url = generatePictures($db, $hashDB);
		} else {
			apply_hash($db, $hashDB);
		}

		$db["cover"] = $url;
	}

	echo json_encode($db);
});

// Suche mehr laden
$router->get('/songs/([^\/]*)/([^\/]*)/([\d]+)/([\d]+)', function ($search, $category, $page, $count) {
	$db = loadDatabase();

	header('Content-Type: application/json');
	$db = search_songs($search, $db);

	$db = sorting_by_category($db);
	$db = category_paging($db, $page, strtolower($category), $count);

	recursive_unset($db, "fileName");

	if (count($db)) {
		$hashDB = loadHashDatabase();

		$url = check_hash($db, $hashDB);
		if ($url === null) {
			$url = category_generatePictures($db, $hashDB);
		} else {
			category_apply_hash($db, $hashDB);
		}

		$db["cover"] = $url;
	}

	echo json_encode($db);
});

// Song Informationen (Bei Playlists)
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
		recursive_prepend($playlist, "cover", "system/img/");

		shuffle($playlist);
		echo json_encode($playlist);
	} else {
		recursive_unset($song, "fileName");
		recursive_prepend($song, "cover", "system/img/");

		echo json_encode($song);
	}
});

// Wenn ein Lied abgespielt wird, neue Teile laden
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
		$duration = $extractor->getDuration() / 1000;

		if ($duration <= $timeGet + $time) $till = $duration;
		else $till = $timeGet + $time;

		$part = $extractor->getChunk($timeGet * 1000, $till * 1000);

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
	echo file_get_contents($imageUrl);
});

$router->get('/temp/(.*)', function ($image) {
	$imageUrl = __DIR__ . "/temp/" . $image;
	$contentType = mime_content_type($imageUrl);

	header('Content-Type: ' . $contentType);
	echo file_get_contents($imageUrl);
});

$router->run();
