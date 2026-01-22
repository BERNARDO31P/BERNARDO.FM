const audioContext = new (window.AudioContext || window.webkitAudioContext)({
    latencyHint: "playback",
    sampleRate: 44100
});

class MultiTrackPlayer extends EventTarget {
    #waitIndex = null;

    #abortController = new AbortController();
    #abortSignal = this.#abortController.signal;

    #audioTag = new Audio();
    #initialPlay = true;
    #stopped = true;
    #isDecoding = false;
    #playing = false;
    #executedTask = true;
    #hadError = false;

    #length = 0;
    #volume = 1;
    #gainNode = null;

    #indexes = [];

    #currentTrackIndex = 0;
    #nextTrackIndex = false;

    #startTime = 0;
    #offset = 0;
    #currentOffset = 0;

    #timeUpdateHandler = null;
    #playEventHandler = null;
    #pauseEventHandler = null;

    constructor(length) {
        super();

        this.#gainNode = audioContext.createGain();
        this.#gainNode.connect(audioContext.destination);

        this.#length = length + 1;

        this.#audioTag = document.getElementById("MultiTrackPlayer");
        if (!this.#audioTag) {
            this.#audioTag = new Audio(this.#createSilence(1));

            this.#audioTag.controls = true;
            this.#audioTag.id = "MultiTrackPlayer";

            document.body.append(this.#audioTag);
        }

        this.#audioTag.volume = 0;
        this.#playEventHandler = this.#playEvent.bind(this);
        this.#pauseEventHandler = this.#pauseEvent.bind(this);
    }

    #getUrls() {
        const urls = [];
        for (const index of this.#indexes) {
            if (typeof index === "undefined") {
                continue;
            }

            urls.push(index["url"]);
        }

        return urls;
    }

    #getDecodingQueue() {
        const decodingQueue = [];
        for (const [index, info] of Object.entries(this.#indexes)) {
            if (!info["decoding"]) {
                continue;
            }

            decodingQueue[index] = info["url"];
        }

        return decodingQueue;
    }

    #getAudioSources() {
        const audioSources = [];
        for (const [index, info] of Object.entries(this.#indexes)) {
            if (!info["source"]) {
                continue;
            }

            audioSources[index] = info["source"];
        }

        return audioSources;
    }


    #getStartTimeouts() {
        const startTimeouts = [];
        for (const [index, info] of Object.entries(this.#indexes)) {
            if (info["timeout"] === null) {
                continue;
            }

            startTimeouts[index] = info["timeout"];
        }

        return startTimeouts;
    }

    addTimeUpdate() {
        if (this.#timeUpdateHandler === null) {
            this.#timeUpdateHandler = this.#dispatchTimeUpdate.bind(this);
            this.#audioTag.addEventListener("timeupdate", this.#timeUpdateHandler);
        }
    }

    setCurrentIndex(index) {
        if (index === null) {
            return;
        }

        this.#currentTrackIndex = index;
    }

    removeTimeUpdate() {
        if (this.#timeUpdateHandler !== null) {
            this.#audioTag.removeEventListener("timeupdate", this.#timeUpdateHandler);
            this.#timeUpdateHandler = null;
        }
    }

    #dispatchTimeUpdate() {
        this.dispatchEvent(new CustomEvent("timeupdate", {detail: {value: this.getCurrentTime()}}));
    }

    async addTrack(url, callback) {
        this.#stopped = false;
        this.#nextTrackIndex = false;

        const index = this.#getUrls().includes(url) ? this.#getUrls().indexOf(url) : this.#getUrls().length;

        this.#indexes[index] = {
            "url": url,
            "from": null,
            "till": null,
            "buffer": null,
            "callback": callback,
            "source": null,
            "decoding": true,
            "timeout": null
        }

        if (this.isDecoding()) {
            this.#waitIndex = index;
            this.#abortDownload();
        }

        await this.#processDecodeQueue();
        this.#isDecoding = false;
    }

    getNextFreePartIndex() {
        return Object.keys(this.#indexes).length
    }

    getCurrentPart() {
        if (typeof this.#indexes[this.#currentTrackIndex] === "undefined") {
            return [null, null, null];
        }

        const part = this.#indexes[this.#currentTrackIndex];

        return [part["from"], part["till"], this.#currentTrackIndex];
    }

    getPartByTime(time) {
        for (const [index, part] of Object.entries(this.#indexes)) {
            if (!part || part["till"] === null) continue;

            if (part["from"] <= time && part["till"] > time) return [part["from"], part["till"], Number(index)];
        }

        return [null, null, null];
    }

    getPartByStartTime(time) {
        for (const [index, part] of Object.entries(this.#indexes)) {
            if (!part || part["till"] === null) continue;

            if (part["from"] === time && part["from"] !== part["till"]) return [part["from"], part["till"], Number(index)];
        }

        return [null, null, null];
    }

    partIsPlayable(index) {
        return !((typeof this.#indexes[index] === "undefined" || typeof this.#indexes[index]["from"] === "undefined"));
    }

    findMissingLengthByCurrentPart(time) {
        let currentLength = this.getPartLength(this.#currentTrackIndex);

        for (const part of Object.values(this.#indexes)) {
            if (!part) continue;

            if (part["from"] - time > 1 && part["from"] - time <= currentLength)
                return part["from"] - time;
        }
        return null;
    }

    async initialize() {
        this.#initialPlay = true;
        this.#stopped = false;

        this.#clearTimeouts();

        if (this.#audioTag.duration !== this.#length) {
            this.#audioTag.src = this.#createSilence(this.#length);
        }

        this.#audioTag.addEventListener("play", this.#playEventHandler);
        this.#audioTag.addEventListener("pause", this.#pauseEventHandler);

        if (this.#audioTag.paused) await this.#audioTag.play();
        if (audioContext.state !== "running") await audioContext.resume();

        if ('mediaSession' in navigator) {
            navigator.mediaSession.playbackState = "playing";
        }

        this.#setPositionState();
        this.addTimeUpdate();
    }

    playNext(index = 0, startTime = 0) {
        if (index === 0) {
            index = this.#currentTrackIndex;
        }

        if (!this.hadError() && !this.#stopped
            && !(startTime === 0 && this.isPlaying())
            && (!this.#executedTask || this.#initialPlay)
            && (this.#currentTrackIndex !== index || this.#initialPlay)
            && (this.#waitIndex === null || this.#waitIndex === index)) {

            this.#playing = true;

            if (this.#audioTag.paused)
                this.#audioTag.play();

            if (audioContext.state !== "running")
                audioContext.resume();

            const source = audioContext.createBufferSource();
            this.#indexes[index]["source"] = source;


            source.when = Math.max(0, audioContext.currentTime + Math.max(0, startTime));
            source.buffer = this.#indexes[index]["buffer"];
            source.connect(this.#gainNode);
            source.start(source.when, this.#offset);

            source.onended = () => {
                clearTimeout(this.#indexes[index]["timeout"]);
                this.#indexes[index]["timeout"] = null;

                if ((audioContext.currentTime - source.when) * 1000 < 50) {
                    this.pause();
                    this.initialize().then(() => this.playNext(index, startTime));

                    return;
                }

                if (!Object.keys(this.#getStartTimeouts()).length || this.getCurrentTime() >= this.getDuration()) {
                    this.dispatchEvent(new Event("end"));
                }
            }

            this.#indexes[index]["timeout"] = setTimeout(() => {
                this.#executedTask = true;
                this.#startTime = source.when;

                this.setCurrentIndex(index);
                this.dispatchEvent(new Event("play"));
            }, startTime * 1000 + 200);
        }
    }

    pause(bypass = false) {
        this.#playing = false;
        this.#nextTrackIndex = false;
        this.#waitIndex = null;

        this.#clearTimeouts();

        if (!bypass) {
            this.#audioTag.removeEventListener("play", this.#playEventHandler);
            this.#audioTag.removeEventListener("pause", this.#pauseEventHandler);

            this.removeTimeUpdate();
        }

        if (!this.#audioTag.paused) this.#audioTag.pause();

        if ('mediaSession' in navigator) {
            let duration = this.#audioTag.duration;

            if (isNaN(duration)) {
                duration = 0;
            }

            navigator.mediaSession.playbackState = "paused";
            navigator.mediaSession.setPositionState({
                duration: duration,
                playbackRate: 0.00001,
                position: this.#audioTag.currentTime
            });
        }

        this.setOffset(this.getCurrentPartTime());

        Object.values(this.#getAudioSources()).forEach((source) => {
            this.#killSource(source);
        });

        audioContext.suspend().finally(() => {
            if (!this.#stopped) this.dispatchEvent(new Event("pause"));
        });
    }

    stop() {
        this.#executedTask = true;
        this.#hadError = false;
        this.#isDecoding = false;
        this.#stopped = true;
        this.#initialPlay = true;

        this.#abortDownload();
        this.pause();
        this.reset();
    }

    #playEvent() {
        if (!this.isPlaying() && !this.#initialPlay) {
            this.#initialPlay = true;

            this.#setPositionState();
            this.playNext(this.#currentTrackIndex, 0);
        }
    }

    #pauseEvent() {
        if (this.isPlaying() && !this.#initialPlay)
            this.pause(true);
    }

    queueTrack(index, startTime = null) {
        if (
            typeof this.#indexes[index] !== "undefined" &&
            typeof this.#indexes[index]["buffer"] !== "undefined" && this.#indexes[index]["buffer"] !== null &&
            typeof this.#indexes[this.#currentTrackIndex] !== "undefined" &&
            typeof this.#indexes[this.#currentTrackIndex]["buffer"] !== "undefined" && this.#indexes[this.#currentTrackIndex]["buffer"] !== null
        ) {
            if (startTime === null || this.isPlaying()) {
                startTime = (this.getPartLength(this.#currentTrackIndex) - this.#offset) - this.getStartTime();
            }

            if (this.#indexes[index]["timeout"] !== null) {
                return false;
            }

            if (this.#executedTask) {
                this.#executedTask = false;
                this.#initialPlay = false;

                this.#nextTrackIndex = true;

                this.setOffset(0);
                this.playNext(index, (startTime >= 0) ? startTime : 0);
            }
        }

        return true;
    }

    getStartTime() {
        return Math.max(0, audioContext.currentTime - Math.max(0, this.#startTime));
    }

    getCurrentPartTime() {
        return (!this.#initialPlay) ? this.getStartTime() + this.#currentOffset : 0;
    }

    getPartLength(partIndex) {
        if (
            typeof this.#indexes[partIndex] !== "undefined" &&
            typeof this.#indexes[partIndex]["buffer"] !== "undefined" &&
            this.#indexes[partIndex]["buffer"] !== null
        ) {
            return parseInt(this.#indexes[partIndex]["buffer"].duration);
        }
        return 0;
    }

    getCurrentTime() {
        return parseInt(String(this.#audioTag.currentTime));
    }

    #removePart(index) {
        delete this.#indexes[index];
    }

    setVolume(volume) {
        this.#volume = volume;

        this.#gainNode.gain.value = volume;
        this.#audioTag.volume = volume;
    }

    setOffset(offset) {
        this.#currentOffset = this.#offset;
        this.#offset = (offset >= 0) ? offset : 0;
    }

    setCurrentTime(time) {
        this.#audioTag.currentTime = time;
        this.#setPositionState();
    }

    isPlaying() {
        return this.#playing;
    }

    isDecoding() {
        return this.#isDecoding;
    }

    getDuration() {
        return this.#length;
    }

    hadError() {
        return this.#hadError;
    }

    #getUrlExtension(url) {
        return url.split(/[#?]/)[0].split('.').pop().trim();
    }

    setMetadata(title, artist, cover) {
        if ('mediaSession' in navigator) {
            const type = this.#getUrlExtension(cover);
            navigator.mediaSession.metadata = new MediaMetadata({
                title: title, artist: artist, artwork: [
                    {src: cover + "?size=512", type: "image/" + type, sizes: "512x512"},
                    {src: cover + "?size=384", type: "image/" + type, sizes: "384x384"},
                    {src: cover + "?size=256", type: "image/" + type, sizes: "256x256"},
                    {src: cover + "?size=192", type: "image/" + type, sizes: "192x192"},
                    {src: cover + "?size=128", type: "image/" + type, sizes: "128x128"},
                    {src: cover + "?size=96", type: "image/" + type, sizes: "96x96"},
                ]
            });

        }
    }

    setActionHandler(action, handler) {
        if ('mediaSession' in navigator) {
            navigator.mediaSession.setActionHandler(action, handler);
        }
    }

    clear() {
        this.pause();
        this.reset();

        this.#indexes = [];
    }

    reset() {
        if (this.isPlaying()) {
            return;
        }

        this.setCurrentIndex(parseInt(this.getPartByStartTime(0)[2]));
        this.setCurrentTime(0);
        this.setOffset(0);
    }

    #abortDownload() {
        this.#abortController.abort();

        this.#abortController = new AbortController();
        this.#abortSignal = this.#abortController.signal;
    }

    async #processDecodeQueue() {
        if (Object.values(this.#getDecodingQueue()).length && !this.#stopped) {
            this.#isDecoding = true;

            let url;
            if (this.#waitIndex !== null) {
                url = this.#getDecodingQueue()[this.#waitIndex];
            } else {
                const lastKey = Object.keys(this.#getDecodingQueue()).pop();
                url = this.#getDecodingQueue()[lastKey];
            }

            let bufferIndex = null;
            let response = null;
            try {
                if (typeof url === "undefined") throw new Error();

                response = await fetch(url, {
                    signal: this.#abortSignal
                });

                if (!response.ok) throw new Error();
                
                this.#hadError = false;
            } catch (e) {
                this.#hadError = true;
                this.#isDecoding = false;

                bufferIndex = this.#getUrls().indexOf(url);
                
                if (!e.toString().includes("AbortError")) {
                    this.#removePart(bufferIndex);

                    if (!this.#stopped) {
                        this.dispatchEvent(new Event("downloadError"));
                    }
                } else if (this.#getUrls().indexOf(url) !== -1 && !this.#stopped) {
                    this.#indexes[bufferIndex]["decoding"] = true;
                }

                return;
            }

            try {
                bufferIndex = this.#getUrls().indexOf(url);
                
                const arrayBuffer = await response.arrayBuffer();
                this.#indexes[bufferIndex]["buffer"] = await audioContext.decodeAudioData(arrayBuffer);

                this.#hadError = false;
            } catch (e) {
                this.#hadError = true;
                this.#isDecoding = false;

                bufferIndex = this.#getUrls().indexOf(url);

                if (!e.toString().includes("AbortError")) {
                    this.#removePart(bufferIndex);

                    if (!this.#stopped)
                        this.dispatchEvent(new Event("downloadError"));
                } else if (this.#getUrls().indexOf(url) !== -1 && !this.#stopped) {
                    this.#indexes[bufferIndex]["decoding"] = true;
                }

                return;
            }

            bufferIndex = this.#getUrls().indexOf(url);

            this.#indexes[bufferIndex]["decoding"] = false;

            if (typeof this.#indexes[bufferIndex]["callback"] !== "undefined") {
                this.#indexes[bufferIndex]["callback"](this.#indexes, bufferIndex);
                delete this.#indexes[bufferIndex]["callback"];

                this.#indexes[bufferIndex]["till"] = this.#indexes[bufferIndex]["from"] + this.getPartLength(bufferIndex);
            } else {
                return;
            }

            if (Object.keys(this.#getDecodingQueue()).length === 0 || this.#stopped)
                this.#isDecoding = false;

            if (!this.#stopped) {
                bufferIndex = this.#getUrls().indexOf(url);

                if (bufferIndex === this.#waitIndex) {
                    this.#clearTimeouts();
                    
                    this.dispatchEvent(new CustomEvent("processed", {
                        detail: {
                            set: true,
                            initialPlay: false
                        }
                    }));

                    this.#waitIndex = null;
                } else {
                    this.dispatchEvent(new CustomEvent("processed", {
                        detail: {
                            set: !this.#nextTrackIndex,
                            initialPlay: this.#getUrls().length === 1
                        }
                    }));
                }

                if (!this.isDecoding()) {
                    await this.#processDecodeQueue();
                }
            }
        }
    }

    #clearTimeouts() {
        for (const [index, timeout] of Object.entries(this.#getStartTimeouts())) {
            clearTimeout(Number(timeout));
            this.#indexes[index]["timeout"] = null;
        }
    }

    #killSource(source) {
        source.onended = () => {
        };

        try {
            source.stop(source.when);
        } catch (ignored) {
        }

        try {
            source.disconnect(this.#gainNode);
        } catch (ignored) {
        }
    }

    /*
     * Funktion: createSilence()
     * Autor: ktcy (https://gist.github.com/ktcy/1e981cfee7a309beebb33cdab1e29715)
     * Argumente:
     *  seconds: (Integer) Definiert die Dauer des Platzhalters
     *
     * Erstellt einen Platzhalter in der Länge des momentanen Liedes
     * Dafür da, damit die MediaSession API besser und vor allem überall funktioniert
     */
    #createSilence(seconds = 1) {
        const sampleRate = 8000;
        const numChannels = 1;
        const bitsPerSample = 8;

        const blockAlign = numChannels * bitsPerSample / 8;
        const byteRate = sampleRate * blockAlign;
        const dataSize = Math.ceil(seconds * sampleRate) * blockAlign;
        const chunkSize = 36 + dataSize;
        const byteLength = 8 + chunkSize;

        const buffer = new ArrayBuffer(byteLength);
        const view = new DataView(buffer);

        view.setUint32(0, 0x52494646, false);    // Chunk ID 'RIFF'
        view.setUint32(4, chunkSize, true);      // File size
        view.setUint32(8, 0x57415645, false);    // Format 'WAVE'
        view.setUint32(12, 0x666D7420, false);   // Sub-chunk 1 ID 'fmt '
        view.setUint32(16, 16, true);            // Sub-chunk 1 size
        view.setUint16(20, 1, true);             // Audio format
        view.setUint16(22, numChannels, true);   // Number of channels
        view.setUint32(24, sampleRate, true);    // Sample rate
        view.setUint32(28, byteRate, true);      // Byte rate
        view.setUint16(32, blockAlign, true);    // Block align
        view.setUint16(34, bitsPerSample, true); // Bits per sample
        view.setUint32(36, 0x64617461, false);   // Sub-chunk 2 ID 'data'
        view.setUint32(40, dataSize, true);      // Sub-chunk 2 size

        for (let offset = 44; offset < byteLength; offset++) {
            view.setUint8(offset, 128);
        }

        const blob = new Blob([view], {type: 'audio/wav'});
        return URL.createObjectURL(blob);
    }

    #setPositionState() {
        if ('mediaSession' in navigator) {
            let duration = this.#audioTag.duration;

            if (isNaN(duration)) {
                duration = 0;
            }

            navigator.mediaSession.setPositionState({
                duration: duration,
                playbackRate: this.#audioTag.playbackRate,
                position: this.#audioTag.currentTime
            });
        }
    }
}
