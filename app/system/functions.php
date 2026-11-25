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

        if (!is_array($keys)) {
            $keys = [$keys];
        }

        $master_key = array_pop($keys);
        if (!array_key_exists($master_key, $parsed)) {
            $parsed[$master_key] = array();
        }

        $parsed[$master_key][] = $song;
    }

    join_songs($object, $parsed);

    if (!empty($category)) {
        return $parsed[$category] ?? [];
    }

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
        if (!is_array($categories)) {
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
 * Funktion: get_resized_picture_path()
 * Autor: Bernardo de Oliveira
 * Argumente:
 *  fileName: (String) Definiert den Dateinamen des Originalbildes
 *  size: (Integer) Definiert die Zielgrösse des Bildes in Pixel
 *
 * Gibt den Pfad des skalierten Bildes zurück, ohne das Bild zu generieren
 */
function get_resized_picture_path(string $fileName, int $size): string
{
    return __DIR__ . "/temp/resized_" . md5($fileName . $size) . ".png";
}

/*
 * Funktion: process_pictures()
 * Autor: Bernardo de Oliveira
 * Argumente:
 *  db: (Array) Referenz auf die Datenstruktur
 *  length: (Integer) Definiert die Seitenlänge der Coverbilder
 *  images: (Array) Referenz auf die gesammelten Bilder
 *
 * Durchläuft rekursiv die Datenstruktur und sammelt alle Coverbilder
 * Doppelte Coverbilder werden zusammengefasst
 * Die Referenzen auf die entsprechenden Datensätze werden gespeichert
 *
 * Gibt ein Array mit den eindeutigen Bildern zurück
 */
function process_pictures(array &$db, int $length = 200, array &$images = []): array
{
    unset($db["coverPosX"], $db["coverPosY"]);

    foreach ($db as &$data) {
        if (is_array($data)) {
            unset($data["coverPosX"], $data["coverPosY"]);
        }

        if (is_array($data) && !isset($data["id"])) {
            process_pictures($data, $length, $images);
            continue;
        }

        if (!is_array($data) || !isset($data["id"], $data["cover"]) || !is_string($data["cover"]) || $data["cover"] === "") {
            continue;
        }

        $resizePath = get_resized_picture_path($data["cover"], $length);

        if (!isset($images[$resizePath])) {
            $images[$resizePath] = [
                "fileName" => $data["cover"],
                "entries"  => []
            ];
        }

        $images[$resizePath]["entries"][] = &$data;
    }

    unset($data);

    return $images;
}

/*
 * Führt einen ImageMagick-Befehl aus und protokolliert Fehler serverseitig
 */
function run_picture_command(string $command, string $context): bool
{
    $output = [];
    $status = 1;

    try {
        @exec($command . " 2>&1", $output, $status);
    } catch (Throwable $error) {
        error_log($context . ": " . $error->getMessage());
        return false;
    }

    if ($status !== 0) {
        error_log($context . ": " . implode("\n", $output));
        return false;
    }

    return true;
}

/*
 * Überprüft Format und Abmessungen eines Bildes anhand seines Headers
 */
function is_picture_valid(string $path, int $width, int $height, int $type): bool
{
    clearstatcache(true, $path);

    if (!is_file($path)) {
        return false;
    }

    $info = @getimagesize($path);

    return $info !== false &&
        $info[0] === $width &&
        $info[1] === $height &&
        $info[2] === $type;
}

/*
 * Funktion: resize_picture()
 * Autor: Bernardo de Oliveira
 * Argumente:
 *  fileName: (String) Definiert den Dateinamen des Originalbildes
 *  size: (Integer) Definiert die Zielgrösse des Bildes in Pixel
 *  force: (Boolean) Erzwingt die erneute Generierung des Bildes
 *
 * Skaliert ein Bild auf eine quadratische Zielgrösse
 * Fehlende oder beschädigte Bilder werden durch schwarze Bilder ersetzt
 * Gibt null zurück, wenn auch das Platzhalterbild nicht erzeugt werden kann
 */
function resize_picture($fileName, $size, bool $force = false): ?string
{
    $outputPath = get_resized_picture_path($fileName, $size);

    if (!$force && is_picture_valid($outputPath, $size, $size, IMAGETYPE_PNG)) {
        return $outputPath;
    }

    $inputPath     = "img/" . $fileName;
    $temporaryPath = @tempnam(dirname($outputPath), "resize_");

    if ($temporaryPath === false) {
        error_log("Could not create temporary image: $fileName");
        return null;
    }

    try {
        $escapedOutput = escapeshellarg("png:" . $temporaryPath);
        $success       = false;

        if (is_file($inputPath)) {
            // Nur das erste Bild verwenden, auch bei animierten Dateien
            $escapedInput = escapeshellarg($inputPath . "[0]");

            $resizeCmd = "magick $escapedInput"
                . " -resize {$size}x{$size}"
                . " -background black -gravity center"
                . " -extent {$size}x{$size}"
                . " -strip $escapedOutput";

            $success = run_picture_command($resizeCmd, "Could not resize image: $fileName") &&
                is_picture_valid($temporaryPath, $size, $size, IMAGETYPE_PNG);
        }

        if (!$success) {
            $blackCmd = "magick -size {$size}x{$size}"
                . " canvas:black -strip $escapedOutput";

            if (!run_picture_command($blackCmd, "Could not generate placeholder: $fileName") ||
                !is_picture_valid($temporaryPath, $size, $size, IMAGETYPE_PNG)) {
                return null;
            }
        }

        if (!@rename($temporaryPath, $outputPath)) {
            error_log("Could not save resized image: $fileName");
            return null;
        }

        clearstatcache(true, $outputPath);
        return $outputPath;
    } finally {
        if (is_file($temporaryPath)) {
            @unlink($temporaryPath);
        }
    }
}

function load_sprite_positions(string $outputImage, string $outputJson, array $imagePaths, int $length, int $cols): ?array
{
    if (!is_file($outputImage) || !is_file($outputJson) || @filesize($outputImage) === 0) {
        return null;
    }

    $rows = intdiv(count($imagePaths) + $cols - 1, $cols);
    $size = @getimagesize($outputImage);

    if ($size === false || $size[0] !== $cols * $length || $size[1] !== $rows * $length || $size[2] !== IMAGETYPE_WEBP) {
        return null;
    }

    $json = @file_get_contents($outputJson);

    if ($json === false) {
        return null;
    }

    $positions = json_decode($json, true);

    if (!is_array($positions) || count($positions) !== count($imagePaths)) {
        return null;
    }

    $usedPositions = [];

    foreach ($imagePaths as $imagePath) {
        $key = basename($imagePath);

        if (!isset($positions[$key]["x"], $positions[$key]["y"])) {
            return null;
        }

        $x = $positions[$key]["x"];
        $y = $positions[$key]["y"];

        if (
            !is_int($x) ||
            !is_int($y) ||
            $x < 0 ||
            $y < 0 ||
            $x % $length !== 0 ||
            $y % $length !== 0 ||
            $x >= $cols * $length
        ) {
            return null;
        }

        $index = intdiv($y, $length) * $cols + intdiv($x, $length);

        if ($index >= count($imagePaths) || isset($usedPositions[$index])) {
            return null;
        }

        $usedPositions[$index] = true;
    }

    return $positions;
}

/*
 * Generiert ein CSS-Sprite zeilenweise ohne Verwendung von montage
 */
function create_picture_sprite(array $imagePaths, int $cols, int $length, string $directory, string $hash, string $temporaryImage): bool
{
    $rowFiles   = [];
    $combineCmd = "magick -background black -gravity northwest";

    try {
        if (is_file($temporaryImage) && !@unlink($temporaryImage)) {
            return false;
        }

        foreach (array_chunk($imagePaths, $cols) as $index => $row) {
            $rowFile    = "$directory/list_{$hash}_{$index}.txt";
            $rowFiles[] = $rowFile;

            $content = implode("\n", $row);
            if (@file_put_contents($rowFile, $content) !== strlen($content)) {
                error_log("Could not save sprite image list: $rowFile");
                return false;
            }

            $escapedRowFile = escapeshellarg("@" . $rowFile);
            $combineCmd     .= " \\( $escapedRowFile -strip +repage +append \\)";
        }

        $escapedOutput = escapeshellarg($temporaryImage);
        $combineCmd    .= " -append -strip -quality 45 $escapedOutput";

        $rows = intdiv(count($imagePaths) + $cols - 1, $cols);

        return run_picture_command($combineCmd, "Could not generate sprite: $hash") &&
            is_picture_valid($temporaryImage, $cols * $length, $rows * $length, IMAGETYPE_WEBP);
    } finally {
        foreach ($rowFiles as $rowFile) {
            if (is_file($rowFile)) {
                @unlink($rowFile);
            }
        }
    }
}

/*
 * Entfernt sämtliche Positionsinformationen aus der Datenstruktur
 */
function clear_picture_positions(array &$db): void
{
    unset($db["coverPosX"], $db["coverPosY"]);

    foreach ($db as &$data) {
        if (is_array($data)) {
            clear_picture_positions($data);
        }
    }

    unset($data);
}

/*
 * Funktion: generate_pictures()
 * Autor: Bernardo de Oliveira
 * Argumente:
 *  db: (Array) Referenz auf die Datenstruktur
 *  length: (Integer) Definiert die Seitenlänge der Bilder in Pixel
 *
 * Verwendet vorhandene Sprites und Positionsinformationen erneut
 * Generiert fehlende Sprites in der ursprünglichen Reihenfolge
 * Bei schwerwiegenden Fehlern werden keine Coverinformationen zurückgegeben
 */
function generate_pictures(array &$db, int $length = 200): void
{
    $db["cover"] = null;
    unset($db["coverCols"]);

    $lock           = null;
    $locked         = false;
    $success        = false;
    $temporaryImage = null;
    $temporaryJson  = null;

    try {
        if ($length <= 0 || COLS <= 0) {
            throw new RuntimeException("Invalid sprite dimensions");
        }

        $images = process_pictures($db, $length);

        if (empty($images)) {
            return;
        }

        $imagePaths = array_keys($images);
        $cols       = min(COLS, count($imagePaths));

        $orderedImagePaths = $imagePaths;
        sort($orderedImagePaths, SORT_STRING);
        $hash = md5(json_encode([$orderedImagePaths, $length, $cols], JSON_THROW_ON_ERROR));

        $directory      = __DIR__ . "/temp";
        $outputImage    = "$directory/cover_$hash.webp";
        $outputJson     = "$directory/cover_$hash.json";
        $lockFile       = "$directory/cover_$hash.lock";
        $temporaryImage = "$directory/cover_$hash.tmp.webp";
        $temporaryJson  = "$directory/cover_$hash.tmp.json";

        $lock = @fopen($lockFile, "c");

        if ($lock === false || !@flock($lock, LOCK_EX)) {
            throw new RuntimeException("Could not acquire sprite lock");
        }

        $locked = true;
        clearstatcache();

        $positions = load_sprite_positions($outputImage, $outputJson, $imagePaths, $length, $cols);

        if ($positions === null) {
            $positions = [];

            foreach ($imagePaths as $index => $imagePath) {
                if (resize_picture($images[$imagePath]["fileName"], $length) === null) {
                    throw new RuntimeException("Could not generate image or placeholder: $imagePath");
                }

                $positions[basename($imagePath)] = [
                    "x" => ($index % $cols) * $length,
                    "y" => intdiv($index, $cols) * $length
                ];
            }

            if (!create_picture_sprite($imagePaths, $cols, $length, $directory, $hash, $temporaryImage)) {
                // Beschädigte Cachebilder erst im Fehlerfall vollständig prüfen
                $repaired = false;

                foreach ($imagePaths as $imagePath) {
                    $escapedPath = escapeshellarg($imagePath);

                    if (run_picture_command("magick $escapedPath null:", "Could not read cached image: $imagePath")) {
                        continue;
                    }

                    if (resize_picture($images[$imagePath]["fileName"], $length, true) === null) {
                        throw new RuntimeException("Could not repair cached image: $imagePath");
                    }

                    $repaired = true;
                }

                if (!$repaired || !create_picture_sprite($imagePaths, $cols, $length, $directory, $hash, $temporaryImage)) {
                    throw new RuntimeException("Could not generate sprite: $hash");
                }
            }

            $json = json_encode($positions, JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);

            if (@file_put_contents($temporaryJson, $json) !== strlen($json)) {
                throw new RuntimeException("Could not save sprite positions");
            }

            if (is_file($outputJson) && !@unlink($outputJson)) {
                throw new RuntimeException("Could not invalidate sprite cache");
            }

            if (!@rename($temporaryImage, $outputImage) || !@rename($temporaryJson, $outputJson)) {
                throw new RuntimeException("Could not publish sprite cache");
            }
        }

        foreach ($images as $imagePath => &$image) {
            $position = $positions[basename($imagePath)];

            foreach ($image["entries"] as &$data) {
                $data["coverPosX"] = $position["x"];
                $data["coverPosY"] = $position["y"];
            }

            unset($data);
        }

        unset($image);

        $db["cover"]     = "system/temp/cover_$hash.webp";
        $db["coverCols"] = $cols;
        $success         = true;
    } catch (Throwable $error) {
        error_log("Could not generate pictures: " . $error->getMessage());
    } finally {
        // Temporäre Dateien nur mit gehaltenem Lock entfernen
        if ($locked) {
            foreach ([$temporaryImage, $temporaryJson] as $file) {
                if (is_file($file)) {
                    @unlink($file);
                }
            }

            @flock($lock, LOCK_UN);
        }

        if (is_resource($lock)) {
            @fclose($lock);
        }

        if (!$success) {
            $db["cover"] = null;
            unset($db["coverCols"]);
            clear_picture_positions($db);
        }
    }
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

function isIosRequest(): bool
{
    if (!isset($_SERVER["HTTP_USER_AGENT"])) {
        return false;
    }

    $ua = $_SERVER["HTTP_USER_AGENT"];

    if (preg_match("/(iPhone|iPad|iPod)/i", $ua)) {
        return true;
    }

    if (preg_match("/Macintosh/i", $ua) && preg_match("/Mobile/i", $ua)) {
        return true;
    }

    return false;
}

function enable_cache($time): void
{
    header("Cache-Control: public, max-age=86400");
    header("Expires: " . gmdate("D, d M Y H:i:s \G\M\T", time() + $time));
    header("Pragma: ");
}