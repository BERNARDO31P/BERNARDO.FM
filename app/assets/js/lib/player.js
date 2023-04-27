const audioContext = new (window.AudioContext || window.webkitAudioContext)();

class MultiTrackPlayer extends EventTarget {
    #waitIndex = 0;

    #volume = 1;
    #gainNode = null;

    #urls = [];
    #audioBuffers = [];
    #audioSources = [];

    #isDecoding = false;
    #decodingQueue = [];
    #decodingCallbacks = [];

    #currentTrackIndex = 0;
    #previousTrackIndex = 0;

    #startTime = 0;
    #startTimeouts = {};

    #offset = null;

    constructor() {
        super();

        this.#gainNode = audioContext.createGain();
        this.#gainNode.connect(audioContext.destination);
        this.#gainNode.gain.value = this.#volume;
    }

    async #processDecodeQueue() {
        if (this.#decodingQueue.length) {
            this.#isDecoding = true;
            const url = this.#decodingQueue.pop();
            const bufferIndex = this.#urls.indexOf(url);
            const response = await fetch(url);
            const arrayBuffer = await response.arrayBuffer();
            this.#audioBuffers[bufferIndex] = await audioContext.decodeAudioData(arrayBuffer);

            this.#decodingCallbacks[bufferIndex]();

            if (bufferIndex === this.#waitIndex) {
                this.dispatchEvent(new Event("processed"));
                this.#waitIndex = 0;
            }

            delete this.#decodingCallbacks[bufferIndex];
            await this.#processDecodeQueue();
        } else {
            this.#isDecoding = false;
        }
    }

    async addTrack(url, callback) {
        let index = this.#urls.push(url) - 1;
        this.#audioBuffers[index] = null
        this.#decodingQueue.push(url);
        this.#decodingCallbacks[index] = callback;

        if (!this.#isDecoding) {
            await this.#processDecodeQueue();
        } else {
            this.#waitIndex = index;
        }
        return this.#isDecoding;
    }

    playNext(index = 0, startTime = 0) {
        if (typeof this.#audioBuffers[index] !== "undefined") {
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

                if (!Object.keys(this.#startTimeouts).length) {
                    this.dispatchEvent(new Event("end"));
                }
            }

            this.#startTimeouts[index] = setTimeout(() => {
                this.#previousTrackIndex = this.#currentTrackIndex;
                this.#currentTrackIndex = index;

                this.#startTime = when;
                this.dispatchEvent(new Event("play"));
            }, startTime * 1000);
        }
    }

    #killSource(source) {
        source.onended = () => {};
        source.stop(source.when);

        try {
            source.disconnect(this.#gainNode);
        } catch (ignored) {}
    }

    pause() {
        this.#clearTimeouts();

        audioContext.suspend().then(() => {
            this.setOffset(this.getCurrentPartTime());

            this.#audioSources.forEach((source) => {
                this.#killSource(source);
            });
        });

        this.#currentTrackIndex = this.#previousTrackIndex;
    }

    queueTrack(index, startTime = null) {
        if (typeof this.#audioBuffers[index] !== "undefined"
            && this.#audioBuffers[index] !== null) {
            if (startTime === null) startTime = (this.#audioBuffers[this.#currentTrackIndex].duration - this.#offset) - this.getCurrentPartTime();

            this.#offset = 0;

            this.playNext(index, startTime);
        }
    }

    getCurrentPartTime() {
        return audioContext.currentTime - this.#startTime;
    }

    totalTracks() {
        return this.#audioBuffers.length;
    }

    getPartLength(partIndex) {
        if (typeof this.#audioBuffers[partIndex] !== "undefined"
            && this.#audioBuffers[partIndex] !== null) {
            return this.#audioBuffers[partIndex].duration;
        }
        return 0;
    }

    setVolume(volume) {
        this.#volume = volume;
        this.#gainNode.gain.value = volume;
    }

    setOffset(offset) {
        this.#offset = (offset >= 0) ? offset : 0;
    }

    isPlaying() {
        const state = audioContext.state;
        return state === "running";
    }

    #clearTimeouts() {
        for (const [index, timeout] of Object.entries(this.#startTimeouts)) {
            clearTimeout(Number(timeout));
            delete this.#startTimeouts[index];
        }
    }
}
