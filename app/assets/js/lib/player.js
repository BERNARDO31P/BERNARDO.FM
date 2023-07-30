class MultiTrackPlayer extends EventTarget {
    #waitIndex = null;

    #abortController = new AbortController();
    #abortSignal = this.#abortController.signal;

    #audioTag = new Audio();
    #initialPlay = true;

    #length = 0;
    #volume = 1;
    #gainNode = null;

    #urls = [];
    #audioBuffers = {};
    #audioSources = {};

    #isDecoding = false;
    #decodingQueue = {};
    #decodingCallbacks = [];

    #currentTrackIndex = 0;
    #nextTrackIndex = false;

    #startTime = 0;
    #startTimeouts = {};

    #offset = 0;
    #currentOffset = 0;

    #playing = false;
    #executedTask = true;

    #hadError = false;

    #timeUpdateHandler = null;
    #playEventHandler = null;
    #pauseEventHandler = null;

    constructor(length) {
        super();

        this.#gainNode = audioContext.createGain();
        this.#gainNode.connect(audioContext.destination);
        this.#gainNode.gain.value = this.#volume;

        this.#length = length + 1;

        this.#audioTag = document.getElementById("MultiTrackPlayer");
        if (!this.#audioTag) {
            this.#audioTag = new Audio(this.#createSilence(1));

            this.#audioTag.controls = true;
            this.#audioTag.id = "MultiTrackPlayer";

            document.body.append(this.#audioTag);
        }

        this.#playEventHandler = this.#playEvent.bind(this);
        this.#pauseEventHandler = this.#pauseEvent.bind(this);
    }

    addTimeUpdate() {
        this.#timeUpdateHandler = this.#dispatchTimeUpdate.bind(this);
        this.#audioTag.addEventListener("timeupdate", this.#timeUpdateHandler);
    }

    removeTimeUpdate() {
        if (this.#timeUpdateHandler)
            this.#audioTag.removeEventListener("timeupdate", this.#timeUpdateHandler);
    }

    #dispatchTimeUpdate() {
        this.dispatchEvent(new CustomEvent("timeupdate", {detail: {index: this.#audioTag.currentTime}}));
    }

    addTrack(url, callback) {
        if (this.#urls.includes(url)) return;
        this.#nextTrackIndex = false;

        const index = this.#urls.push(url) - 1;
        this.#audioBuffers[index] = null;
        this.#decodingCallbacks[index] = callback;
        this.#decodingQueue[index] = url;

        if (!this.isDecoding())
            this.#processDecodeQueue();
        else {
            this.#waitIndex = index;
            this.#abortDownload();
        }
    }

    async initialize() {
        this.#initialPlay = true;

        if (this.#audioTag.duration !== this.#length) {
            this.#audioTag.src = this.#createSilence(this.#length);
        }

        this.#audioTag.addEventListener("play", this.#playEventHandler);
        this.#audioTag.addEventListener("pause", this.#pauseEventHandler);

        if (this.#audioTag.paused) await this.#audioTag.play();
        if (audioContext.state !== "running") await audioContext.resume();

        this.#setPositionState();
        this.addTimeUpdate();
    }

    playNext(index = 0, startTime = 0) {
        if (!this.hadError()
            && !(startTime !== 0 && !this.isPlaying())
            && !(startTime === 0 && this.isPlaying())
            && (this.#waitIndex === null || this.#waitIndex === index)) {

            this.#playing = true;

            if (audioContext.state !== "running")
                audioContext.resume();

            const source = audioContext.createBufferSource();
            this.#audioSources[index] = source;

            source.buffer = this.#audioBuffers[index];
            source.connect(this.#gainNode);

            let when = audioContext.currentTime;
            try {
                source.start(startTime + when, this.#offset);
                when = startTime + when;
            } catch (e) {
                source.start(when, this.#offset);
            }
            source.when = when;

            source.onended = () => {
                delete this.#startTimeouts[index];
                this.#currentOffset = 0;

                if (!Object.keys(this.#startTimeouts).length) {
                    this.#clearTimeouts();
                    this.dispatchEvent(new Event("end"));
                }
            }

            this.#startTimeouts[index] = setTimeout(async () => {
                this.#executedTask = true;
                this.#currentTrackIndex = index;
                this.#startTime = when;

                this.dispatchEvent(new Event("play"));
            }, startTime * 1000);
        }
    }

    pause(bypass = false) {
        this.#playing = false;
        this.#nextTrackIndex = false;

        if (!bypass) {
            this.#audioTag.removeEventListener("play", this.#playEventHandler);
            this.#audioTag.removeEventListener("pause", this.#pauseEventHandler);

            this.removeTimeUpdate();
        }

        if (!this.#audioTag.paused) this.#audioTag.pause();

        this.#clearTimeouts();
        this.setOffset(this.getCurrentPartTime());

        Object.values(this.#audioSources).forEach((source) => {
            this.#killSource(source);
        });

        audioContext.suspend().finally(() => {
            this.dispatchEvent(new Event("pause"));
        });
    }

    #playEvent() {
        if (!this.isPlaying() && !this.#initialPlay) {
            this.#setPositionState();
            this.playNext(this.#currentTrackIndex, 0);
        }
    }

    #pauseEvent() {
        if (this.isPlaying() && !this.#initialPlay)
            this.pause(true);
    }

    queueTrack(index, startTime = null) {
        if (typeof this.#audioBuffers[index] !== "undefined"
            && this.#audioBuffers[index] !== null
            && typeof this.#audioBuffers[this.#currentTrackIndex] !== "undefined"
            && this.#audioBuffers[this.#currentTrackIndex] !== null) {

            if (startTime === null || this.isPlaying())
                startTime = (this.#audioBuffers[this.#currentTrackIndex].duration - this.#offset) - this.getStartTime();

            if (this.#executedTask) {
                this.#executedTask = false;
                this.#initialPlay = false;

                this.#nextTrackIndex = true;

                this.setOffset(0);
                this.playNext(index, startTime);
            }
        }
    }

    getStartTime() {
        return audioContext.currentTime - this.#startTime;
    }

    getCurrentPartTime() {
        return (!this.#initialPlay) ? this.getStartTime() + this.#currentOffset : 0;
    }

    getPartLength(partIndex) {
        if (typeof this.#audioBuffers[partIndex] !== "undefined"
            && this.#audioBuffers[partIndex] !== null) {
            return this.#audioBuffers[partIndex].duration;
        }
        return 0;
    }

    getCurrentTime() {
        return this.#audioTag.currentTime;
    }

    #removePart(index) {
        delete this.#audioBuffers[index];
        delete this.#audioSources[index];
        this.#urls.splice(index, 1);
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

    setMetadata(title, artist, cover) {
        if ('mediaSession' in navigator) {
            navigator.mediaSession.metadata = new MediaMetadata({
                title: title, artist: artist, artwork: [
                    {src: cover + "?size=96", type: "image/png", sizes: "96x96"},
                    {src: cover + "?size=128", type: "image/png", sizes: "128x128"},
                    {src: cover + "?size=192", type: "image/png", sizes: "192x192"},
                    {src: cover + "?size=256", type: "image/png", sizes: "256x256"},
                    {src: cover + "?size=384", type: "image/png", sizes: "384x384"},
                    {src: cover + "?size=512", type: "image/png", sizes: "512x512"},
                ]
            });

        }
    }

    setActionHandlers(data) {
        if ('mediaSession' in navigator) {
            for (const [action, handler] of Object.entries(data)) {
                navigator.mediaSession.setActionHandler(action, handler);
            }
        }
    }

    clear() {
        this.pause();
        this.reset();
        this.#abortDownload();

        this.#audioBuffers = {};
        this.#audioSources = {};
        this.#urls = [];
    }

    reset() {
        this.setCurrentTime(0);
        this.setOffset(0);
    }

    #abortDownload() {
        this.#abortController.abort();

        this.#abortController = new AbortController();
        this.#abortSignal = this.#abortController.signal;
    }

    async #processDecodeQueue() {
        if (Object.values(this.#decodingQueue).length) {
            this.#isDecoding = true;

            let url;
            if (this.#waitIndex !== null) {
                url = this.#decodingQueue[this.#waitIndex];
                delete this.#decodingQueue[this.#waitIndex];
            } else {
                const lastKey = Object.keys(this.#decodingQueue).pop();
                url = this.#decodingQueue[lastKey];
                delete this.#decodingQueue[lastKey];
            }
            const bufferIndex = this.#urls.indexOf(url);

            let response = null;
            try {
                if (typeof url === "undefined") throw new Error();

                response = await fetch(url, {
                    signal: this.#abortSignal
                });

                if (!response.ok) throw new Error();

                this.#hadError = false;
            } catch (e) {
                if (!e.toString().includes("AbortError")) {
                    this.#hadError = true;
                    this.#isDecoding = false;

                    this.#removePart(bufferIndex);
                    this.dispatchEvent(new Event("downloadError"));
                } else if (this.#urls.indexOf(url)) {
                    this.#decodingQueue[bufferIndex] = url;

                    this.#processDecodeQueue();
                }
                return;
            }

            try {
                const arrayBuffer = await response.arrayBuffer();
                this.#audioBuffers[bufferIndex] = await audioContext.decodeAudioData(arrayBuffer);

                this.#hadError = false;
            } catch (e) {
                this.#hadError = true;
                this.#isDecoding = false;

                this.#removePart(bufferIndex);

                this.dispatchEvent(new Event("downloadError"));
                return;
            }

            if (typeof this.#decodingCallbacks[bufferIndex] === "function") {
                this.#decodingCallbacks[bufferIndex]();
                delete this.#decodingCallbacks[bufferIndex];
            }

            if (bufferIndex === this.#waitIndex) {
                this.#clearTimeouts();

                this.dispatchEvent(new CustomEvent("processed", {detail: {index: this.#waitIndex, set: true}}));
                this.#waitIndex = null;
            } else {
                this.dispatchEvent(new CustomEvent("processed", {detail: {index: bufferIndex, set: !this.#nextTrackIndex}}));
                this.#isDecoding = false;
            }

            this.#processDecodeQueue();
        }
    }

    setMediaSessionPosition(value) {
        this.setCurrentTime(value);
        this.#setPositionState();
    }

    #clearTimeouts() {
        for (const [index, timeout] of Object.entries(this.#startTimeouts)) {
            clearTimeout(Number(timeout));
            delete this.#startTimeouts[index];
        }
    }

    #killSource(source) {
        source.onended = () => {
        };
        source.stop(source.when);

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
            navigator.mediaSession.setPositionState({
                duration: this.#length,
                playbackRate: 1,
                position: this.#audioTag.currentTime
            });
        }
    }
}
