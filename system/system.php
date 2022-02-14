<?php

use Audero\WavExtractor\AuderoWavExtractor;
use Bramus\Router\Router;

include_once __DIR__ . "/vendor/autoload.php";
ini_set('memory_limit', '256M');
session_start();

/*
 * Funktion: loadDatabase()
 * Autor: Bernardo de Oliveira
 *
 * Lädt die individualisierte Datenbank, falls vorhanden
 *
 * Lädt sonst die standardmässige Datenbank und mischt sie
 * Speichert die neue Datenbank ab und speichert den Namen in die Session
 *
 * Gibt die Datenbank zurück
 */
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

/*
 * Funktion: loadHashDatabase()
 * Autor: Bernardo de Oliveira
 *
 * Lädt die Hash Datenbank, falls vorhanden
 * Erstellt sie sonst
 */
function loadHashDatabase()
{
    $dbFile = __DIR__ . "/db/hashes.json";
    if (!file_exists($dbFile)) touch($dbFile);

    return json_decode(file_get_contents($dbFile), true);
}

/*
 * Funktion: recursive_unset()
 * Autor: Bernardo de Oliveira
 * Argumente:
 *  object: (Object) Die Daten, welche manipuliert werden sollen
 *  key: (String) Den zu entfernenden Schlüssel
 *
 * Entfernt ein unerwünschter Schlüssel mit den jeweiligen Daten dazu
 */
function recursive_unset(&$object, $key)
{
    unset($object[$key]);
    foreach ($object as &$value) {
        if (is_array($value))
            recursive_unset($value, $key);
    }
}

/*
 * Funktion: recursive_prepend()
 * Autor: Bernardo de Oliveira
 * Argumente:
 *  object: (Object) Die Daten, welche manipuliert werden sollen
 *  key: (String) Den Schlüsselnamen, den man manipulieren möchte
 *  data: (String) Den Wert, den man hinzufügen möchte
 *
 * Fügt einen Wert zu einem bestehenden Wert vorne hinzu
 * Dieser Wert wird anhand von einem Schlüssel gefunden
 */
function recursive_prepend(&$object, $key, $data)
{
    foreach ($object as $loopKey => &$value) {
        if (is_array($value))
            recursive_prepend($value, $key, $data);
        else {
            if ($loopKey === $key)
                $value = $data . $value;
        }
    }
}

/*
 * Funktion: sorting_by_category()
 * Autor: Bernardo de Oliveira
 * Argumente:
 *  object: (Object) Die Daten, welche manipuliert werden sollen
 *
 * Sortiert die Daten je nach Kategorie
 * Gibt ein neues, sortiertes Objekt zurück
 */
function sorting_by_category($object): array
{
    $parsed = array();
    foreach ($object as $id => $song) {
        $key = $song["category"];

        if (!array_key_exists($key, $parsed))
            $parsed[$key] = array();

        $parsed[$key][$id] = $song;
    }
    return $parsed;
}

/*
 * Funktion: paging()
 * Autor: Bernardo de Oliveira
 * Argumente:
 *  object: (Object) Die Daten, welche manipuliert werden sollen
 *
 * Sortiert die Daten je nach Kategorie
 * Gibt ein neues, sortiertes Objekt zurück
 */
function paging($object, $page, $count, $category = null): array
{
    $new = array();

    if ($category) {
        $object = array_change_key_case($object);
        if (isset($object[$category]))
            $new = array_splice($object[$category], ($page - 1) * $count, $count);
    } else {
        foreach ($object as $category => $songs)
            $new[$category] = array_splice($songs, ($page - 1) * $count, $count);
    }

    return $new;
}

/*
 * Funktion: shuffle_level()
 * Autor: Bernardo de Oliveira
 * Argumente:
 *  object: (Object) Die Daten, welche manipuliert werden sollen
 *  level: (Integer) Definiert das Objekten-Level, welches gemischt werden soll
 *  current: (Integer) Definiert das derzeitige Level
 *
 * Mischt die Daten in einem bestimmten Level
 * Behält die Schlüssel bei einem Objekt
 */
function shuffle_level(&$object, $level, $current = 0)
{
    if ($level === $current) {
        $keys = array_keys($object);
        shuffle($keys);

        $new = array();
        foreach ($keys as $key) {
            if (is_numeric($key))
                $new[] = $object[$key];
            else
                $new[$key] = $object[$key];
        }

        $object = $new;
    } else {
        foreach ($object as $value) {
            if (is_array($value))
                shuffle_level($value, $level, $current + 1);
        }
    }
}

/*
 * Funktion: search_songs()
 * Autor: Bernardo de Oliveira
 * Argumente:
 *  search: (String) Definiert die Suche
 *  db: (Object) Definiert die Datenbank
 *
 * Sucht in der Datenbank nach Daten, die mit der Suche übereinstimmen
 *
 * Überprüft wird: Songname, Künstlername und Kategorie
 */
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

/*
 * Funktion: search_song()
 * Autor: Bernardo de Oliveira
 * Argumente:
 *  id: (Integer) Definiert die Lied ID
 *  db: (Object) Definiert die Datenbank
 *
 * Sucht ein Lied anhand von der ID
 */
function search_song($id, $db): array
{
    foreach ($db as $data) {
        if ($data["id"] == $id)
            return $data;
    }
    return array();
}

/*
 * Funktion: generatePictures()
 * Autor: Bernardo de Oliveira
 * Argumente:
 *  db: (Object) Definiert die Datenbank
 *  hashDB: (Object) Definiert die Hash Datenbank
 *  hasCategory: (Boolean) Definiert ob die Daten kategorisiert sind
 *  length: (Integer) Definiert die Seitenlänge der Bilder in Pixel
 *
 * Generiert aus den Daten einen Hash und ein CSS Sprite
 * Speichert die Spriteinformationen in die normale (temporär) und in die Hash Datenbank ab
 *
 * Gibt den Speicherort des Bildes zurück
 */
function generatePictures(&$db, $hashDB, $hasCategory, $length = 200): string
{
    $i = 0;
    $imagick = new Imagick();
    $hash = generate_hash($db);
    $data = array("coverPos" => array());
    if ($hasCategory) {
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
    } else {
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

/*
 * Funktion: generate_hash()
 * Autor: Bernardo de Oliveira
 * Argumente:
 *  data: (Object) Definiert die Daten mit den Songs
 *  songs: (Array) Defineirt das Array mit den Song IDs
 *
 * Generiert aus den sortierten Song IDs einen Hash
 * Dafür da, damit die Generierung des Hashes immer gleich ist
 */
function generate_hash($data, &$songs = array()): string
{
    foreach ($data as $value) {
        if (is_array($value) && !isset($value["id"])) {
            generate_hash($value, $songs);
        } else {
            if (isset($value["id"]))
                $songs[] = $value["id"];
        }
    }

    sort($songs);
    return md5(http_build_query($songs));
}

/*
 * Funktion: add_hash()
 * Autor: Bernardo de Oliveira
 * Argumente:
 *  hash: (String) Definiert den Hash
 *  value: (String) Definiert die Daten zum Hash
 *  hashDB: (Object) Definiert die Hash Datenbank
 *
 * Speichert einen Hash (als Schlüssel) und die dazugehörigen Daten (als Wert) ab
 */
function add_hash($hash, $value, $hashDB)
{
    $dbFile = __DIR__ . "/db/hashes.json";
    $hashDB[$hash] = $value;

    file_put_contents($dbFile, json_encode($hashDB));
}

/*
 * Funktion: check_hash()
 * Autor: Bernardo de Oliveira
 * Argumente:
 *  db: (Object) Definiert die Datenbank
 *  hashDB: (Object) Definiert die Hash Datenbank
 *
 * Generiert einen Hash aus den Daten
 * Überprüft ob der Hash in der Hash Datenbank vorkommt
 *
 * Gibt den Speicherort des Bildes zurück
 */
function check_hash($db, $hashDB)
{
    $hash = generate_hash($db);

    if (isset($hashDB[$hash]))
        return $hashDB[$hash]["image"];

    return null;
}

/*
 * Funktion: check_hash()
 * Autor: Bernardo de Oliveira
 * Argumente:
 *  db: (Object) Definiert die Datenbank
 *  hashDB: (Object) Definiert die Hash Datenbank
 *  hasCategory: (Boolean) Definiert ob die Daten kategorisiert sind
 *
 * Generiert einen Hash aus den Daten
 * Sucht den Hash in der Datenbank
 * Speichert die Position des Covers vom Hash in die Datenbank ab
 */
function apply_hash(&$db, $hashDB, $hasCategory)
{
    $hash = generate_hash($db);

    if ($hasCategory) {
        foreach ($db as &$category) {
            foreach ($category as &$song) {
                if (isset($hashDB[$hash]["coverPos"][$song["id"]]))
                    $song["coverPos"] = $hashDB[$hash]["coverPos"][$song["id"]];
            }
        }
    } else {
        foreach ($db as &$song) {
            if (isset($hashDB[$hash]["coverPos"][$song["id"]]))
                $song["coverPos"] = $hashDB[$hash]["coverPos"][$song["id"]];
        }
    }
}

$router = new Router();

/*
 * Funktion: Anonym
 * Autor: Bernardo de Oliveira
 * Argumente:
 *  count: (Integer) Definiert die Anzahl Lieder pro Kategorie
 *
 * Lädt die Datenbank
 * Sortiert die Lieder nach Kategorie
 * Limitiert die Daten auf die erste Seite
 * Löscht den Song Speicherort von den Daten
 *
 * Findet den Hash, der zu den Daten passt
 * Sonst generiert er einen neuen
 *
 * Mischt die Kategorien
 */
$router->get('/songs/([\d]+)', function ($count) {
    $db = loadDatabase();
    $db = sorting_by_category($db);
    $db = paging($db, 1, $count);

    recursive_unset($db, "fileName");

    if (count($db)) {
        $hashDB = loadHashDatabase();

        $url = check_hash($db, $hashDB);
        if ($url === null) {
            $url = generatePictures($db, $hashDB, true);
        } else {
            apply_hash($db, $hashDB, true);
        }

        $db["cover"] = $url;
    }

    shuffle_level($db, 0);

    header('Content-Type: application/json');
    echo json_encode($db);
});

/*
 * Funktion: Anonym
 * Autor: Bernardo de Oliveira
 * Argumente:
 *  category: (String) Definiert die Kategorie, welche mehr laden soll
 *  page: (Integer) Definiert die momentane Seite
 *  count: (Integer) Definiert die Anzahl Lieder pro Kategorie
 *
 * Lädt die Datenbank
 * Sortiert die Lieder nach Kategorie
 * Limitiert die Daten auf die spezifische Seite und Kategorie
 * Löscht den Song Speicherort von den Daten
 *
 * Findet den Hash, der zu den Daten passt
 * Sonst generiert er einen neuen
 *
 * Mischt die Lieder
 */
$router->get('/songs/([^\/]*)/([\d]+)/([\d]+)', function ($category, $page, $count) {
    $db = loadDatabase();
    $db = sorting_by_category($db);
    $db = paging($db, $page, $count, strtolower($category));

    recursive_unset($db, "fileName");

    if (count($db)) {
        $hashDB = loadHashDatabase();

        $url = check_hash($db, $hashDB);
        if ($url === null) {
            $url = generatePictures($db, $hashDB, false);
        } else {
            apply_hash($db, $hashDB, false);
        }

        $db["cover"] = $url;
    }

    shuffle_level($db, 0);

    header('Content-Type: application/json');
    echo json_encode($db);
});

/*
 * Funktion: Anonym
 * Autor: Bernardo de Oliveira
 * Argumente:
 *  search: (String) Definiert die Suche
 *  count: (Integer) Definiert die Anzahl Lieder pro Kategorie
 *
 * Lädt die Datenbank
 * Sucht die Lieder, anhand der Suche
 * Sortiert die Lieder nach Kategorie
 * Limitiert die Daten auf die erste Seite
 * Löscht den Song Speicherort von den Daten
 *
 * Findet den Hash, der zu den Daten passt
 * Sonst generiert er einen neuen
 */
$router->get('/songs/([^\/]*)/([\d]+)', function ($search, $count) {
    $db = loadDatabase();
    $db = search_songs($search, $db);
    $db = sorting_by_category($db);
    $db = paging($db, 1, $count);

    recursive_unset($db, "fileName");

    if (count($db)) {
        $hashDB = loadHashDatabase();

        $url = check_hash($db, $hashDB);
        if ($url === null) {
            $url = generatePictures($db, $hashDB, true);
        } else {
            apply_hash($db, $hashDB, true);
        }

        $db["cover"] = $url;
    }

    header('Content-Type: application/json');
    echo json_encode($db);
});

/*
 * Funktion: Anonym
 * Autor: Bernardo de Oliveira
 * Argumente:
 *  search: (String) Definiert die Suche
 *  category: (String) Definiert die Kategorie, welche mehr laden soll
 *  page: (Integer) Definiert die momentane Seite
 *  count: (Integer) Definiert die Anzahl Lieder pro Kategorie
 *
 * Lädt die Datenbank
 * Sucht die Lieder, anhand der Suche
 * Sortiert die Lieder nach Kategorie
 * Limitiert die Daten auf die spezifische Seite und Kategorie
 * Löscht den Song Speicherort von den Daten
 *
 * Findet den Hash, der zu den Daten passt
 * Sonst generiert er einen neuen
 */
$router->get('/songs/([^\/]*)/([^\/]*)/([\d]+)/([\d]+)', function ($search, $category, $page, $count) {
    $db = loadDatabase();
    $db = search_songs($search, $db);
    $db = sorting_by_category($db);
    $db = paging($db, $page, $count, strtolower($category));

    recursive_unset($db, "fileName");

    if (count($db)) {
        $hashDB = loadHashDatabase();

        $url = check_hash($db, $hashDB);
        if ($url === null) {
            $url = generatePictures($db, $hashDB, false);
        } else {
            apply_hash($db, $hashDB, false);
        }

        $db["cover"] = $url;
    }

    header('Content-Type: application/json');
    echo json_encode($db);
});

/*
 * Funktion: Anonym
 * Autor: Bernardo de Oliveira
 * Argumente:
 *  id: (Integer) Definiert die Lied ID
 *
 * Lädt die Datenbank
 * Sucht das Lied, anhand der ID
 *
 * Unterstützt auch Playlists
 * Mischt sie
 *
 * Löscht den Song Speicherort von den Daten
 *
 * Fügt dem Cover weitere Pfadinformationen hinzu
 */
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

        shuffle_level($playlist, 0);
        echo json_encode($playlist);
    } else {
        recursive_unset($song, "fileName");
        recursive_prepend($song, "cover", "system/img/");

        echo json_encode($song);
    }
});

/*
 * Funktion: Anonym
 * Autor: Bernardo de Oliveira
 * Argumente:
 *  id: (Integer) Definiert die Lied ID
 *
 * Lädt die Datenbank
 * Sucht das Lied, anhand der ID
 *
 * Lädt die Datenbank mit den Künstlerinformationen
 * Sucht die Informationen zum Lied
 *
 * Gibt diese zurück
 */
$router->get('/info/([\d]+)', function ($id) {
    $db = loadDatabase();
    $song = search_song($id, $db);

    header('Content-Type: application/json');
    $infoDB = json_decode(file_get_contents(__DIR__ . "/db/infos.json"), true);

    if (isset($song["info"])) {
        if (is_array($song["info"])) {
            $infos = array();
            foreach ($song["info"] as $infoID)
                $infos[] = $infoDB[$infoID];

            echo json_encode($infos);

        } else echo json_encode(array("0" => $infoDB[$song["info"]]));
    } else echo null;
});

/*
 * Funktion: Anonym
 * Autor: Bernardo de Oliveira
 * Argumente:
 *  id: (Integer) Definiert die Lied ID
 *  timeFrom: (Integer) Definiert die Startzeit vom Lied-Teil
 *  timeTill: (Integer) Definiert die Endzeit vom Lied-Teil
 *
 * timeTill kommt nur zur Verwendung, wenn eine ungewöhnliche Länge fehlt (z.B. 18 Sekunden)
 * Beispiel:
 * - Teil 60 - 80 Sekunden wird geladen
 * - Benutzer springt zu Sekunde 98
 * - Somit wird der Teil 98 - 118 Sekunden geladen
 * - Jetzt fehlt der Teil 80 - 98, was 18 Sekunden sind
 * - Hier kommt timeTill zu Nutzen
 *
 * Berechnet die Dauer des Teils anhand der Startzeit
 * Lädt die Datenbank
 * Sucht das Lied, anhand der ID
 *
 * Schneidet das Lied anhand der Start- und Endinformationen
 * Gibt den Teil aus
 */
$router->get('/song/([\d]+)/([\d]+)(/[\d]+)?', function ($id, $timeFrom, $timeTill = null) {
    if (empty($timeTill)) $timeTill = 99;

    $time = 0;
    if ($timeFrom < 50) {
        $time = ($timeTill <= 5) ? $timeTill : 5;
    } elseif ($timeFrom < 75) {
        $time = ($timeTill <= 10) ? $timeTill : 10;
    } else {
        $time = ($timeTill <= 20) ? $timeTill : 20;
    }

    $db = loadDatabase();
    $song = search_song($id, $db);

    try {
        $extractor = new AuderoWavExtractor(__DIR__ . "/music/" . $song["fileName"]);
        $duration = $extractor->getDuration() / 1000;

        if ($duration <= $timeFrom + $time) $till = $duration;
        else $till = $timeFrom + $time;

        $part = $extractor->getChunk($timeFrom * 1000, $till * 1000);

        header('Content-Type: audio/wav');
        header('Content-Length: ' . strlen($part));
        echo $part;
    } catch (\Exception $ex) {
        echo 'An error has occurred: ' . $ex->getMessage();
    }
});

/*
 * Funktion: Anonym
 * Autor: Bernardo de Oliveira
 *
 * Lädt die Monitoring-Daten und gibt sie aus
 */
$router->get('/monitoring', function () {
    header('Content-Type: application/json');
    echo file_get_contents(__DIR__ . "/db/monitoring.json");
});

/*
 * Funktion: Anonym
 * Autor: Bernardo de Oliveira
 *
 * Lädt die Firewall-Daten und gibt sie aus
 */
$router->get('/firewall', function () {
    header('Content-Type: application/json');
    echo file_get_contents(__DIR__ . "/db/firewall.json");
});

/*
 * Funktion: Anonym
 * Autor: Bernardo de Oliveira
 *
 * Lädt die Changelog-Daten und gibt sie aus
 */
$router->get('/changelog', function () {
    header('Content-Type: application/json');
    echo file_get_contents(__DIR__ . "/db/changelog.json");
});

/*
 * Funktion: Anonym
 * Autor: Bernardo de Oliveira
 *
 * Lädt das gewünschte Bild und gibt es aus
 * Dafür da, sodass direkter Zugriff nicht möglich ist
 */
$router->get('/img/(.*)', function ($image) {
    $imageUrl = __DIR__ . "/img/" . $image;
    $contentType = mime_content_type($imageUrl);

    header('Content-Type: ' . $contentType);
    echo file_get_contents($imageUrl);
});

/*
 * Funktion: Anonym
 * Autor: Bernardo de Oliveira
 *
 * Lädt die gewünschte Datei und gibt sie aus
 * Dafür da, sodass direkter Zugriff nicht möglich ist
 */
$router->get('/temp/(.*)', function ($image) {
    $imageUrl = __DIR__ . "/temp/" . $image;
    $contentType = mime_content_type($imageUrl);

    header('Content-Type: ' . $contentType);
    echo file_get_contents($imageUrl);
});

$router->run();
