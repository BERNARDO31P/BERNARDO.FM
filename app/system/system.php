<?php

const oneDay = 86400;

use Bramus\Router\Router;

include_once __DIR__ . "/vendor/autoload.php";

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

chdir(__DIR__);
require_once __DIR__ . "/functions.php";

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
    }

    shuffle_level($db, 1);

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
    }

    shuffle_level($db, 0);

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
$router->get("/song/([\\w-]+)(?:/([A-Za-z][\\w-]*))?$", function ($id, $mode = null) {
    $db   = loadDatabase();
    $song = search_song($id, $db);

    $originalSong = $song;

    if (!isset($song["playlist"]) && $mode !== "single") {
        if (!isset($song["category"])) {
            exit;
        }

        $dbCategory = sorting_by_category($db);

        if (!is_array($song["category"])) {
            $song["category"] = [$song["category"]];
        }

        $songs = [];
        foreach ($song["category"] as $category) {
            $songIDs = array_values(array_filter(array_map(function ($song) use ($id) {
                if ($song["id"] === $id || isset($song["playlist"])) {
                    return null;
                }

                return $song["id"];
            }, $dbCategory[$category])));

            array_push($songs, ...$songIDs);
        }

        $song["playlist"] = $songs;
        $song["shuffle"]  = true;

        unset($song["artist"]);
        unset($song["length"]);
        unset($song["cover"]);
    } elseif (!isset($song["playlist"]) && $mode === "single") {
        $song["playlist"] = [$song["id"]];
    }

    $playlist = array();
    foreach ($song["playlist"] as $songID) {
        $playlist[] = search_song($songID, $db);
    }

    $playlist["count"] = count($playlist);

    if (isset($song["shuffle"]) && $song["shuffle"]) {
        shuffle_level($playlist, 0);

        if (!isset($originalSong["playlist"])) {
            array_unshift($playlist, $originalSong);
        }
    } else {
        $playlist["cover"] = $song["cover"];
    }

    $playlist["name"] = $song["name"];

    recursive_unset($playlist, "fileName");
    recursive_prepend($playlist, "cover", "system/img/");

    header("Content-Type: application/json");
    echo json_encode($playlist);
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
    $time = match (true) {
        $timeFrom < 5 => 2,
        $timeFrom < 15 => 4,
        $timeFrom < 50 => 6,
        $timeFrom < 75 => 8,
        default => 10,
    };

    if ($duration !== null && $duration < $time) {
        $time = $duration;
    }

    $db   = loadDatabase();
    $song = search_song($id, $db);

    $ffmpegPath = findExecutable("ffmpeg");
    $inputFile  = "music/" . $song["fileName"];

    $stat = stat($inputFile);
    if (!$stat) {
        throw new RuntimeException("File not found");
    }

    if (!is_dir("temp")) {
        mkdir("temp", 0777, true);
    }

    $cacheKey  = md5($inputFile . $stat["size"] . $stat["mtime"]);
    $cacheFile = "temp/audio_{$cacheKey}.flac";

    if (!file_exists($cacheFile)) {
        $bitrate = "320k";
        $af      = buildLoudnessFilter($inputFile);

        $command_ogg = "{$ffmpegPath} " .
            "-i \"{$inputFile}\" " .
            "-af {$af} " .
            "-vn -c:a libopus " .
            "-application audio " .
            "-b:a {$bitrate} " .
            "-vbr on " .
            "-f ogg -";

        $process_ogg = proc_open($command_ogg, [
            0 => ["pipe", "r"],
            1 => ["pipe", "w"],
            2 => ["pipe", "w"]
        ], $pipes_ogg);

        if (!is_resource($process_ogg)) {
            throw new RuntimeException("Failed to start FFmpeg (ogg stage)");
        }

        $command_flac = "{$ffmpegPath} " .
            "-i pipe:0 " .
            "-vn " .
            "-af aformat=sample_fmts=s16:sample_rates=44100:channel_layouts=stereo " .
            "-c:a flac " .
            "-compression_level 12 " .
            "-map_metadata -1 " .
            "-f flac \"{$cacheFile}\"";

        $process_flac = proc_open($command_flac, [
            0 => $pipes_ogg[1],
            1 => ["pipe", "w"],
            2 => ["pipe", "w"]
        ], $pipes_flac);

        if (!is_resource($process_flac)) {
            fclose($pipes_ogg[1]);
            proc_close($process_ogg);
            throw new RuntimeException("Failed to start FFmpeg (flac stage)");
        }

        fclose($pipes_ogg[0]);

        $oggStderr  = stream_get_contents($pipes_ogg[2]);
        $flacStderr = stream_get_contents($pipes_flac[2]);

        fclose($pipes_ogg[2]);
        fclose($pipes_flac[1]);
        fclose($pipes_flac[2]);
        fclose($pipes_ogg[1]);

        $exitFlac = proc_close($process_flac);
        $exitOgg  = proc_close($process_ogg);

        if ($exitOgg !== 0 || $exitFlac !== 0) {
            @unlink($cacheFile);
            throw new RuntimeException("FFmpeg failed\nOGG:\n{$oggStderr}\nFLAC:\n{$flacStderr}");
        }
    }

    if (isIosRequest()) {
        $audioCodec = "pcm_s16le";
        $format     = "wav";
    } else {
        $audioCodec = "flac";
        $format     = "flac";
    }

    $command_cut = "{$ffmpegPath} " .
        "-ss {$timeFrom} " .
        "-i \"{$cacheFile}\" " .
        "-vn " .
        "-af \"atrim=start=0:duration={$time},aformat=sample_fmts=s16:sample_rates=44100:channel_layouts=stereo\" " .
        "-c:a {$audioCodec} " .
        "-compression_level 12 " .
        "-map_metadata -1 " .
        "-f {$format} -";

    $process_cut = proc_open($command_cut, [
        0 => ["pipe", "r"],
        1 => ["pipe", "w"],
        2 => ["pipe", "w"]
    ], $pipes_cut);

    if (!is_resource($process_cut)) {
        throw new RuntimeException("Failed to start FFmpeg (cut stage)");
    }

    // Disable buffering
    if (ob_get_level()) {
        ob_end_clean();
    }

    set_time_limit(0);

    header("Content-Type: audio/{$format}");
    header("Content-Disposition: attachment; filename=output.{$format}");
    header("Cache-Control: no-store");
    header("Transfer-Encoding: chunked");

    $stdout = $pipes_cut[1];
    $stderr = $pipes_cut[2];

    while (!feof($stdout)) {
        $chunk = fread($stdout, 8192);
        if ($chunk === false) {
            break;
        }
        echo $chunk;
        flush();
    }

    fclose($pipes_cut[0]);
    fclose($stdout);

    $cutError = stream_get_contents($stderr);
    fclose($stderr);

    $exitCut = proc_close($process_cut);

    if ($exitCut !== 0) {
        throw new RuntimeException("FFmpeg cut failed\n{$cutError}");
    }
});

/*
 * Funktion: Anonym
 * Autor: Bernardo de Oliveira
 *
 * Lädt die Monitoring-Daten und gibt sie aus
 */
$router->get("/monitoring(?:/)?([\d]+)?", function ($time = 4) {
    header("Content-Type: application/json");

    if ($time > 43800 || $time < 4) {
        $time = 4;
    }

    /**
     * 30 entries in one minute because of 2x sleep(1)
     * 4 minutes
     */
    $amount = 30 * $time;
    $dbFile = __DIR__ . "/db/monitoring.json";

    if (!file_exists($dbFile)) {
        file_put_contents($dbFile, json_encode(array()));
    }

    $db = json_decode(file_get_contents($dbFile), true);
    if (!is_array($db)) {
        $db = array();
    }

    echo json_encode(array_slice($db, -$amount, $amount, true));
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
    $imagePath = __DIR__ . "/img/" . $image;

    if (isset($_GET["size"]) && file_exists($imagePath)) {
        $length = intval($_GET["size"]);

        if ($length < 32 || $length > 1024) {
            header($_SERVER['SERVER_PROTOCOL'] . " 403 Forbidden");
            exit("Forbidden");
        }

        enable_cache(oneDay * 7);
        header("Content-Type: image/webp");

        $path = resize_picture($image, $length);
        readfile($path);

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
    $imagePath   = __DIR__ . "/temp/" . $image;
    $contentType = mime_content_type($imagePath);

    if ($contentType === false) {
        header($_SERVER['SERVER_PROTOCOL'] . " 403 Forbidden");
        exit("Forbidden");
    }

    if ($contentType === "image/webp") {
        enable_cache(oneDay * 7);
        header("Content-Type: image/webp");

        readfile($imagePath);
        @unlink($imagePath);

        exit();
    }

    header($_SERVER['SERVER_PROTOCOL'] . " 403 Forbidden");
    exit("Forbidden");
});

$router->run();
