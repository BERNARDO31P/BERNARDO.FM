<?php


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
    if (isset($_SESSION["database"]) && file_exists($_SESSION["database"])) {
        $db = json_decode(file_get_contents($_SESSION["database"]), true);
    }

    if (empty($db)) {
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
        $keys = $song["category"];

        if (is_string($keys)) {
            $keys = [$keys];
        }

        foreach ($keys as $key) {
            if (!array_key_exists($key, $parsed))
                $parsed[$key] = array();

            $parsed[$key][] = $song;
        }
    }

    join_songs($object, $parsed);

    return $parsed;
}

/*
 * Funktion: join_songs()
 * Autor: Bernardo de Oliveira
 * Argumente:
 *  object: (Object) Definiert die Datenbasis mit allen verfügbaren Songs
 *  parsed: (Object) Referenz auf die geparsten Album- und Playlist-Daten
 *
 * Verknüpft Album- und Playlist-Einträge mit den zugehörigen Songdaten
 * Trennt bei Alben optional den Künstlernamen vom Albumnamen
 * und ersetzt Song-Referenzen durch die vollständigen Songobjekte
 */
function join_songs($object, &$parsed): void
{
    foreach ($parsed["Albums"] as &$album) {
        $albumInfo = explode(" - ", $album["name"]);

        if (count($albumInfo) > 1) {
            $album["artist"] = $albumInfo[0];
            $album["name"]   = $albumInfo[1];
        }

        join_playlist($object, $album["playlist"]);
    }

    foreach ($parsed["Playlists"] as &$playlist) {
        join_playlist($object, $playlist["playlist"]);
    }
}

/*
 * Funktion: join_playlist()
 * Autor: Bernardo de Oliveira
 * Argumente:
 *  object: (Object) Definiert die Datenbasis mit allen verfügbaren Songs
 *  playlist: (Array) Referenz auf die Playlist mit Song-Referenzen
 *
 * Ersetzt alle Song-Referenzen innerhalb einer Playlist
 * durch die vollständigen Songdaten aus der Datenbasis
 * und fügt der Playlist die Anzahl der enthaltenen Songs hinzu
 */
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
            if (empty($tracks)) {
                unset($data[$category]);
                continue;
            }

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
 *  search: (String) Suchbegriff(e), mehrere Wörter möglich
 *  db: (Array) Sammlung von Songs
 *
 * Beschreibung:
 * Durchsucht die Song-Datenbank intelligent nach Übereinstimmungen.
 * Die Suche ist wortbasiert, reihenfolgeunabhängig und tolerant gegenüber
 * Sonderzeichen und Trennzeichen.
 *
 * Es werden alle Suchbegriffe gegen folgende Felder geprüft:
 *  - Songname
 *  - Künstlername
 *  - Kategorie(n)
 *
 * Alle Suchwörter müssen irgendwo im Datensatz vorkommen,
 * unabhängig von der Reihenfolge.
 */
function search_songs($search, $db): array
{
    $results = [];

    $normalize = function ($text) {
        $text = strtolower($text);
        $text = preg_replace("/[^a-z0-9\s]/i", " ", $text);
        $text = preg_replace("/\s+/", " ", $text);
        return trim($text);
    };

    $searchTokens = explode(" ", $normalize($search));

    foreach ($db as $song) {
        $categories = $song["category"] ?? [];
        if (is_string($categories)) {
            $categories = [$categories];
        }

        $haystackParts = [
            $song["name"] ?? "",
            $song["artist"] ?? "",
            implode(" ", $categories)
        ];

        $haystack = $normalize(implode(" ", $haystackParts));

        $allTokensMatch = true;
        foreach ($searchTokens as $token) {
            if ($token === "") {
                continue;
            }
            if (stripos($haystack, $token) === false) {
                $allTokensMatch = false;
                break;
            }
        }

        if ($allTokensMatch) {
            $results[] = $song;
        }
    }

    return $results;
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

const COLS = 60;

/*
 * Funktion: process_pictures()
 * Autor: Bernardo de Oliveira
 * Argumente:
 *  db: (Object) Referenz auf die Datenstruktur mit Song- oder Kategoriedaten
 *  length: (Integer) Definiert die Seitenlänge der Coverbilder in Pixel
 *  i: (Integer) Interner Zähler für die Positionierung der Bilder im Sprite
 *  imagePaths: (Array) Referenz auf das Array mit bereits verarbeiteten Bildpfaden
 *
 * Durchläuft rekursiv die Datenstruktur und verarbeitet alle vorhandenen Coverbilder
 * Erstellt skalierte Versionen der Coverbilder und berechnet deren Position
 * innerhalb eines CSS-Sprites (X- und Y-Koordinaten)
 *
 * Doppelte Coverbilder werden nur einmal in das Sprite aufgenommen
 * und mehrfach referenziert
 *
 * Gibt ein Array mit den eindeutigen Pfaden der verarbeiteten Bilder zurück
 */
function process_pictures(&$db, $length = 200, &$i = 0, &$imagePaths = []): array
{
    foreach ($db as &$data) {
        if (is_array($data) && !isset($data["id"])) {
            process_pictures($data, $length, $i, $imagePaths);
            continue;
        }

        if (!is_array($data) || !isset($data["id"], $data["cover"])) {
            continue;
        }

        $resizePath = resize_picture($data["cover"], $length);
        $imageIndex = array_search($resizePath, $imagePaths);
        if ($imageIndex !== false) {
            $data["coverPosX"] = ($imageIndex % COLS) * $length;
            $data["coverPosY"] = floor($imageIndex / COLS) * $length;
            continue;
        }

        $data["coverPosX"] = ($i % COLS) * $length;
        $data["coverPosY"] = floor($i / COLS) * $length;

        $imagePaths[] = $resizePath;
        $i++;
    }

    return $imagePaths;
}

/*
 * Funktion: resize_picture()
 * Autor: Bernardo de Oliveira
 * Argumente:
 *  fileName: (String) Definiert den Dateinamen des Originalbildes
 *  size: (Integer) Definiert die Zielgrösse des Bildes in Pixel
 *
 * Skaliert ein Bild auf eine quadratische Zielgrösse
 * Das Bild wird zentriert und bei Bedarf mit schwarzem Hintergrund aufgefüllt
 *
 * Falls das Originalbild nicht existiert, wird ein schwarzes Platzhalterbild erzeugt
 * Das Ergebnis wird zwischengespeichert, um erneute Verarbeitung zu vermeiden
 *
 * Gibt den Pfad zum skalierten Bild zurück
 */
function resize_picture($fileName, $size): string
{
    $inputPath    = "img/" . $fileName;
    $escapedInput = escapeshellarg($inputPath);

    $outputPath    = __DIR__ . "/temp/resized_" . md5($fileName . $size) . ".png";
    $escapedOutput = escapeshellarg($outputPath);

    if (!file_exists($outputPath)) {
        if (file_exists($inputPath)) {
            $resizeCmd = "magick $escapedInput -resize {$size}x{$size} -gravity center -extent {$size}x{$size} $escapedOutput";
        } else {
            $resizeCmd = "magick -size {$size}x{$size} canvas:black $escapedOutput";
        }
        shell_exec($resizeCmd);
    }

    return $outputPath;
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
    $imagePaths = process_pictures($db, $length);

    if (empty($imagePaths)) {
        $db["cover"] = null;
        return;
    }

    $outputImage = "temp/" . uniqid("cover_", true) . ".webp";
    $listFile    = "temp/" . uniqid("list_", true) . ".txt";
    file_put_contents($listFile, implode("\n", $imagePaths));

    $escapedListFile    = escapeshellarg($listFile);
    $escapedOutputImage = escapeshellarg($outputImage);

    $cols       = min(COLS, count($imagePaths));
    $combineCmd = "magick montage @" . $escapedListFile . " -strip -geometry +0+0 -tile {$cols}x -quality 45 $escapedOutputImage";
    shell_exec($combineCmd);

    unlink($listFile);

    $db["cover"]     = "system/" . $outputImage;
    $db["coverCols"] = $cols;
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

function buildLoudnessFilter(string $inputFile): string
{
    $referenceFile = "music/Jumpstreet & Ajja - Lysurgical Precision.wav";
    $ref           = analyzeAudio($referenceFile);
    $in            = analyzeAudio($inputFile);

    $desiredGain = $ref["lufs"] - $in["lufs"];
    $ceiling     = -1.5;

    if ($desiredGain > 0) {
        return
            "volume={$desiredGain}dB," .
            "alimiter=limit={$ceiling}dB:attack=5:release=50";
    }

    return
        "volume={$desiredGain}dB";
}

/*
 * Funktion: analyzeAudio()
 * Autor: Bernardo de Oliveira
 * Argumente:
 *  fileName: (String) Definiert den Pfad zur Audiodatei
 *
 * Analysiert eine Audiodatei mit FFmpeg (EBU R128 + Peak Detection)
 * Ermittelt die integrierte Lautheit (LUFS) sowie den maximalen Peak (dBFS)
 * Die Analyse wird gecacht, basierend auf Dateipfad, Dateigrässe und Änderungszeit
 * um wiederholte FFmpeg-Aufrufe zu vermeiden
 *
 * Gibt ein Array mit folgenden Werten zurück:
 *  lufs: (Float) Integrierte Lautheit der Datei in LUFS
 *  peak: (Float) Maximaler Peak-Wert in dBFS
 */
function analyzeAudio(string $fileName): array
{
    $stat = stat($fileName);
    if (!$stat) {
        throw new RuntimeException("File not found");
    }

    $cacheKey  = md5($fileName . $stat["size"] . $stat["mtime"]);
    $cacheFile = "temp/audio_$cacheKey.json";
    if (file_exists($cacheFile)) {
        return json_decode(file_get_contents($cacheFile), true);
    }

    $ffmpegPath = findExecutable("ffmpeg");

    $cmd = "{$ffmpegPath} -i \"{$fileName}\" -af ebur128,volumedetect -f null - 2>&1";
    $out = shell_exec($cmd);

    if (!$out) {
        throw new RuntimeException("FFmpeg failed");
    }

    if (!preg_match("/Integrated loudness:.*?I:\s*(-?\d+(\.\d+)?)/s", $out, $mLufs)) {
        throw new RuntimeException("Integrated LUFS not found");
    }

    if (!preg_match("/max_volume:\s*(-?\d+(\.\d+)?)/", $out, $mPeak)) {
        throw new RuntimeException("Peak not found");
    }

    $data = [
        "lufs" => (float)$mLufs[1],
        "peak" => (float)$mPeak[1],
    ];

    file_put_contents($cacheFile, json_encode($data));

    return $data;
}