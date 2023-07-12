const audioContext = new (window.AudioContext || window.webkitAudioContext)();

class MultiTrackPlayer extends EventTarget {
    #waitIndex = -1;

    #audioTag = new Audio();

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

    #offset = 0;
    #currentOffset = 0;

    #playing = false;

    constructor(length) {
        super();

        this.#gainNode = audioContext.createGain();
        this.#gainNode.connect(audioContext.destination);
        this.#gainNode.gain.value = this.#volume;

        this.#audioTag = new Audio(this.#createSilence(length));

        this.#audioTag.addEventListener("pause", () => {
            if (this.isPlaying()) this.pause();
        });

        this.#audioTag.addEventListener("play", () => {
            if (!this.isPlaying()) this.playNext(this.#currentTrackIndex, 0);
        });

        document.body.append(this.#audioTag);

        audioContext.suspend();
    }

    async #processDecodeQueue() {
        if (this.#decodingQueue.length) {
            this.#isDecoding = true;
            const url = this.#decodingQueue.pop();
            const bufferIndex = this.#urls.indexOf(url);
            const response = await fetch(url);
            const arrayBuffer = await response.arrayBuffer();
            this.#audioBuffers[bufferIndex] = await audioContext.decodeAudioData(arrayBuffer);

            if (typeof this.#decodingCallbacks[bufferIndex] === "function") {
                this.#decodingCallbacks[bufferIndex]();
                delete this.#decodingCallbacks[bufferIndex];
            }

            if (bufferIndex === this.#waitIndex && !this.#playing) {
                let processedEvent = new CustomEvent("processed", {detail: {index: this.#waitIndex}});
                this.dispatchEvent(processedEvent);
                this.#waitIndex = -1;
            } else {
                await this.#processDecodeQueue();
            }
        }
        this.#isDecoding = false;
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
            this.#audioTag.currentTime = when;
            source.when = when;

            source.onended = () => {
                delete this.#startTimeouts[index];
                this.#currentOffset = 0;

                if (!Object.keys(this.#startTimeouts).length) {
                    this.dispatchEvent(new Event("end"));
                }
            }

            this.#startTimeouts[index] = setTimeout(() => {
                if (this.#audioTag.paused) {
                    this.#audioTag.play();
                }

                this.#playing = true;

                this.#previousTrackIndex = this.#currentTrackIndex;
                this.#currentTrackIndex = index;

                this.#startTime = when;
                this.dispatchEvent(new Event("play"));
            }, startTime * 1000);
        }
    }

    pause() {
        this.#currentTrackIndex = this.#previousTrackIndex;

        this.#clearTimeouts();
        this.setOffset(this.getCurrentPartTime());

        if (!this.#audioTag.paused) {
            this.#audioTag.pause();
        }

        this.#playing = false;

        this.#audioSources.forEach((source) => {
            this.#killSource(source);
        });

        audioContext.suspend();
    }

    queueTrack(index, startTime = null) {
        if (typeof this.#audioBuffers[index] !== "undefined"
            && this.#audioBuffers[index] !== null) {
            if (startTime === null) startTime = (this.#audioBuffers[this.#currentTrackIndex].duration - this.#offset) - this.getStartTime();

            this.setOffset(0);
            this.playNext(index, startTime);
        }
    }

    getStartTime() {
        return audioContext.currentTime - this.#startTime;
    }

    getCurrentPartTime() {
        return audioContext.currentTime - this.#startTime + this.#currentOffset;
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
        this.#currentOffset = this.#offset;
        this.#offset = (offset >= 0) ? offset : 0;
    }

    isPlaying() {
        return this.#playing;
    }

    getDuration() {
        return this.#audioTag.duration;
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
}
