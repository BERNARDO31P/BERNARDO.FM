<?php

require_once __DIR__ . "/functions.php";

/* =========================
   MAIN
========================= */

$ffmpegPath = findExecutable("ffmpeg");

if (!is_dir("temp")) {
    mkdir("temp", 0777, true);
}

while (sleep(7200) !== null) {
    foreach (loadDatabase() as $song) {
        if (!isset($song["fileName"])) {
            continue;
        }

        $inputFile = "music/" . $song["fileName"];

        $stat = stat($inputFile);
        if (!$stat) {
            throw new RuntimeException("File not found");
        }

        $cacheKey  = md5($inputFile . $stat["size"] . $stat["mtime"]);
        $cacheFile = "temp/audio_{$cacheKey}.flac";

        if (file_exists($cacheFile)) {
            echo "SKIP: {$inputFile} -> {$cacheFile}\n";
            continue;
        }

        echo "PROCESS: {$inputFile} -> {$cacheFile}\n";

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
            throw new RuntimeException(
                "FFmpeg failed\nOGG:\n{$oggStderr}\nFLAC:\n{$flacStderr}"
            );
        }

        echo "DONE: {$cacheFile}\n";
    }
}
