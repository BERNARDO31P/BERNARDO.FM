<?php

const oneDay = 86400;

use Bramus\Router\Router;

include_once __DIR__ . "/vendor/autoload.php";
ini_set("memory_limit", "256M");

ini_set("session.gc_maxlifetime", oneDay);
ini_set("session.cookie_lifetime", oneDay);
session_set_cookie_params(oneDay);
session_start();

$queryArray = explode("?", $_SERVER["REQUEST_URI"]);
if (isset($queryArray[1])) {
    $parameters = explode("&", $queryArray[1]);

    foreach ($parameters as $parameter) {
        $parameter           = explode("=", $parameter);
        $_GET[$parameter[0]] = $parameter[1];
    }
}

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
    if (isset($_SESSION["database"]) && file_exists($_SESSION["database"]))
        $db = json_decode(file_get_contents($_SESSION["database"]), true);
    else {
        $db = json_decode(file_get_contents(__DIR__ . "/db/songs.json"), true);
        shuffle_level($db, 0);

        $tempDB               = __DIR__ . "/temp/" . uniqid(rand(), true) . ".json";
        $_SESSION["database"] = $tempDB;
        file_put_contents($tempDB, json_encode($db));
    }

    usort($db, function ($a, $b) {
        return $a["category"] <=> $b["category"];
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
function recursive_unset(&$object, $key): void
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
function recursive_prepend(&$object, $key, $data): void
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
 *  category: (String) Definiert, welche und ob eine Kategorie geladen werden soll
 *
 * Sortiert die Daten je nach Kategorie
 * Gibt ein neues, sortiertes Objekt zurück
 */
function sorting_by_category($object, $category = null): array
{
    $parsed = array();
    foreach ($object as $song) {
        $key = $song["category"];

        if (!array_key_exists($key, $parsed))
            $parsed[$key] = array();

        $parsed[$key][] = $song;
    }

    if ($category === null) {
        join_songs($object, $parsed);
    } elseif (isset($parsed[$category]["playlist"])) {
        join_playlist($object, $parsed[$category]["playlist"]);
    }

    return $parsed;
}

function join_songs($object, &$parsed): void
{
    foreach ($parsed["Albums"] as &$album) {
        $albumInfo = explode(" - ", $album["name"]);

        $album["artist"] = $albumInfo[0];
        $album["name"]   = $albumInfo[1];

        join_playlist($object, $album["playlist"]);
    }

    foreach ($parsed["Playlists"] as &$playlist) {
        join_playlist($object, $playlist["playlist"]);
    }
}

function join_playlist($object, &$playlist): void
{
    foreach ($playlist as &$songReference) {
        $songReference = search_song($songReference, $object);
    }

    $playlist["count"] = count($playlist);
}

/*
 * Funktion: paging()
 * Autor: Bernardo de Oliveira
 * Argumente:
 *  &$data: (array) Die Daten, welche manipuliert werden sollen
 *  $currentPage: (int) Die aktuelle Seitenzahl (beginnend mit 1)
 *  $itemsPerPage: (int) Die Anzahl der Elemente, die pro Seite angezeigt werden sollen
 *
 * Paginiert die Daten basierend auf der aktuellen Seite und der Anzahl der Elemente pro Seite.
 * Die Funktion arbeitet sowohl mit sequenziellen Arrays als auch mit assoziativen Arrays, die Unterarrays enthalten.
 * Manipuliert das Eingabe-Datenarray direkt.
 */
function paging(array &$data, int $currentPage, int $itemsPerPage): void
{
    $offset = ($currentPage - 1) * $itemsPerPage;

    if (array_is_list($data)) {
        $data = array_slice($data, $offset, $itemsPerPage);
    } else {
        foreach ($data as $category => $tracks) {
            $data[$category] = array_slice($tracks, $offset, $itemsPerPage);
        }
    }
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
function shuffle_level(&$object, $level, $current = 0): void
{
    try {
        if ($level >= $current) {
            $keys = array_keys($object);
            shuffle($keys);

            $shuffled = array();
            foreach ($keys as $key) {
                shuffle_level($object[$key], $level, $current + 1);

                if (is_numeric($key)) {
                    $shuffled[] = $object[$key];
                } else {
                    $shuffled[$key] = $object[$key];
                }
            }
            $object = $shuffled;
        }
    } catch (TypeError) {
        return;
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
 * Funktion: array_walk_multi_dimension()
 * Autor: Bernardo de Oliveira
 * Argumente:
 *  &$arr: (array) Das Array, welches manipuliert werden soll
 *  $callback: (callable) Die Funktion, die auf jedes Element angewendet werden soll
 *  ...$args: (array) Die Argumente, die an die Funktion übergeben werden sollen
 *
 * Wendet eine Funktion auf jedes Object eines mehrdimensionalen Arrays an
 */
function array_walk_multi_dimension(array &$arr, callable $callback, string ...$args): void
{
    foreach ($arr as &$value) {
        try {
            if (!array_is_list($value) && is_array($value)) {
                $callback($value, ...$args);
            } else {
                array_walk_multi_dimension($value, $callback, ...$args);
            }
        } catch (TypeError) {
        }
    }
}

/*
 * Funktion: generate_pictures()
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
function generate_pictures(array &$db, int $length = 200): void
{
    $tempDir = "temp/";
    @mkdir($tempDir);

    $imagePaths = [];
    $i          = 0;

    foreach ($db as &$row) {
        foreach ($row as &$song) {
            if (!is_array($song) || !isset($song["id"], $song["cover"])) {
                continue;
            }

            $cover = $song["cover"];

            $inputPath    = "img/" . $cover;
            $escapedInput = escapeshellarg($inputPath);

            $outputPath    = $tempDir . "resized_" . md5($cover) . ".png";
            $escapedOutput = escapeshellarg($outputPath);

            if (!file_exists($outputPath)) {
                if (file_exists($inputPath)) {
                    $resizeCmd = "magick $escapedInput -resize {$length}x{$length}^ -gravity center -extent {$length}x{$length} $escapedOutput";
                } else {
                    $resizeCmd = "magick -size {$length}x{$length} canvas:black $escapedOutput";
                }
                shell_exec($resizeCmd);
            }

            $song["coverPos"] = $i * $length;

            $imagePaths[] = $outputPath;
            $i++;
        }
    }

    if (empty($imagePaths)) {
        $db["cover"] = null;
        return;
    }

    $escapedImageList   = implode(" ", array_map("escapeshellarg", $imagePaths));
    $outputImage        = $tempDir . uniqid("cover_", true) . ".webp";
    $escapedOutputImage = escapeshellarg($outputImage);

    $combineCmd = "magick $escapedImageList +append -quality 85 $escapedOutputImage";
    shell_exec($combineCmd);

    $db["cover"] = "system/" . $outputImage;
}

/*
 * Funktion: generate_hash()
 * Autor: Bernardo de Oliveira
 * Argumente:
 *  data: (Object) Definiert die Daten mit den Songs
 *  songs: (Array) Definiert das Array mit den Song IDs
 *
 * Generiert aus den sortierten Song IDs einen Hash
 * Dafür da, damit die Generierung des Hashes immer gleich ist
 */
function generate_hash($data, &$songs = array()): string
{
    array_walk_multi_dimension($data, function (array $value) use (&$songs) {
        if (isset($value["cover"]) && !in_array($value["cover"], $songs))
            $songs[] = $value["cover"];
    });

    sort($songs);
    return md5(http_build_query($songs));
}

/*
 * Funktion: findExecutable()
 * Autor: Bernardo de Oliveira
 * Argumente:
 *  executableName: (String) Definiert den Namen des ausführbaren Programms
 *
 * Sucht nach einem ausführbaren Programm in den Verzeichnissen des PATH
 * Gibt den Pfad des Programms zurück, wenn es gefunden wurde
 * Gibt null zurück, wenn es nicht gefunden wurde
 */
function findExecutable($executableName): ?string
{
    $path     = getenv('PATH');
    $pathDirs = explode(PATH_SEPARATOR, $path);

    foreach ($pathDirs as $dir) {
        $executablePath = $dir . DIRECTORY_SEPARATOR . $executableName;
        if (is_executable($executablePath)) {
            return $executablePath;
        }
    }

    return null;
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
function add_hash($hash, $value, $hashDB): void
{
    $dbFile        = __DIR__ . "/db/hashes.json";
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
function check_hash($db, $hashDB): ?string
{
    $hash = generate_hash($db);

    if (isset($hashDB[$hash])) {
        $image = str_replace("system/", "", $hashDB[$hash]["image"]);

        if (file_exists(__DIR__ . "/" . $image)) {
            return $image;
        } else {
            unset($hashDB[$hash]);

            $dbFile = __DIR__ . "/db/hashes.json";
            file_put_contents($dbFile, json_encode($hashDB));
        }
    }
    return null;
}

/*
 * Funktion: apply_hash()
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
function apply_hash(&$db, $hashDB): void
{
    $hash = generate_hash($db);

    array_walk_multi_dimension($db, function (&$song) use ($hash, $hashDB) {
        if (isset($song["cover"]) && isset($hashDB[$hash]["coverPos"][$song["cover"]]))
            $song["coverPos"] = $hashDB[$hash]["coverPos"][$song["cover"]];
    });

    $db["cover"] = $hashDB[$hash]["image"];
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
$router->get("/songs/([\d]+)", function ($count) {
    $db = loadDatabase();
    $db = sorting_by_category($db);

    paging($db, 1, $count);
    recursive_unset($db, "fileName");

    if (count($db)) {
        generate_pictures($db);

        /*$hashDB = loadHashDatabase();

        $url = check_hash($db, $hashDB);
        ($url === null)
            ? generate_pictures($db, $hashDB)
            : apply_hash($db, $hashDB);*/
    }

    shuffle_level($db, 1);

    header("Content-Type: application/json");
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
$router->get("/songs/([^\/]*)/([\d]+)/([\d]+)", function ($category, $page, $count) {
    $db = loadDatabase();
    $db = sorting_by_category($db, $category)[$category];

    paging($db, $page, $count);
    recursive_unset($db, "fileName");

    if (count($db)) {
        generate_pictures($db);

        /*$hashDB = loadHashDatabase();

        $url = check_hash($db, $hashDB);
        ($url === null)
            ? generate_pictures($db, $hashDB)
            : apply_hash($db, $hashDB);*/
    }

    shuffle_level($db, 0);

    header("Content-Type: application/json");
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
$router->get("/songs/([^\/]*)/([\d]+)", function ($search, $count) {
    $db = loadDatabase();
    $db = search_songs($search, $db);
    $db = sorting_by_category($db);

    paging($db, 1, $count);
    recursive_unset($db, "fileName");

    if (count($db)) {
        generate_pictures($db);

        /*$hashDB = loadHashDatabase();

        $url = check_hash($db, $hashDB);
        ($url === null)
            ? generate_pictures($db, $hashDB)
            : apply_hash($db, $hashDB);*/
    }

    header("Content-Type: application/json");
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
$router->get("/songs/([^\/]*)/([^\/]*)/([\d]+)/([\d]+)", function ($search, $category, $page, $count) {
    $db = loadDatabase();
    $db = search_songs($search, $db);
    $db = sorting_by_category($db, $category)[$category];

    paging($db, $page, $count);
    recursive_unset($db, "fileName");

    if (count($db)) {
        generate_pictures($db);

        /*$hashDB = loadHashDatabase();

        $url = check_hash($db, $hashDB);
        ($url === null)
            ? generate_pictures($db, $hashDB)
            : apply_hash($db, $hashDB);*/
    }

    header("Content-Type: application/json");
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
$router->get("/song/([\w-]*)$", function ($id) {
    $db   = loadDatabase();
    $song = search_song($id, $db);

    header("Content-Type: application/json");
    if (isset($song["playlist"])) {
        $playlist = array();
        foreach ($song["playlist"] as $songID) {
            $playlist[] = search_song($songID, $db);
        }

        $playlist["count"] = count($playlist);

        if (isset($song["shuffle"]) && $song["shuffle"]) {
            shuffle_level($playlist, 0);
        } else {
            $playlist["cover"] = $song["cover"];
        }

        $playlist["name"] = $song["name"];

        recursive_unset($playlist, "fileName");
        recursive_prepend($playlist, "cover", "system/img/");

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
$router->get("/info/([\w-]*)$", function ($id) {
    $db   = loadDatabase();
    $song = search_song($id, $db);

    header("Content-Type: application/json");
    $infoDB = json_decode(file_get_contents(__DIR__ . "/db/infos.json"), true);

    if (isset($song["info"])) {
        if (is_array($song["info"])) {
            $infos = array();
            foreach ($song["info"] as $infoID)
                $infos[] = $infoDB[$infoID];

            echo json_encode($infos);

        } else echo json_encode(array($infoDB[$song["info"]]));
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
$router->get("/song/([\w-]+)/(\d+)(?:/)?([\d]+)?", function ($id, $timeFrom, $duration = null) {
    $time = ($timeFrom < 50) ? 5 : (($timeFrom < 75) ? 10 : 20);

    if ($duration !== null && $duration < $time)
        $time = $duration;

    $db   = loadDatabase();
    $song = search_song($id, $db);

    $inputFile  = escapeshellarg(__DIR__ . "/music/" . $song["fileName"]);
    $ffmpegPath = findExecutable("ffmpeg");

    $cmd            = "{$ffmpegPath} -i {$inputFile} 2>&1";
    $descriptorspec = [
        0 => ["pipe", "r"],
        1 => ["pipe", "w"],
        2 => ["pipe", "w"],
    ];

    $process = proc_open($cmd, $descriptorspec, $pipes);
    $output  = stream_get_contents($pipes[1]);

    fclose($pipes[0]);
    fclose($pipes[1]);
    fclose($pipes[2]);
    proc_close($process);

    $totalSeconds = 0;
    if (preg_match("/Duration: (\d{2}:\d{2}:\d{2}\.\d{2})/", $output, $matches)) {
        $songDuration = $matches[1];

        list($hours, $minutes, $seconds) = sscanf($songDuration, "%d:%d:%f");
        $totalSeconds = $hours * 3600 + $minutes * 60 + $seconds;
    }

    if ($totalSeconds <= $timeFrom + $time) $till = $totalSeconds;
    else $till = $timeFrom + $time;

    try {
        $bitrate = "320k";
        $cmd     = "{$ffmpegPath} -i {$inputFile} -ss {$timeFrom} -to {$till} -vn -c:a libopus -b:a {$bitrate} -f webm -";

        $process       = proc_open($cmd, $descriptorspec, $pipes);
        $webmAudioData = stream_get_contents($pipes[1]);

        fclose($pipes[0]);
        fclose($pipes[1]);
        fclose($pipes[2]);
        proc_close($process);

        header("Content-Type: audio/webm");
        header("Content-Disposition: attachment; filename=output.webm");

        echo $webmAudioData;
    } catch (Exception $ex) {
        echo "An error has occurred: " . $ex->getMessage();
    }
});

/*
 * Funktion: Anonym
 * Autor: Bernardo de Oliveira
 *
 * Lädt die Monitoring-Daten und gibt sie aus
 */
$router->get("/monitoring", function () {
    header("Content-Type: application/json");
    echo file_get_contents(__DIR__ . "/db/monitoring.json");
});

/*
 * Funktion: Anonym
 * Autor: Bernardo de Oliveira
 *
 * Lädt die Firewall-Daten und gibt sie aus
 */
$router->get("/firewall", function () {
    header("Content-Type: application/json");
    echo file_get_contents(__DIR__ . "/db/firewall.json");
});

/*
 * Funktion: Anonym
 * Autor: Bernardo de Oliveira
 *
 * Lädt die Changelog-Daten und gibt sie aus
 */
$router->get("/changelog", function () {
    header("Content-Type: application/json");
    echo file_get_contents(__DIR__ . "/db/changelog.json");
});

/*
 * Funktion: Anonym
 * Autor: Bernardo de Oliveira
 *
 * Lädt das gewünschte Bild und gibt es aus
 * Dafür da, sodass direkter Zugriff nicht möglich ist
 */
$router->get("/img/(.*)", function ($image) {
    $imageUrl = __DIR__ . "/img/" . $image;

    if (isset($_GET["size"]) && file_exists($imageUrl)) {
        $length = intval($_GET["size"]);

        if ($length < 32 || $length > 1024) {
            header($_SERVER['SERVER_PROTOCOL'] . " 403 Forbidden");
            exit("Forbidden");
        }

        $imagick = new Imagick();
        $imagick->readImage($imageUrl);
        $imagick->scaleImage($length, $length);
        $imagick->setImageFormat("webp");

        enable_cache(oneDay * 7);
        header("Content-Type: image/webp");
        echo $imagick;
        exit();
    }

    header($_SERVER['SERVER_PROTOCOL'] . " 403 Forbidden");
    exit("Forbidden");
});

/*
 * Funktion: Anonym
 * Autor: Bernardo de Oliveira
 *
 * Lädt die gewünschte Datei und gibt sie aus
 * Dafür da, sodass direkter Zugriff nicht möglich ist
 */
$router->get("/temp/(.*)", function ($image) {
    $imageUrl    = __DIR__ . "/temp/" . $image;
    $contentType = mime_content_type($imageUrl);

    if ($contentType === false) {
        header($_SERVER['SERVER_PROTOCOL'] . " 403 Forbidden");
        exit("Forbidden");
    }

    if ($contentType === "image/webp") {
        $imagick = new Imagick();
        $imagick->readImage($imageUrl);

        enable_cache(oneDay);
        header("Content-Type: image/webp");
        echo $imagick;
        exit();
    }

    header($_SERVER['SERVER_PROTOCOL'] . " 403 Forbidden");
    exit("Forbidden");
});

$router->get("/phpinfo", function () {
    phpinfo();
});

function enable_cache($time): void
{
    header("Cache-Control: public, max-age=86400");
    header("Expires: " . gmdate("D, d M Y H:i:s \G\M\T", time() + $time));
    header("Pragma: ");
}

$router->run();
