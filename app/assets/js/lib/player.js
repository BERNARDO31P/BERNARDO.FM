const audioContext = new (window.AudioContext || window.webkitAudioContext)({
    latencyHint: "playback", sampleRate: 44100
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
    #hadError = false;

    #length = 0;
    #volume = 1;
    #gainNode = null;

    #indexes = [];

    #currentTrackIndex = 0;
    #nextTrackIndex = false;

    #startTime = 0;

    #timeUpdateHandler = null;
    #playEventHandler = null;
    #pauseEventHandler = null;

    #decodeGeneration = 0;

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

        document.addEventListener("visibilitychange", () => {
            if (document.hidden || this.#stopped) {
                return;
            }

            this.#dispatchTimeUpdate(true);
        });
    }

    #getIndexByUrl(url) {
        for (const [index, info] of Object.entries(this.#indexes)) {
            if (!info) {
                continue;
            }

            if (info["url"] === url) {
                return Number(index);
            }
        }

        return -1;
    }

    #getDecodingQueue() {
        const decodingQueue = {};

        for (const [index, info] of Object.entries(this.#indexes)) {
            if (!info || !info["decoding"]) {
                continue;
            }

            decodingQueue[index] = info["url"];
        }

        return decodingQueue;
    }

    #getAudioSources() {
        const audioSources = {};

        for (const [index, info] of Object.entries(this.#indexes)) {
            if (!info || !info["source"]) {
                continue;
            }

            audioSources[index] = info["source"];
        }

        return audioSources;
    }

    #getStartTimeouts() {
        const startTimeouts = {};

        for (const [index, info] of Object.entries(this.#indexes)) {
            if (!info || info["timeout"] === null) {
                continue;
            }

            startTimeouts[index] = info["timeout"];
        }

        return startTimeouts;
    }

    #isAbortError(error, signal = null) {
        if (error?.name === "AbortError") {
            return true;
        }

        return signal !== null && signal.aborted && error === signal.reason;
    }

    addTimeUpdate() {
        if (this.#timeUpdateHandler === null) {
            this.#timeUpdateHandler = this.#dispatchTimeUpdate.bind(this);
            this.#audioTag.addEventListener("timeupdate", this.#timeUpdateHandler);
        }
    }

    setCurrentIndex(index) {
        if (index === null || !isFinite(index)) {
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

    #dispatchTimeUpdate(bypass = false) {
        if (!bypass && !this.isPlaying() && !this.isDecoding()) {
            this.pause();
        }

        this.dispatchEvent(new CustomEvent("timeupdate", {
            detail: {
                value: this.getCurrentTime(),
                empty: this.#currentTrackIndex !== 0 && !Object.keys(this.#getDecodingQueue()).length && !Object.keys(this.#getStartTimeouts()).length
            }
        }));
    }

    async addTrack(url, callback) {
        try {
            this.#stopped = false;
            this.#nextTrackIndex = false;

            let index = this.#getIndexByUrl(url);

            if (index === -1) {
                index = this.getNextFreePartIndex();

                this.#indexes[index] = {
                    "url": url,
                    "from": null,
                    "till": null,
                    "buffer": null,
                    "callback": callback,
                    "source": null,
                    "decoding": true,
                    "timeout": null,
                    "offset": 0
                };
            }

            if (this.isDecoding()) {
                if (this.#indexes[index] && this.#indexes[index]["decoding"]) {
                    this.#waitIndex = index;
                    this.#abortDownload();
                } else {
                    return;
                }
            }

            await this.#processDecodeQueue();
        } catch (error) {
            if (!this.#isAbortError(error)) {
                console.error(error);
            }
        }
    }

    getNextFreePartIndex() {
        const indexes = Object.keys(this.#indexes)
            .map((index) => Number(index))
            .filter((index) => Number.isFinite(index));

        if (!indexes.length) {
            return 0;
        }

        return Math.max(...indexes) + 1;
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
            if (!part || part["till"] === null) {
                continue;
            }

            if (part["from"] <= time && part["till"] > time) {
                return [part["from"], part["till"], Number(index)];
            }
        }

        return [null, null, null];
    }

    getPartByStartTime(time) {
        for (const [index, part] of Object.entries(this.#indexes)) {
            if (!part || part["till"] === null) {
                continue;
            }

            if (part["from"] === time && part["from"] !== part["till"]) {
                return [part["from"], part["till"], Number(index)];
            }
        }

        return [null, null, null];
    }

    partIsPlayable(index) {
        return typeof this.#indexes[index] !== "undefined"
            && this.#indexes[index] !== null
            && typeof this.#indexes[index]["from"] !== "undefined"
            && this.#indexes[index]["from"] !== null;
    }

    findMissingLengthByCurrentPart(time) {
        const currentLength = this.getPartLength(this.#currentTrackIndex);

        for (const part of Object.values(this.#indexes)) {
            if (!part) {
                continue;
            }

            if (part["from"] - time > 1 && part["from"] - time <= currentLength) {
                return part["from"] - time;
            }
        }

        return null;
    }

    async initialize() {
        this.#initialPlay = true;
        this.#stopped = false;
        this.#hadError = false;

        this.#clearTimeouts();

        if (this.#audioTag.duration !== this.#length) {
            this.#audioTag.src = this.#createSilence(this.#length);
        }

        this.#audioTag.addEventListener("play", this.#playEventHandler);
        this.#audioTag.addEventListener("pause", this.#pauseEventHandler);

        if (this.#audioTag.paused) {
            await this.#audioTag.play();
        }

        if (audioContext.state !== "running") {
            await audioContext.resume();
        }

        if ("mediaSession" in navigator) {
            navigator.mediaSession.playbackState = "playing";
        }

        this.#setPositionState();
        this.addTimeUpdate();
    }

    playNext(index = 0, startTime = 0) {
        if (index === 0) {
            index = this.#currentTrackIndex;
        }

        if (typeof this.#indexes[index] === "undefined") {
            return;
        }

        if (!this.hadError() && !this.#stopped
            && !(startTime === 0 && this.isPlaying())
            && (this.#currentTrackIndex !== index || this.#initialPlay)
            && (this.#waitIndex === null || this.#waitIndex === index || this.hadError())) {

            this.#playing = true;

            if (this.#audioTag.paused) {
                void this.#audioTag.play().catch((error) => {
                    if (error?.name !== "AbortError") {
                        console.error(error);
                    }
                });
            }

            if (audioContext.state !== "running") {
                void audioContext.resume().catch((error) => {
                    console.error(error);
                });
            }

            const source = audioContext.createBufferSource();
            this.#indexes[index]["source"] = source;

            source.when = Math.max(0, audioContext.currentTime + Math.max(0, startTime));
            source.buffer = this.#indexes[index]["buffer"];
            source.connect(this.#gainNode);
            source.start(source.when, this.getOffset(index));

            source.onended = () => {
                if (typeof this.#indexes[index] === "undefined") {
                    return;
                }

                clearTimeout(this.#indexes[index]["timeout"]);
                this.#indexes[index]["timeout"] = null;

                const durationExceeded = !(this.getDuration() - this.getCurrentWebAudioTime() > 1);
                if (durationExceeded) {
                    this.dispatchEvent(new Event("end"));

                    return;
                }

                const hasTimeouts = Object.keys(this.#getStartTimeouts()).length;
                if (hasTimeouts) {
                    return;
                }

                const hasDecodingQueue = Object.keys(this.#getDecodingQueue()).length;
                if (hasDecodingQueue) {
                    if (!this.isDecoding()) {
                        void this.#processDecodeQueue().catch((error) => {
                            if (!this.#isAbortError(error)) {
                                console.error(error);
                            }
                        });
                    }

                    return;
                }

                this.pause();
            };

            this.#indexes[index]["timeout"] = setTimeout(() => {
                this.#startTime = source.when;

                this.setCurrentIndex(index);
                this.setCurrentTime(this.getCurrentWebAudioTime());

                this.#clearStartup();
                this.dispatchEvent(new Event("play"));
            }, startTime * 1000 + 200);
        }
    }

    #clearStartup() {
        this.#clearTimeouts();

        Object.entries(this.#getAudioSources()).forEach(([index, source]) => {
            if (parseInt(index) === this.#currentTrackIndex) {
                return;
            }

            this.#killSource(source);
        });
    }

    pause(bypass = false) {
        if (!this.#playing) {
            return;
        }

        this.#playing = false;
        this.#nextTrackIndex = false;
        this.#waitIndex = null;

        this.#clearTimeouts();
        this.#abortDownload();

        if (!bypass) {
            this.#audioTag.removeEventListener("play", this.#playEventHandler);
            this.#audioTag.removeEventListener("pause", this.#pauseEventHandler);

            this.removeTimeUpdate();
        }

        if (!this.#audioTag.paused) {
            this.#audioTag.pause();
        }

        if ("mediaSession" in navigator) {
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

        this.setOffset(this.getCurrentPartTime(), this.#currentTrackIndex);

        Object.values(this.#getAudioSources()).forEach((source) => {
            this.#killSource(source);
        });

        void audioContext.suspend().then(() => {
            if (!this.#stopped) {
                this.dispatchEvent(new Event("pause"));
            }
        }).catch((error) => {
            console.error(error);
        });
    }

    stop() {
        this.#hadError = false;
        this.#stopped = true;
        this.#initialPlay = true;

        if (this.#playing) {
            this.pause();
        } else {
            this.#nextTrackIndex = false;
            this.#waitIndex = null;

            this.#clearTimeouts();
            this.#abortDownload();
        }

        this.reset();
    }

    #playEvent() {
        if (!this.isPlaying()) {
            this.#initialPlay = true;

            this.#setPositionState();
            this.playNext();
        }
    }

    #pauseEvent() {
        if (this.isPlaying()) {
            this.pause(true);
        }
    }

    queueTrack(index, startTime = null) {
        if (typeof this.#indexes[index] !== "undefined"
            && typeof this.#indexes[index]["buffer"] !== "undefined"
            && this.#indexes[index]["buffer"] !== null
            && typeof this.#indexes[this.#currentTrackIndex] !== "undefined"
            && typeof this.#indexes[this.#currentTrackIndex]["buffer"] !== "undefined"
            && this.#indexes[this.#currentTrackIndex]["buffer"] !== null) {

            if (startTime === null || this.isPlaying()) {
                startTime = (this.getPartLength(this.#currentTrackIndex) - this.getOffset(this.#currentTrackIndex)) - this.getStartTime();
            }

            if (this.#indexes[index]["timeout"] !== null) {
                return false;
            }

            this.#initialPlay = false;
            this.#nextTrackIndex = true;

            this.setOffset(0, index);
            this.playNext(index, startTime >= 0 ? startTime : 0);
        }

        return true;
    }

    getStartTime() {
        return Math.max(0, audioContext.currentTime - Math.max(0, this.#startTime));
    }

    getCurrentPartTime() {
        const currentPart = this.getCurrentPart();

        if (currentPart[2] === null || !isFinite(currentPart[2])) {
            return 0;
        }

        return this.getStartTime() + this.getOffset(parseInt(currentPart[2]));
    }

    getPartLength(partIndex) {
        if (typeof this.#indexes[partIndex] !== "undefined"
            && typeof this.#indexes[partIndex]["buffer"] !== "undefined"
            && this.#indexes[partIndex]["buffer"] !== null) {

            return parseInt(this.#indexes[partIndex]["buffer"].duration);
        }

        return 0;
    }

    getCurrentTime() {
        return parseInt(String(this.#audioTag.currentTime));
    }

    getCurrentWebAudioTime() {
        const currentPart = this.getCurrentPart();

        if (currentPart[0] !== null && isFinite(currentPart[0])) {
            return parseInt(currentPart[0]) + this.getCurrentPartTime();
        }

        return this.getCurrentTime();
    }

    #removePart(index) {
        if (index === -1 || typeof this.#indexes[index] === "undefined") {
            return;
        }

        delete this.#indexes[index];
    }

    setVolume(volume) {
        this.#volume = volume;

        this.#gainNode.gain.value = volume;
        this.#audioTag.volume = volume;
    }

    getOffset(index) {
        if (typeof this.#indexes[index] === "undefined") {
            return 0;
        }

        const offset = parseInt(this.#indexes[index]["offset"]);

        if (this.getPartLength(index) === offset) {
            return 0;
        }

        return offset;
    }

    setOffset(offset, index) {
        if (typeof this.#indexes[index] === "undefined") {
            return;
        }

        this.#indexes[index]["offset"] = offset;
    }

    setCurrentTime(time, bypass = false) {
        this.#audioTag.currentTime = time;
        this.#setPositionState();

        if (!bypass) {
            this.#dispatchTimeUpdate();
        }
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
        return url.split(/[#?]/)[0].split(".").pop().trim();
    }

    setMetadata(title, artist, cover) {
        if ("mediaSession" in navigator) {
            const type = this.#getUrlExtension(cover);

            navigator.mediaSession.metadata = new MediaMetadata({
                title: title, artist: artist, artwork: [
                    {src: cover + "?size=512", type: "image/" + type, sizes: "512x512"},
                    {src: cover + "?size=384", type: "image/" + type, sizes: "384x384"},
                    {src: cover + "?size=256", type: "image/" + type, sizes: "256x256"},
                    {src: cover + "?size=192", type: "image/" + type, sizes: "192x192"},
                    {src: cover + "?size=128", type: "image/" + type, sizes: "128x128"},
                    {src: cover + "?size=96", type: "image/" + type, sizes: "96x96"}
                ]
            });
        }
    }

    setActionHandler(action, handler) {
        if ("mediaSession" in navigator) {
            navigator.mediaSession.setActionHandler(action, handler);
        }
    }

    clear() {
        if (this.#playing) {
            this.pause();
        } else {
            this.#nextTrackIndex = false;
            this.#waitIndex = null;

            this.#clearTimeouts();
            this.#abortDownload();
        }

        this.reset();
        this.#indexes = [];
    }

    reset() {
        if (this.isPlaying()) {
            return;
        }

        const currentPartIndex = parseInt(this.getPartByStartTime(0)[2]);

        this.setCurrentIndex(currentPartIndex);
        this.setCurrentTime(0);
        this.setOffset(0, currentPartIndex);
    }

    #abortDownload() {
        const abortController = this.#abortController;

        this.#decodeGeneration++;
        this.#isDecoding = false;

        /*
         * Install the controller for the next download BEFORE aborting
         * the previous one.
         */
        this.#abortController = new AbortController();
        this.#abortSignal = this.#abortController.signal;

        if (!abortController.signal.aborted) {
            abortController.abort(new DOMException("Audio download aborted", "AbortError"));
        }
    }

    async #processDecodeQueue() {
        const initialQueue = this.#getDecodingQueue();

        if (!Object.keys(initialQueue).length || this.#stopped) {
            this.dispatchEvent(new CustomEvent("processed", {
                detail: {
                    set: true
                }
            }));

            return;
        }

        /*
         * This worker owns this exact generation and this exact signal.
         * #abortDownload() cannot replace the signal underneath it.
         */
        const generation = this.#decodeGeneration;
        const signal = this.#abortSignal;

        this.#isDecoding = true;

        try {
            while (!this.#stopped && generation === this.#decodeGeneration) {
                const decodingQueue = this.#getDecodingQueue();
                const queueIndexes = Object.keys(decodingQueue);

                if (!queueIndexes.length) {
                    break;
                }

                let queueIndex;

                /*
                 * The timeline-released part always has priority.
                 * Once that part finishes, the interrupted part is still
                 * marked "decoding" and remains in this queue.
                 */
                if (this.#waitIndex !== null && Object.prototype.hasOwnProperty.call(decodingQueue, this.#waitIndex)) {
                    queueIndex = String(this.#waitIndex);
                } else {
                    queueIndex = queueIndexes[queueIndexes.length - 1];
                }

                const bufferIndex = Number(queueIndex);
                const url = decodingQueue[queueIndex];

                if (typeof url === "undefined" || typeof this.#indexes[bufferIndex] === "undefined") {
                    if (bufferIndex === this.#waitIndex) {
                        this.#waitIndex = null;
                    }

                    continue;
                }

                this.dispatchEvent(new Event("processing"));

                let decodedBuffer;

                try {
                    const response = await fetch(url, {
                        signal: signal
                    });

                    if (generation !== this.#decodeGeneration) {
                        return;
                    }

                    if (!response.ok) {
                        throw new Error("Unable to download audio track");
                    }

                    const arrayBuffer = await response.arrayBuffer();

                    if (generation !== this.#decodeGeneration) {
                        return;
                    }

                    decodedBuffer = await audioContext.decodeAudioData(arrayBuffer);

                    if (generation !== this.#decodeGeneration) {
                        return;
                    }
                } catch (error) {
                    /*
                     * Generation changed means this worker was explicitly
                     * cancelled by #abortDownload(). The part deliberately
                     * stays "decoding": true so the next worker can fetch it
                     * after the priority part.
                     */
                    if (generation !== this.#decodeGeneration) {
                        return;
                    }

                    if (this.#isAbortError(error, signal)) {
                        return;
                    }

                    this.#hadError = true;

                    if (bufferIndex === this.#waitIndex) {
                        this.#waitIndex = null;
                    }

                    this.#removePart(bufferIndex);

                    if (!this.#stopped) {
                        this.dispatchEvent(new Event("downloadError"));
                    }

                    return;
                }

                if (generation !== this.#decodeGeneration) {
                    return;
                }

                if (typeof this.#indexes[bufferIndex] === "undefined") {
                    continue;
                }

                this.#indexes[bufferIndex]["buffer"] = decodedBuffer;
                this.#indexes[bufferIndex]["decoding"] = false;
                this.#hadError = false;

                this.dispatchEvent(new Event("processing"));

                if (typeof this.#indexes[bufferIndex]["callback"] !== "undefined") {
                    this.#indexes[bufferIndex]["from"] = this.#indexes[bufferIndex]["callback"](this.#indexes, bufferIndex);
                    this.#indexes[bufferIndex]["till"] = this.#indexes[bufferIndex]["from"] + this.getPartLength(bufferIndex);

                    delete this.#indexes[bufferIndex]["callback"];
                } else if (this.#currentTrackIndex !== bufferIndex && this.getCurrentPart()[2] !== bufferIndex) {
                    this.#indexes[bufferIndex]["url"] = null;
                    this.#indexes[bufferIndex]["from"] = null;
                    this.#indexes[bufferIndex]["till"] = null;

                    if (bufferIndex === this.#waitIndex) {
                        this.#waitIndex = null;
                    }

                    continue;
                }

                if (!isFinite(this.#currentTrackIndex)) {
                    this.#currentTrackIndex = this.getPartByStartTime(this.getCurrentTime())[2];
                }

                if (this.#stopped || generation !== this.#decodeGeneration) {
                    return;
                }

                if (bufferIndex === this.#waitIndex) {
                    this.#clearTimeouts();

                    this.dispatchEvent(new CustomEvent("processed", {
                        detail: {
                            set: true
                        }
                    }));

                    this.#waitIndex = null;
                } else {
                    this.dispatchEvent(new CustomEvent("processed", {
                        detail: {
                            set: !this.#nextTrackIndex
                        }
                    }));
                }
            }
        } catch (error) {
            /*
             * Final safety boundary. AbortError must never leave this
             * worker as a rejected Promise.
             */
            if (!this.#isAbortError(error, signal)) {
                throw error;
            }
        } finally {
            /*
             * An aborted/stale worker must not clear #isDecoding after
             * its replacement has already started.
             */
            if (generation === this.#decodeGeneration) {
                this.#isDecoding = false;
            }
        }
    }

    #clearTimeouts() {
        for (const [index, timeout] of Object.entries(this.#getStartTimeouts())) {
            clearTimeout(Number(timeout));

            if (typeof this.#indexes[index] !== "undefined") {
                this.#indexes[index]["timeout"] = null;
            }
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

        const blob = new Blob([view], {type: "audio/wav"});
        return URL.createObjectURL(blob);
    }

    #setPositionState() {
        if ("mediaSession" in navigator) {
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
