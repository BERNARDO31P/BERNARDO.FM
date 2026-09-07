const audioContext = new (window.AudioContext || window.webkitAudioContext)({
    latencyHint: "playback", sampleRate: 44100
});

/*
 * Some third-party fetch wrappers create their own detached Promise when
 * an AbortController aborts a request. Suppress only our intentional abort.
 */
window.addEventListener("unhandledrejection", (event) => {
    if (event.reason?.name === "AbortError" && event.reason?.message === "Audio download aborted") {
        event.preventDefault();
    }
});

class MultiTrackPlayer extends EventTarget {
    static #audioTagOwner = null;
    static #carrierPauseTimeout = null;

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

    #clockTime = 0;
    #clockStartedAt = null;

    #timeUpdateHandler = null;
    #playEventHandler = null;
    #pauseEventHandler = null;

    #decodeGeneration = 0;
    #lifecycleGeneration = 0;

    constructor(length) {
        super();

        this.#gainNode = audioContext.createGain();
        this.#gainNode.connect(audioContext.destination);

        this.#length = length + 1;

        this.#audioTag = document.getElementById("MultiTrackPlayer");
        if (!this.#audioTag) {
            this.#audioTag = new Audio(this.#createSilence(60));

            this.#audioTag.controls = true;
            this.#audioTag.id = "MultiTrackPlayer";

            document.body.append(this.#audioTag);
        }

        /*
         * The HTML audio element is only a permanent background media
         * carrier. It must never be replaced between songs.
         */
        this.#audioTag.preload = "auto";
        this.#audioTag.loop = true;
        this.#audioTag.volume = this.#volume;

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

    #getClockTime() {
        let time = this.#clockTime;

        if (this.#clockStartedAt !== null) {
            time += (performance.now() - this.#clockStartedAt) / 1000;
        }

        return Math.max(0, Math.min(this.#length, time));
    }

    #startClock() {
        if (this.#clockStartedAt === null) {
            this.#clockStartedAt = performance.now();
        }
    }

    #pauseClock() {
        if (this.#clockStartedAt === null) {
            return;
        }

        this.#clockTime = this.#getClockTime();
        this.#clockStartedAt = null;
    }

    #cancelCarrierPause() {
        if (MultiTrackPlayer.#carrierPauseTimeout !== null) {
            clearTimeout(MultiTrackPlayer.#carrierPauseTimeout);
            MultiTrackPlayer.#carrierPauseTimeout = null;
        }
    }

    #scheduleCarrierPause() {
        this.#cancelCarrierPause();

        const audioTag = this.#audioTag;

        /*
         * Delaying this until the current task ends allows an automatic
         * next-song initialize() to take ownership first.
         */
        MultiTrackPlayer.#carrierPauseTimeout = setTimeout(() => {
            MultiTrackPlayer.#carrierPauseTimeout = null;

            if (MultiTrackPlayer.#audioTagOwner !== null) {
                return;
            }

            if (!audioTag.paused) {
                audioTag.pause();
            }
        }, 0);
    }

    #resetState(dispatch = true) {
        let currentPartIndex = this.getPartByStartTime(0)[2];

        if (currentPartIndex === null || !isFinite(currentPartIndex)) {
            currentPartIndex = 0;
        }

        this.#currentTrackIndex = currentPartIndex;
        this.#startTime = 0;
        this.#clockTime = 0;
        this.#clockStartedAt = null;

        for (const [index, part] of Object.entries(this.#indexes)) {
            if (!part) {
                continue;
            }

            this.#indexes[index]["offset"] = 0;
            this.#indexes[index]["timeout"] = null;
            this.#indexes[index]["source"] = null;
        }

        this.#setPositionState();

        if (dispatch) {
            this.#dispatchTimeUpdate(true);
        }
    }

    #releaseForHandoff() {
        this.#lifecycleGeneration++;

        this.#pauseClock();

        this.#hadError = false;
        this.#stopped = true;
        this.#initialPlay = true;
        this.#playing = false;
        this.#nextTrackIndex = false;
        this.#waitIndex = null;
        this.#startTime = 0;

        this.#clearTimeouts();
        this.#abortDownload();

        this.#audioTag.removeEventListener("play", this.#playEventHandler);
        this.#audioTag.removeEventListener("pause", this.#pauseEventHandler);
        this.removeTimeUpdate();

        Object.entries(this.#getAudioSources()).forEach(([index, source]) => {
            this.#killSource(source);

            if (typeof this.#indexes[index] !== "undefined") {
                this.#indexes[index]["source"] = null;
            }
        });

        this.#resetState(false);

        if (MultiTrackPlayer.#audioTagOwner === this) {
            MultiTrackPlayer.#audioTagOwner = null;
        }

        /*
         * Deliberately do NOT pause #audioTag here.
         * The next song takes over the already-running carrier.
         */
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
            /*
             * addTrack() is also the preload API.
             * It must not change playback lifecycle state.
             */
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
                    /*
                     * Latest requested timeline part gets immediate priority.
                     * The interrupted part remains decoding=true.
                     */
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
        /*
         * If stop() was called immediately before this during an automatic
         * song change, prevent its deferred carrier pause from firing.
         */
        this.#cancelCarrierPause();

        if (MultiTrackPlayer.#audioTagOwner !== null && MultiTrackPlayer.#audioTagOwner !== this) {
            MultiTrackPlayer.#audioTagOwner.#releaseForHandoff();
        }

        MultiTrackPlayer.#audioTagOwner = this;

        const lifecycleGeneration = ++this.#lifecycleGeneration;

        this.#initialPlay = true;
        this.#stopped = false;
        this.#hadError = false;

        this.#clearTimeouts();

        this.#audioTag.addEventListener("play", this.#playEventHandler);
        this.#audioTag.addEventListener("pause", this.#pauseEventHandler);

        /*
         * For continuous playback this normally only runs for the first
         * song. During song-to-song handoff the carrier remains running.
         */
        if (this.#audioTag.paused) {
            try {
                await this.#audioTag.play();
            } catch (error) {
                if (error?.name !== "AbortError") {
                    throw error;
                }
            }

            if (this.#stopped || lifecycleGeneration !== this.#lifecycleGeneration) {
                return;
            }
        }

        if (audioContext.state !== "running") {
            await audioContext.resume();

            if (this.#stopped || lifecycleGeneration !== this.#lifecycleGeneration) {
                return;
            }
        }

        if (this.#stopped || lifecycleGeneration !== this.#lifecycleGeneration) {
            return;
        }

        if ("mediaSession" in navigator) {
            navigator.mediaSession.playbackState = "playing";
        }

        this.#setPositionState();
        this.addTimeUpdate();

        if (Object.keys(this.#getDecodingQueue()).length && !this.isDecoding()) {
            void this.#processDecodeQueue().catch((error) => {
                if (!this.#isAbortError(error)) {
                    console.error(error);
                }
            });
        }
    }

    playNext(index = 0, startTime = 0) {
        if (index === 0) {
            index = this.#currentTrackIndex;
        }

        if (typeof this.#indexes[index] === "undefined"
            || typeof this.#indexes[index]["buffer"] === "undefined"
            || this.#indexes[index]["buffer"] === null) {

            return;
        }

        if (MultiTrackPlayer.#audioTagOwner !== this) {
            return;
        }

        if (!this.hadError() && !this.#stopped
            && !(startTime === 0 && this.isPlaying())
            && (this.#currentTrackIndex !== index || this.#initialPlay)
            && (this.#waitIndex === null || this.#waitIndex === index || this.hadError())) {

            const wasPlaying = this.#playing;

            this.#playing = true;

            if (!wasPlaying) {
                this.#startClock();
            }

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
                if (this.#stopped || MultiTrackPlayer.#audioTagOwner !== this) {
                    return;
                }

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

                /*
                 * This part has really finished. Keep the logical playback position
                 * exactly at its end so a later retry resumes from the following part.
                 */
                const till = this.#indexes[index]["till"];

                if (till !== null && isFinite(till)) {
                    this.#clockTime = till;
                    this.#clockStartedAt = null;
                }

                this.pause();
            };

            this.#indexes[index]["timeout"] = setTimeout(() => {
                if (this.#stopped || MultiTrackPlayer.#audioTagOwner !== this) {
                    return;
                }

                if (typeof this.#indexes[index] === "undefined") {
                    return;
                }

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

            if (typeof this.#indexes[index] !== "undefined") {
                this.#indexes[index]["source"] = null;
            }
        });
    }

    pause(bypass = false) {
        if (!this.#playing) {
            return;
        }

        this.#pauseClock();

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

        if (MultiTrackPlayer.#audioTagOwner === this && !this.#audioTag.paused) {
            this.#audioTag.pause();
        }

        if (MultiTrackPlayer.#audioTagOwner === this && "mediaSession" in navigator) {
            const duration = Math.max(1, this.#length);
            const position = Math.max(0, Math.min(duration, this.#getClockTime()));

            navigator.mediaSession.playbackState = "paused";
            navigator.mediaSession.setPositionState({
                duration: duration,
                playbackRate: 0.00001,
                position: position
            });
        }

        this.setOffset(this.getCurrentPartTime(), this.#currentTrackIndex);

        Object.entries(this.#getAudioSources()).forEach(([index, source]) => {
            this.#killSource(source);

            if (typeof this.#indexes[index] !== "undefined") {
                this.#indexes[index]["source"] = null;
            }
        });

        if (!this.#stopped) {
            this.dispatchEvent(new Event("pause"));
        }
    }

    stop() {
        this.#lifecycleGeneration++;
        this.#pauseClock();

        const ownsAudioTag = MultiTrackPlayer.#audioTagOwner === this;

        this.#hadError = false;
        this.#stopped = true;
        this.#initialPlay = true;
        this.#playing = false;
        this.#nextTrackIndex = false;
        this.#waitIndex = null;
        this.#startTime = 0;

        this.#clearTimeouts();
        this.#abortDownload();

        this.#audioTag.removeEventListener("play", this.#playEventHandler);
        this.#audioTag.removeEventListener("pause", this.#pauseEventHandler);
        this.removeTimeUpdate();

        Object.entries(this.#getAudioSources()).forEach(([index, source]) => {
            this.#killSource(source);

            if (typeof this.#indexes[index] !== "undefined") {
                this.#indexes[index]["source"] = null;
            }
        });

        if (ownsAudioTag) {
            MultiTrackPlayer.#audioTagOwner = null;

            /*
             * If another player initializes synchronously as part of an
             * automatic next-song transition, it cancels this pause.
             */
            this.#scheduleCarrierPause();
        }

        this.#resetState(false);
    }

    #playEvent() {
        if (MultiTrackPlayer.#audioTagOwner !== this || this.#stopped) {
            return;
        }

        if (!this.isPlaying()) {
            this.#initialPlay = true;

            this.#setPositionState();
            this.playNext();
        }
    }

    #pauseEvent() {
        if (MultiTrackPlayer.#audioTagOwner !== this || this.#stopped) {
            return;
        }

        if (this.isPlaying()) {
            this.pause(true);
        }
    }

    queueTrack(index, startTime = null) {
        if (this.#stopped || MultiTrackPlayer.#audioTagOwner !== this) {
            return false;
        }

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
        return parseInt(String(this.#getClockTime()));
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

        const offset = Number(this.#indexes[index]["offset"]);

        if (!isFinite(offset) || offset < 0) {
            return 0;
        }

        const length = this.getPartLength(index);

        if (length > 0) {
            return Math.min(offset, length);
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
        time = Number(time);

        if (!isFinite(time)) {
            return;
        }

        this.#clockTime = Math.max(0, Math.min(this.#length, time));
        this.#clockStartedAt = this.#playing ? performance.now() : null;

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
        this.#lifecycleGeneration++;

        const ownsAudioTag = MultiTrackPlayer.#audioTagOwner === this;

        this.#pauseClock();
        this.#playing = false;
        this.#nextTrackIndex = false;
        this.#waitIndex = null;

        this.#clearTimeouts();
        this.#abortDownload();

        this.#audioTag.removeEventListener("play", this.#playEventHandler);
        this.#audioTag.removeEventListener("pause", this.#pauseEventHandler);
        this.removeTimeUpdate();

        Object.entries(this.#getAudioSources()).forEach(([index, source]) => {
            this.#killSource(source);

            if (typeof this.#indexes[index] !== "undefined") {
                this.#indexes[index]["source"] = null;
            }
        });

        if (ownsAudioTag) {
            MultiTrackPlayer.#audioTagOwner = null;
            this.#scheduleCarrierPause();
        }

        this.#resetState(false);
        this.#indexes = [];
    }

    reset() {
        if (this.isPlaying()) {
            return;
        }

        this.#resetState(true);
    }

    #abortDownload() {
        const abortController = this.#abortController;

        this.#decodeGeneration++;
        this.#isDecoding = false;

        /*
         * Install the next controller before aborting the current worker.
         */
        this.#abortController = new AbortController();
        this.#abortSignal = this.#abortController.signal;

        if (!abortController.signal.aborted) {
            abortController.abort(new DOMException("Audio download aborted", "AbortError"));
        }
    }

    async #processDecodeQueue() {
        const initialQueue = this.#getDecodingQueue();

        if (!Object.keys(initialQueue).length) {
            this.dispatchEvent(new CustomEvent("processed", {
                detail: {
                    set: true
                }
            }));

            return;
        }

        /*
         * Download/decode lifecycle is independent from playback lifecycle.
         * This allows stopped players to preload tracks.
         */
        const generation = this.#decodeGeneration;
        const signal = this.#abortSignal;

        this.#isDecoding = true;

        try {
            while (generation === this.#decodeGeneration) {
                const decodingQueue = this.#getDecodingQueue();
                const queueIndexes = Object.keys(decodingQueue);

                if (!queueIndexes.length) {
                    break;
                }

                let queueIndex;

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

                if (generation !== this.#decodeGeneration) {
                    return;
                }

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
                     * A changed generation means this fetch was intentionally
                     * superseded. Leave decoding=true so it stays queued.
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

                    this.dispatchEvent(new Event("downloadError"));

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

                if (generation !== this.#decodeGeneration) {
                    return;
                }

                if (typeof this.#indexes[bufferIndex] === "undefined") {
                    continue;
                }

                if (typeof this.#indexes[bufferIndex]["callback"] !== "undefined") {
                    const from = this.#indexes[bufferIndex]["callback"](this.#indexes, bufferIndex);

                    if (generation !== this.#decodeGeneration) {
                        return;
                    }

                    if (typeof this.#indexes[bufferIndex] === "undefined") {
                        return;
                    }

                    this.#indexes[bufferIndex]["from"] = from;
                    this.#indexes[bufferIndex]["till"] = from + this.getPartLength(bufferIndex);

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

                if (generation !== this.#decodeGeneration) {
                    return;
                }

                if (!isFinite(this.#currentTrackIndex)) {
                    this.#currentTrackIndex = this.getPartByStartTime(this.getCurrentTime())[2];
                }

                if (bufferIndex === this.#waitIndex) {
                    this.#clearTimeouts();

                    this.dispatchEvent(new CustomEvent("processed", {
                        detail: {
                            set: true
                        }
                    }));

                    if (generation !== this.#decodeGeneration) {
                        return;
                    }

                    this.#waitIndex = null;
                } else {
                    this.dispatchEvent(new CustomEvent("processed", {
                        detail: {
                            set: !this.#nextTrackIndex
                        }
                    }));

                    if (generation !== this.#decodeGeneration) {
                        return;
                    }
                }
            }
        } catch (error) {
            if (!this.#isAbortError(error, signal)) {
                throw error;
            }
        } finally {
            /*
             * A stale worker must never clear state belonging to the worker
             * that replaced it.
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
     * Erstellt einen Platzhalter für die MediaSession API.
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

        view.setUint32(0, 0x52494646, false);    // Chunk ID "RIFF"
        view.setUint32(4, chunkSize, true);      // File size
        view.setUint32(8, 0x57415645, false);    // Format "WAVE"
        view.setUint32(12, 0x666D7420, false);   // Sub-chunk 1 ID "fmt "
        view.setUint32(16, 16, true);            // Sub-chunk 1 size
        view.setUint16(20, 1, true);             // Audio format
        view.setUint16(22, numChannels, true);   // Number of channels
        view.setUint32(24, sampleRate, true);    // Sample rate
        view.setUint32(28, byteRate, true);      // Byte rate
        view.setUint16(32, blockAlign, true);    // Block align
        view.setUint16(34, bitsPerSample, true); // Bits per sample
        view.setUint32(36, 0x64617461, false);   // Sub-chunk 2 ID "data"
        view.setUint32(40, dataSize, true);      // Sub-chunk 2 size

        for (let offset = 44; offset < byteLength; offset++) {
            view.setUint8(offset, 128);
        }

        const blob = new Blob([view], {type: "audio/wav"});
        return URL.createObjectURL(blob);
    }

    #setPositionState() {
        if ("mediaSession" in navigator && MultiTrackPlayer.#audioTagOwner === this) {
            const duration = Math.max(1, this.#length);
            const position = Math.max(0, Math.min(duration, this.#getClockTime()));

            navigator.mediaSession.setPositionState({
                duration: duration,
                playbackRate: 1,
                position: position
            });
        }
    }
}