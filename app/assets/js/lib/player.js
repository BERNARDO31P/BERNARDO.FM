if ("audioSession" in navigator) {
    navigator.audioSession.type = "playback";
}

const audioContext = new (window.AudioContext || window.webkitAudioContext)({
    latencyHint: "playback",
    sampleRate: 44100
});

/*
 * Some third-party fetch wrappers create their own detached Promise when
 * an AbortController aborts a request. Suppress only our intentional abort.
 */
window.addEventListener("unhandledrejection", event => {
    if (event.reason?.name === "AbortError" && event.reason?.message === "Audio download aborted") {
        event.preventDefault();
    }
});

class MultiTrackPlayer extends EventTarget {
    static #audioTagOwner = null;
    static #carrierPauseTimeout = null;
    static #volumeCarrier = null;

    static #wakeLock = null;
    static #wakeLockPromise = null;

    #endTolerance = 0;

    #waitIndex = null;

    #abortController = new AbortController();
    #abortSignal = this.#abortController.signal;

    #audioTag = new Audio();
    #initialPlay = true;
    #stopped = true;
    #isDecoding = false;
    #playing = false;
    #buffering = false;
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

    constructor(length, endTolerance = 0) {
        super();

        this.#gainNode = audioContext.createGain();
        this.#gainNode.connect(audioContext.destination);

        this.#length = length;
        this.#endTolerance = Math.max(0, Number(endTolerance) || 0);

        this.#audioTag = document.getElementById("MultiTrackPlayer");

        if (!this.#audioTag) {
            this.#audioTag = new Audio(this.#createSilence(60));

            this.#audioTag.controls = false;
            this.#audioTag.id = "MultiTrackPlayer";

            document.body.append(this.#audioTag);
        }

        this.#audioTag.preload = "auto";
        this.#audioTag.loop = true;
        if (MultiTrackPlayer.#audioTagOwner === null) {
            this.#audioTag.volume = this.#volume;
        }

        // There is only one silent carrier for every track. Keep one listener
        // for exposed volume/mute changes, including browser-originated ones.
        // System mixer volume and OS ducking are not exposed by this event.
        if (MultiTrackPlayer.#volumeCarrier !== this.#audioTag) {
            MultiTrackPlayer.#volumeCarrier = this.#audioTag;
            this.#audioTag.addEventListener("volumechange", () => {
                MultiTrackPlayer.#audioTagOwner?.#syncCarrierVolume();
            });
        }

        this.#playEventHandler = this.#playEvent.bind(this);
        this.#pauseEventHandler = this.#pauseEvent.bind(this);

        document.addEventListener("visibilitychange", () => {
            if (document.hidden || this.#stopped) {
                return;
            }

            /*
             * Screen wake locks are automatically released by the browser when the
             * application is left. Request the lock again if playback is still active
             * when the user returns.
             */
            if (
                MultiTrackPlayer.#audioTagOwner === this
                && this.#playing
                && !this.#audioTag.paused
            ) {
                void this.#requestWakeLock();
            }

            // The page listener refreshes the current UI exactly once.
            // Do not synthesize an audio timeupdate here.
        });
    }

    /*
     * Function: requestWakeLock()
     * Author: Bernardo de Oliveira
     * 
     * Prevents the screen from switching off automatically during playback.
     * Only one wake lock exists across all players.
     */
    async #requestWakeLock() {
        if (!("wakeLock" in navigator) || document.hidden) {
            return;
        }

        if (
            MultiTrackPlayer.#wakeLock !== null
            && !MultiTrackPlayer.#wakeLock.released
        ) {
            return;
        }

        /*
         * Prevent multiple simultaneous requests.
         */
        if (MultiTrackPlayer.#wakeLockPromise !== null) {
            await MultiTrackPlayer.#wakeLockPromise;
            return;
        }

        MultiTrackPlayer.#wakeLockPromise = navigator.wakeLock.request("screen")
            .then(async lock => {
                const owner = MultiTrackPlayer.#audioTagOwner;

                /*
                 * If playback has already stopped or been paused while the request
                 * was pending, release the acquired lock immediately.
                 */
                if (
                    owner === null
                    || owner.#stopped
                    || owner.#audioTag.paused
                ) {
                    await lock.release();
                    return;
                }

                MultiTrackPlayer.#wakeLock = lock;

                /*
                 * The browser may release a wake lock on its own, for example when
                 * the application moves into the background.
                 */
                lock.addEventListener("release", () => {
                    if (MultiTrackPlayer.#wakeLock === lock) {
                        MultiTrackPlayer.#wakeLock = null;
                    }
                }, {once: true});
            })
            .catch(error => {
                /*
                 * NotAllowedError may occur if the browser currently disallows
                 * a screen wake lock.
                 */
                if (error?.name !== "NotAllowedError") {
                    console.error(error);
                }
            })
            .finally(() => {
                MultiTrackPlayer.#wakeLockPromise = null;
            });

        await MultiTrackPlayer.#wakeLockPromise;
    }

    /*
     * Function: releaseWakeLock()
     * Author: Bernardo de Oliveira
     * 
     * Releases the active screen wake lock.
     */
    async #releaseWakeLock() {
        const lock = MultiTrackPlayer.#wakeLock;

        MultiTrackPlayer.#wakeLock = null;

        if (lock === null || lock.released) {
            return;
        }

        try {
            await lock.release();
        } catch (error) {
            console.error(error);
        }
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
         * Delay the release so the next track can take over the media carrier
         * directly.
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
        const currentPartIndex = this.getPartByStartTime(0)[2];

        /*
         * Index 0 is not necessarily the beginning of the song. If the
         * initial segment has already been pruned, the current index remains
         * invalid until another segment has been loaded.
         */
        this.#currentTrackIndex = currentPartIndex !== null && isFinite(currentPartIndex)
            ? currentPartIndex
            : NaN;

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
            this.#dispatchTimeUpdate();
        }
    }

    #releaseForHandoff() {
        this.#lifecycleGeneration++;

        this.#pauseClock();

        this.#hadError = false;
        this.#stopped = true;
        this.#initialPlay = true;
        this.#playing = false;
        this.#buffering = false;
        this.#nextTrackIndex = false;
        this.#startTime = 0;

        this.#clearTimeouts();
        this.discardPendingDownloads();

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
         * Intentionally do not pause the audio element. The next song takes
         * over the running media carrier.
         */
    }

    refreshTimeUpdate() {
        this.#dispatchTimeUpdate();
    }

    addTimeUpdate() {
        if (this.#timeUpdateHandler === null) {
            this.#timeUpdateHandler = this.#dispatchTimeUpdate.bind(this);
            this.#audioTag.addEventListener("timeupdate", this.#timeUpdateHandler);
        }
    }

    removeTimeUpdate() {
        if (this.#timeUpdateHandler !== null) {
            this.#audioTag.removeEventListener("timeupdate", this.#timeUpdateHandler);
            this.#timeUpdateHandler = null;
        }
    }

    setCurrentIndex(index) {
        if (index === null || !isFinite(index)) {
            return;
        }

        this.#currentTrackIndex = index;
    }

    /*
      * Function: dispatchTimeUpdate()
      * Author: Bernardo de Oliveira
      * 
      * Notifies listeners of the current playback position.
      */
    #dispatchTimeUpdate() {
        this.dispatchEvent(new CustomEvent("timeupdate", {
            detail: {
                value: this.getCurrentTime(),
                empty: this.#currentTrackIndex !== 0
                    && !Object.keys(this.#getDecodingQueue()).length
                    && !Object.keys(this.#getStartTimeouts()).length
            }
        }));
    }

    async addTrack(url, callback, priority = false) {
        try {
            /*
             * addTrack() is also used for preloading. Preloading must not
             * change the playback state.
             */
            this.#nextTrackIndex = false;

            /*
             * Direct user actions discard all outdated downloads. Only audio
             * buffers that have already been fully decoded are retained.
             */
            if (priority) {
                this.discardPendingDownloads();
            }

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

            /*
             * This segment has already been fully processed.
             */
            if (
                typeof this.#indexes[index] === "undefined"
                || !this.#indexes[index]["decoding"]
            ) {
                return;
            }

            /*
             * Normal background buffering is still queued. Allow the current
             * download to complete.
             */
            if (this.isDecoding()) {
                return;
            }

            if (priority) {
                this.#waitIndex = index;
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
            .map(index => Number(index))
            .filter(index => Number.isFinite(index));

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

        return [
            part["from"],
            part["till"],
            this.#currentTrackIndex
        ];
    }

    getPartByTime(time) {
        for (const [index, part] of Object.entries(this.#indexes)) {
            if (!part || part["till"] === null) {
                continue;
            }

            if (part["from"] <= time && part["till"] > time) {
                return [
                    part["from"],
                    part["till"],
                    Number(index)
                ];
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
                return [
                    part["from"],
                    part["till"],
                    Number(index)
                ];
            }
        }

        return [null, null, null];
    }

    /*
     * Function: getBufferedEnd()
     * Author: Bernardo de Oliveira
     * Arguments:
     *  time: (Integer) Position at which the buffer is checked
     * 
     * Returns the end of the continuously buffered audio range.
     */
    getBufferedEnd(time = this.getCurrentTime()) {
        time = Number(time);

        if (!isFinite(time)) {
            return 0;
        }

        const parts = Object.values(this.#indexes)
            .filter(part => {
                return part
                    && part["buffer"] !== null
                    && part["from"] !== null
                    && part["till"] !== null
                    && isFinite(part["from"])
                    && isFinite(part["till"]);
            })
            .sort((a, b) => a["from"] - b["from"]);

        let end = time;

        for (const part of parts) {
            if (part["till"] <= end) {
                continue;
            }

            /*
             * Allow minor rounding differences between the decoded audio duration
             * and the server segment boundaries.
             */
            if (part["from"] > end + 0.1) {
                break;
            }

            end = Math.max(end, part["till"]);
        }

        return Math.min(end, this.#length);
    }

    /*
     * Function: getBufferedAhead()
     * Author: Bernardo de Oliveira
     * Arguments:
     *  time: (Integer) Current playback position
     * 
     * Returns the number of continuously buffered seconds ahead.
     */
    getBufferedAhead(time = this.getCurrentTime()) {
        time = Number(time);

        if (!isFinite(time)) {
            return 0;
        }

        return Math.max(0, this.getBufferedEnd(time) - time);
    }

    /*
     * Function: getNextBufferedStart()
     * Author: Bernardo de Oliveira
     * Arguments:
     *  time: (Integer) Position at which the search starts
     * 
     * Finds the next buffered segment after a gap.
     */
    getNextBufferedStart(time) {
        time = Number(time);

        if (!isFinite(time)) {
            return null;
        }

        let next = null;

        for (const part of Object.values(this.#indexes)) {
            if (
                !part
                || part["buffer"] === null
                || part["from"] === null
                || !isFinite(part["from"])
                || part["from"] <= time
            ) {
                continue;
            }

            if (next === null || part["from"] < next) {
                next = part["from"];
            }
        }

        return next;
    }

    /*
      * Function: pruneBuffer()
      * Author: Bernardo de Oliveira
      * Arguments:
      *  keepSeconds: (Integer) Seconds to retain behind playback
      *  keepStartSeconds: (Integer) Seconds to retain at the beginning
      * 
      * Removes old audio buffers to limit memory consumption.
      */
    pruneBuffer(keepSeconds = 15, keepStartSeconds = 0) {
        const cutoff = this.getCurrentTime() - keepSeconds;

        if (cutoff <= 0) return;

        for (const [index, part] of Object.entries(this.#indexes)) {
            if (
                !part
                || Number(index) === this.#currentTrackIndex
                || part["decoding"]
                || part["timeout"] !== null
                || part["till"] === null
            ) {
                continue;
            }

            /*
             * When repeating the same song, do not prune the preloaded
             * beginning of the song from the buffer.
             */
            const from = Number(part["from"]);

            if (
                keepStartSeconds > 0
                && isFinite(from)
                && from < keepStartSeconds
            ) {
                continue;
            }

            if (part["till"] > cutoff) continue;

            if (part["source"]) {
                this.#killSource(part["source"]);
            }

            delete this.#indexes[index];
        }
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
         * Prevent a delayed pause event from the previous song from
         * interrupting the new song.
         */
        this.#cancelCarrierPause();

        if (MultiTrackPlayer.#audioTagOwner !== null && MultiTrackPlayer.#audioTagOwner !== this) {
            MultiTrackPlayer.#audioTagOwner.#releaseForHandoff();
        }

        MultiTrackPlayer.#audioTagOwner = this;
        this.#syncCarrierVolume();

        const lifecycleGeneration = ++this.#lifecycleGeneration;

        this.#initialPlay = true;
        this.#stopped = false;
        this.#hadError = false;

        this.#clearTimeouts();

        this.#audioTag.addEventListener("play", this.#playEventHandler);
        this.#audioTag.addEventListener("pause", this.#pauseEventHandler);

        if (this.#audioTag.paused) {
            try {
                await this.#audioTag.play();
            } catch (error) {
                if (error?.name !== "AbortError") {
                    throw error;
                }
            }

            if (this.#stopped || lifecycleGeneration !== this.#lifecycleGeneration) {
                return false;
            }
        }

        /*
         * Active playback should keep the screen awake.
         */
        void this.#requestWakeLock();

        if (audioContext.state !== "running") {
            await audioContext.resume();

            if (this.#stopped || lifecycleGeneration !== this.#lifecycleGeneration) {
                return false;
            }
        }

        if (this.#stopped || lifecycleGeneration !== this.#lifecycleGeneration) {
            return false;
        }

        if ("mediaSession" in navigator) {
            navigator.mediaSession.playbackState = "playing";
        }

        this.#setPositionState();
        this.addTimeUpdate();

        if (Object.keys(this.#getDecodingQueue()).length && !this.isDecoding()) {
            void this.#processDecodeQueue().catch(error => {
                if (!this.#isAbortError(error)) {
                    console.error(error);
                }
            });
        }

        return true;
    }

    playNext(index = undefined, startTime = 0) {
        if (typeof index === "undefined") {
            index = this.#currentTrackIndex;
        }

        if (
            typeof this.#indexes[index] === "undefined"
            || typeof this.#indexes[index]["buffer"] === "undefined"
            || this.#indexes[index]["buffer"] === null
        ) {
            return;
        }

        if (MultiTrackPlayer.#audioTagOwner !== this) return;

        if (
            !this.#stopped
            && !(startTime === 0 && this.isPlaying() && this.#currentTrackIndex === index)
            && (this.#currentTrackIndex !== index || this.#initialPlay)
        ) {
            const lifecycleGeneration = this.#lifecycleGeneration;
            const wasPlaying = this.#playing;

            this.#playing = true;
            this.#buffering = false;

            void this.#requestWakeLock();

            if (!wasPlaying) {
                this.#startClock();
            }

            if (this.#audioTag.paused) {
                void this.#audioTag.play().catch(error => {
                    if (error?.name !== "AbortError") {
                        console.error(error);
                    }
                });
            }

            if (audioContext.state !== "running") {
                void audioContext.resume().catch(error => {
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
                if (lifecycleGeneration !== this.#lifecycleGeneration) return;
                if (this.#stopped || MultiTrackPlayer.#audioTagOwner !== this) return;
                if (typeof this.#indexes[index] === "undefined") return;

                clearTimeout(this.#indexes[index]["timeout"]);
                this.#indexes[index]["timeout"] = null;

                /*
                 * If another segment has already been scheduled, its start timeout
                 * will take over playback.
                 */
                const hasTimeouts = Object.keys(this.#getStartTimeouts()).length;

                if (hasTimeouts) return;

                const till = Number(this.#indexes[index]["till"]);

                /*
                 * If the next segment is already playable, start it immediately
                 * without interruption.
                 */
                if (isFinite(till)) {
                    const nextPart = this.getPartByTime(till);
                    const nextPartIndex = nextPart[2];

                    if (
                        nextPartIndex !== null
                        && nextPartIndex !== index
                        && this.partIsPlayable(nextPartIndex)
                    ) {
                        this.#clockTime = till;
                        this.#clockStartedAt = performance.now();

                        this.#initialPlay = false;
                        this.#nextTrackIndex = true;

                        this.setOffset(Math.max(0, till - Number(nextPart[0])), nextPartIndex);
                        this.playNext(nextPartIndex, 0);

                        return;
                    }
                }

                /*
                 * If there is no further segment and only the defined end tolerance
                 * remains, consider the song finished. This avoids leaving 1–2 seconds
                 * unplayed while deliberately suppressing further downloads.
                 */
                if (
                    isFinite(till)
                    && this.#length - till <= this.#endTolerance
                ) {
                    this.finish();
                    return;
                }

                const hasDecodingQueue = Object.keys(this.#getDecodingQueue()).length;

                if (hasDecodingQueue) {
                    if (!this.isDecoding()) {
                        void this.#processDecodeQueue().catch(error => {
                            if (!this.#isAbortError(error)) {
                                console.error(error);
                            }
                        });
                    }

                    if (isFinite(till)) {
                        this.#clockTime = parseInt(till);
                        this.#clockStartedAt = null;
                    }

                    this.setOffset(this.getPartLength(index), index);

                    this.#playing = false;
                    this.#buffering = true;
                    this.#nextTrackIndex = false;

                    /*
                     * Playback was not paused by the user. It is waiting for the
                     * next segment to finish downloading.
                     */
                    this.dispatchEvent(new CustomEvent("pause", {
                        detail: {
                            buffering: true
                        }
                    }));

                    return;
                }

                if (isFinite(till)) {
                    this.#clockTime = till;
                    this.#clockStartedAt = null;
                }

                this.pause();
            };

            this.#indexes[index]["timeout"] = setTimeout(() => {
                if (lifecycleGeneration !== this.#lifecycleGeneration) return;
                if (this.#stopped || MultiTrackPlayer.#audioTagOwner !== this) return;
                if (typeof this.#indexes[index] === "undefined") return;

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
        const wasPlaying = this.#playing;
        this.#buffering = false;

        /*
         * Invalidate any ongoing initialize() calls.
         */
        this.#lifecycleGeneration++;

        if (wasPlaying) {
            this.#pauseClock();
        }

        this.#playing = false;
        this.#nextTrackIndex = false;

        /*
         * A new user action must be able to cancel the previous state
         * entirely, including an active seek or download.
         */
        this.#clearTimeouts();
        this.discardPendingDownloads();

        if (!bypass) {
            this.#audioTag.removeEventListener("play", this.#playEventHandler);
            this.#audioTag.removeEventListener("pause", this.#pauseEventHandler);

            this.removeTimeUpdate();
        }

        if (MultiTrackPlayer.#audioTagOwner === this && !this.#audioTag.paused) {
            this.#audioTag.pause();
        }

        if (MultiTrackPlayer.#audioTagOwner === this) {
            void this.#releaseWakeLock();
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

        if (wasPlaying) {
            this.setOffset(this.getCurrentPartTime(), this.#currentTrackIndex);
        }

        Object.entries(this.#getAudioSources()).forEach(([index, source]) => {
            this.#killSource(source);

            if (typeof this.#indexes[index] !== "undefined") {
                this.#indexes[index]["source"] = null;
            }
        });

        if (!this.#stopped && wasPlaying) {
            this.dispatchEvent(new Event("pause"));
        }
    }

    /*
     * Function: finish()
     * Author: Bernardo de Oliveira
     * 
     * Finishes the song and discards downloads that are no longer needed.
     */
    finish() {
        this.#buffering = false;
        this.#clockTime = this.#length;
        this.#clockStartedAt = null;

        this.#playing = false;
        this.#nextTrackIndex = false;

        this.#clearTimeouts();
        this.discardPendingDownloads();

        this.dispatchEvent(new Event("end"));

        /*
         * First give the next song a chance to take over playback. If no
         * further playback starts, release the wake lock.
         */
        setTimeout(() => {
            if (
                MultiTrackPlayer.#audioTagOwner === this
                && !this.#playing
            ) {
                void this.#releaseWakeLock();
            }
        }, 0);
    }

    stop() {
        this.#lifecycleGeneration++;
        this.#pauseClock();

        const ownsAudioTag = MultiTrackPlayer.#audioTagOwner === this;

        this.#hadError = false;
        this.#stopped = true;
        this.#initialPlay = true;
        this.#playing = false;
        this.#buffering = false;
        this.#nextTrackIndex = false;
        this.#startTime = 0;

        this.#clearTimeouts();
        this.discardPendingDownloads();

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

            void this.#releaseWakeLock();

            /*
             * If another player is initialized immediately afterward, that
             * player takes over the media carrier.
             */
            this.#scheduleCarrierPause();
        }

        this.#resetState(false);
    }

    /*
      * Function: playEvent()
      * Author: Bernardo de Oliveira
      * 
      * Responds only to a play event from the currently active media carrier.
      */
    #playEvent() {
        if (
            MultiTrackPlayer.#audioTagOwner !== this
            || this.#stopped
            || this.#audioTag.paused
        ) {
            return;
        }

        void this.#requestWakeLock();

        if (!this.isPlaying()) {
            this.#initialPlay = true;
            this.playNext();

            if (this.#playing && "mediaSession" in navigator) {
                navigator.mediaSession.playbackState = "playing";
            }

            this.#setPositionState();
        }
    }

    /*
     * Function: pauseEvent()
     * Author: Bernardo de Oliveira
     * 
     * Ignores stale pause events that arrive after playback has already
     * restarted during rapid seeking.
     */
    #pauseEvent() {
        if (
            MultiTrackPlayer.#audioTagOwner !== this
            || this.#stopped
            || !this.#audioTag.paused
        ) {
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

        if (
            typeof this.#indexes[index] !== "undefined"
            && typeof this.#indexes[index]["buffer"] !== "undefined"
            && this.#indexes[index]["buffer"] !== null
            && typeof this.#indexes[this.#currentTrackIndex] !== "undefined"
            && typeof this.#indexes[this.#currentTrackIndex]["buffer"] !== "undefined"
            && this.#indexes[this.#currentTrackIndex]["buffer"] !== null
        ) {
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
        if (
            typeof this.#indexes[partIndex] !== "undefined"
            && typeof this.#indexes[partIndex]["buffer"] !== "undefined"
            && this.#indexes[partIndex]["buffer"] !== null
        ) {
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

    #syncCarrierVolume() {
        if (MultiTrackPlayer.#audioTagOwner !== this) return;

        // volumechange is the only browser-exposed signal for changes to
        // the carrier's volume/mute properties. The Android system mixer,
        // Media Session and audio-focus ducking do not expose their gain here.
        const carrierVolume = Number(this.#audioTag.volume);
        if (!Number.isFinite(carrierVolume)) return;

        this.#volume = Math.max(0, Math.min(1, carrierVolume));
        this.#gainNode.gain.value = this.#audioTag.muted ? 0 : this.#volume;

        // A change originating outside the volume slider should also update
        // the visible slider. This does not write the user's volume cookie.
        this.dispatchEvent(new CustomEvent("volumechange", {
            detail: {
                volume: this.#volume,
                muted: this.#audioTag.muted
            }
        }));
    }

    setVolume(volume) {
        this.#volume = Math.max(0, Math.min(1, Number(volume) || 0));
        this.#gainNode.gain.value = this.#audioTag.muted ? 0 : this.#volume;
        this.#audioTag.volume = this.#volume;
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

    isBuffering() {
        return this.#buffering;
    }

    // Called only for an explicit user-requested start which must wait for
    // the first audio segment (never for background preloading).
    requestBuffering() {
        this.#buffering = true;
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
                title: title,
                artist: artist,
                artwork: [
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

        this.#clearTimeouts();
        this.discardPendingDownloads();

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

            void this.#releaseWakeLock();

            this.#scheduleCarrierPause();
        }

        this.#resetState(false);
        this.#indexes = [];
    }

    /*
      * Function: reset()
      * Author: Bernardo de Oliveira
      * Arguments:
      *  dispatch: (Boolean) Whether to emit a timeupdate event
      * 
      * Resets playback state to the beginning of the song.
      */
    reset(dispatch = true) {
        if (this.isPlaying()) return;

        this.#resetState(dispatch);
    }

    #abortDownload() {
        const abortController = this.#abortController;

        this.#decodeGeneration++;
        this.#isDecoding = false;

        /*
         * Create the new controller before aborting the previous worker.
         */
        this.#abortController = new AbortController();
        this.#abortSignal = this.#abortController.signal;

        if (!abortController.signal.aborted) {
            abortController.abort(new DOMException("Audio download aborted", "AbortError"));
        }
    }

    /*
     * Function: discardPendingDownloads()
     * Author: Bernardo de Oliveira
     * 
     * Cancels the current download and removes all segments not yet fully
     * processed. Already decoded audio buffers are retained.
     */
    discardPendingDownloads() {
        this.#abortDownload();

        this.#waitIndex = null;

        for (const [index, part] of Object.entries(this.#indexes)) {
            if (!part || !part["decoding"]) {
                continue;
            }

            delete this.#indexes[index];
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
         * The download and decoding lifecycle is independent of the playback
         * lifecycle. Inactive players may preload songs as well.
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

                if (
                    this.#waitIndex !== null
                    && Object.prototype.hasOwnProperty.call(decodingQueue, this.#waitIndex)
                ) {
                    /*
                     * Explicit user actions take priority.
                     */
                    queueIndex = String(this.#waitIndex);
                } else {
                    /*
                     * Process normal buffering requests in chronological order.
                     */
                    queueIndex = queueIndexes[0];
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

                let response;
                let arrayBuffer;
                let decodedBuffer;

                /*
                 * Download the audio segment.
                 */
                try {
                    response = await fetch(url, {
                        signal: signal
                    });

                    if (generation !== this.#decodeGeneration) {
                        return;
                    }

                    if (!response.ok) {
                        throw new Error("Unable to download audio track");
                    }

                    arrayBuffer = await response.arrayBuffer();

                    if (generation !== this.#decodeGeneration) {
                        return;
                    }

                } catch (error) {
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

                    this.dispatchEvent(new CustomEvent("downloadError", {
                        detail: {
                            "type": "download",
                            "status": response?.status ?? 0,
                            "url": url
                        }
                    }));

                    return;
                }

                /*
                 * Decode the audio segment.
                 */
                try {
                    decodedBuffer = await audioContext.decodeAudioData(arrayBuffer);

                    if (generation !== this.#decodeGeneration) {
                        return;
                    }

                } catch (error) {
                    if (generation !== this.#decodeGeneration) {
                        return;
                    }

                    this.#hadError = false;

                    if (bufferIndex === this.#waitIndex) {
                        this.#waitIndex = null;
                    }

                    this.#removePart(bufferIndex);

                    this.dispatchEvent(new CustomEvent("downloadError", {
                        detail: {
                            "type": "decode",
                            "status": response.status,
                            "url": url
                        }
                    }));

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

                } else if (
                    this.#currentTrackIndex !== bufferIndex
                    && this.getCurrentPart()[2] !== bufferIndex
                ) {
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

                /*
                 * After pruning, the stored index may no longer exist. As soon as
                 * the matching segment has been loaded again, adopt it.
                 */
                if (
                    !isFinite(this.#currentTrackIndex)
                    || typeof this.#indexes[this.#currentTrackIndex] === "undefined"
                ) {
                    const currentPart = this.getPartByTime(this.getCurrentTime());

                    if (currentPart[2] !== null) {
                        this.#currentTrackIndex = currentPart[2];
                    }
                }

                if (bufferIndex === this.#waitIndex) {
                    /*
                     * Release priority before dispatching the event so event handlers
                     * can immediately start another segment.
                     */
                    this.#waitIndex = null;

                    this.#clearTimeouts();

                    this.dispatchEvent(new CustomEvent("processed", {
                        detail: {
                            set: true
                        }
                    }));

                    if (generation !== this.#decodeGeneration) {
                        return;
                    }
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
             * An old worker must never reset the state of a newer worker.
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
     * Function: createSilence()
     * Author: ktcy (https://gist.github.com/ktcy/1e981cfee7a309beebb33cdab1e29715)
     * Arguments:
     *  seconds: (Integer) Duration of the placeholder in seconds
     * 
     * Creates a silent placeholder for the Media Session API.
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