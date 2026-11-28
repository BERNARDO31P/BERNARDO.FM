/* Web Worker zum Zeichnen der Monitoring-Graphen. Als klassischen Worker vom selben Ursprung laden. */
let downTimes = [], downValues = [];
let upTimes = [], upValues = [];
let cpuTimes = [], cpuValues = [];
let ramTimes = [], ramValues = [];
let points = {};
let currentSelect = 4;
let betaMode = true;
let settings = null;
let canvases = {};
let controller = null;
let latestRequest = 0;
let hasData = false;
let renderGeneration = 0;
let renderTimer = 0;
let dataRequest = 0;
let renderRevision = 0;
let frameSequence = 0;
const pendingFrames = new Map();
const presentedFrames = new Map();
const GRAPH_SPACING_MS = 16;
const MAX_NETWORK = 12000;
const HITBOX = 10;

function format2(value) {
    const number = Number(value);

    return Number.isFinite(number) ? number.toFixed(2) : "0.00";
}

/*
 * Funktion: safePercent()
 * Autor: Bernardo de Oliveira
 *
 * Begrenzt Prozentwerte auf 0 bis 100.
 */
function safePercent(value) {
    value = Number(value);

    return Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0;
}

function drawGraph(canvas, context, dataArr, timeArr, measurement, canvasID) {
    points[canvasID] = null;

    const canvasWidth = canvas.cssWidth;
    const canvasHeight = canvas.cssHeight;
    const pixelRatio = settings.pixelRatio;

    const bufferWidth = Math.round(canvasWidth * pixelRatio);
    const bufferHeight = Math.round(canvasHeight * pixelRatio);

    if (canvas.width !== bufferWidth || canvas.height !== bufferHeight) {
        canvas.width = bufferWidth;
        canvas.height = bufferHeight;
    }

    /*
     * Alle Zeichenkoordinaten bleiben in CSS-Pixeln.
     * Dadurch stimmen auch die Mauskoordinaten offsetX und offsetY weiterhin.
     */
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

    const GRAPH_HEIGHT = canvasHeight;
    const GRAPH_WIDTH = canvasWidth;

    const GRAPH_TOP = 30;
    const GRAPH_BOTTOM = GRAPH_HEIGHT - (GRAPH_TOP * 2);
    const GRAPH_LEFT = 20;
    const GRAPH_RIGHT = GRAPH_WIDTH - (GRAPH_LEFT * 5);

    const graphRange = GRAPH_BOTTOM - GRAPH_TOP;
    const arrayLen = Math.min(dataArr.length, timeArr.length);

    context.clearRect(0, 0, canvasWidth, canvasHeight);

    if (!arrayLen) {
        return;
    }

    let smallest;
    let largest;

    if (betaMode) {
        /*
         * Beta:
         * Alle Graphen starten bei 0.
         * Alle Graphen haben mindestens 10 als Maximum.
         * Graphen mit Prozentwerten haben mindestens 50 als Maximum.
         */
        smallest = 0;
        largest = 10;

        if (measurement === "%") {
            largest = 50;
        }

        for (let i = 0; i < arrayLen; i++) {
            const value = Number(dataArr[i]);

            if (value > largest) {
                largest = value;
            }
        }
    } else {
        /*
         * Alte Darstellung:
         * Minimum und Maximum werden vollständig aus den Daten bestimmt.
         */
        smallest = Number(dataArr[0]);
        largest = smallest;

        for (let i = 0; i < arrayLen; i++) {
            const value = Number(dataArr[i]);

            if (value > largest) {
                largest = value;
            }

            if (value < smallest) {
                smallest = value;
            }
        }

        if (largest === smallest) {
            largest += 1;
            smallest -= 1;
        }
    }

    const valueRange = largest - smallest;

    context.font = "13px Arial";
    context.textAlign = "left";
    context.textBaseline = "alphabetic";
    context.lineWidth = 1;

    /*if (theme === "light") {
        context.strokeStyle = "#BBB";
        context.fillStyle = "#3f3f3f";
    } else {*/
    context.strokeStyle = "#606060";
    context.fillStyle = "#b9b9b9";
    //}

    /*
     * Raster und Beschriftungen
     */
    const drawHorizontalLine = (y, text) => {
        if (!betaMode) {
            context.beginPath();
            context.moveTo(GRAPH_LEFT, y);
            context.lineTo(GRAPH_RIGHT, y);
            context.stroke();
        }

        context.fillText(text, GRAPH_RIGHT + 15, y);
    };

    drawHorizontalLine(GRAPH_TOP, format2(largest));

    drawHorizontalLine(GRAPH_TOP + graphRange * (1 / 3), format2(smallest + (valueRange * 2 / 3)));

    drawHorizontalLine(GRAPH_TOP + graphRange * (2 / 3), format2(smallest + (valueRange / 3)) + " " + measurement);

    drawHorizontalLine(GRAPH_BOTTOM, format2(smallest));

    const maxClocks = Math.min(7, arrayLen);

    const firstTime = Number(timeArr[0]);
    const lastTime = Number(timeArr[arrayLen - 1]);
    const timeRange = Math.max(1, lastTime - firstTime);

    const getX = timestamp => {
        return GRAPH_LEFT + ((timestamp - firstTime) / timeRange) * (GRAPH_RIGHT - GRAPH_LEFT);
    };

    context.textAlign = "center";
    context.textBaseline = "top";

    for (let i = 0; i < maxClocks; i++) {
        const timestamp = maxClocks === 1 ? firstTime : firstTime + ((timeRange * i) / (maxClocks - 1));

        const x = getX(timestamp);
        const label = formatTimestamp(timestamp).split("\n");

        /*
         * Zeitstempel innerhalb des Canvas halten.
         * Dadurch werden die erste und letzte Beschriftung nicht abgeschnitten.
         */
        const labelWidth = Math.max(context.measureText(label[0]).width, context.measureText(label[1]).width);

        const halfWidth = labelWidth / 2;
        const LABEL_MARGIN = 4;

        const labelX = Math.max(halfWidth + LABEL_MARGIN, Math.min(x, canvasWidth - halfWidth - LABEL_MARGIN));

        context.fillText(label[0], labelX, GRAPH_BOTTOM + 15);
        context.fillText(label[1], labelX, GRAPH_BOTTOM + 29);
    }

    context.textAlign = "left";
    context.textBaseline = "alphabetic";

    /*if (theme === "light") {
        context.fillStyle = "black";
        context.strokeStyle = "black";
    } else {*/
    context.fillStyle = "#d0d0d0";
    context.strokeStyle = "#d0d0d0";
    //}

    const largeScreen = settings.largeScreen;

    context.lineWidth = largeScreen ? 2 : 1;
    context.lineJoin = "round";
    context.lineCap = "round";

    const xs = new Float64Array(arrayLen);
    const ys = new Float64Array(arrayLen);
    for (let index = 0; index < arrayLen; index++) {
        xs[index] = getX(Number(timeArr[index]));
        const normalized = (Number(dataArr[index]) - smallest) / valueRange;
        ys[index] = GRAPH_BOTTOM - (normalized * graphRange);
    }

    // Für die Tooltip-Suche werden immer alle ursprünglichen Messwerte verwendet.
    points[canvasID] = {xs, ys, values: dataArr, times: timeArr, measurement};
    const useCurves = currentSelect <= 60;
    const indices = settings.pixelReduction && !useCurves ? getPixelIndices(xs, ys, pixelRatio) : null;
    drawGraphLine(xs, ys, indices, context, GRAPH_BOTTOM, useCurves);
}

// Optionale rein visuelle Optimierung: Pro physischer Pixelspalte den ersten
// und letzten Messwert sowie Minimum und Maximum in chronologischer Reihenfolge beibehalten.
function getPixelIndices(xs, ys, ratio) {
    if (xs.length < 2) {
        return null;
    }
    if (xs.length <= Math.max(1, (xs[xs.length - 1] - xs[0]) * ratio) * 4) {
        return null;
    }
    const indices = [];
    let start = 0;
    while (start < xs.length) {
        const column = Math.floor(xs[start] * ratio);
        let end = start + 1;
        let min = start;
        let max = start;
        while (end < xs.length && Math.floor(xs[end] * ratio) === column) {
            if (ys[end] < ys[min]) {
                min = end;
            }
            if (ys[end] > ys[max]) {
                max = end;
            }
            end++;
        }
        const ordered = [start, Math.min(min, max), Math.max(min, max), end - 1];
        for (const index of ordered) {
            if (indices[indices.length - 1] !== index) {
                indices.push(index);
            }
        }
        start = end;
    }
    return indices;
}

function drawGraphLine(xs, ys, indices, context, bottom, useCurves) {
    const count = indices ? indices.length : xs.length;
    if (!count) {
        return;
    }
    const indexAt = i => indices ? indices[i] : i;
    const xAt = i => xs[indexAt(i)];
    const drawRange = (start, end) => {
        const first = indexAt(start);
        const last = indexAt(end);
        const path = new Path2D();
        path.moveTo(xs[first], ys[first]);
        for (let i = start + 1; i <= end; i++) {
            const previous = indexAt(i - 1);
            const current = indexAt(i);
            if (useCurves) {
                const middle = (xs[previous] + xs[current]) / 2;
                path.bezierCurveTo(middle, ys[previous], middle, ys[current], xs[current], ys[current]);
            } else {
                path.lineTo(xs[current], ys[current]);
            }
        }
        if (betaMode) {
            const area = new Path2D(path);
            area.lineTo(xs[last], bottom);
            area.lineTo(xs[first], bottom);
            area.closePath();
            context.fill(area);
        }
        context.stroke(path);
    };
    const limit = settings.pathChunkSize;
    if (useCurves || !(limit > 0) || count <= limit || xAt(count - 1) <= xAt(0)) {
        drawRange(0, count - 1);
        return;
    }

    // Die sichtbare Ausgabe in nicht überlappende, an physischen Pixeln ausgerichtete Streifen unterteilen.
    // Zusätzliche Geometrie ausserhalb jedes Streifens zeichnen, damit im sichtbaren Bereich
    // die ursprünglichen Linienverbindungen statt runder Linienenden an Abschnittsgrenzen erhalten bleiben.
    const ratio = settings.pixelRatio;
    const width = context.canvas.width;
    const height = context.canvas.height;
    const padding = Math.ceil(context.lineWidth * ratio / 2) + 2;
    const lowerBound = (target, upper = false) => {
        let left = 0;
        let right = count;
        while (left < right) {
            const middle = Math.floor((left + right) / 2);
            const x = xAt(middle) * ratio;
            if (x < target || (upper && x === target)) {
                left = middle + 1;
            } else {
                right = middle;
            }
        }
        return left;
    };
    const cuts = [0];
    for (let i = Math.max(2, limit); i < count; i += Math.max(2, limit)) {
        const cut = Math.ceil(xAt(i) * ratio);
        if (cut > cuts[cuts.length - 1] && cut < width) {
            cuts.push(cut);
        }
    }
    cuts.push(width);
    for (let i = 1; i < cuts.length; i++) {
        const left = cuts[i - 1];
        const right = cuts[i];
        const start = Math.max(0, lowerBound(left - padding) - 1);
        const end = Math.min(count - 1, lowerBound(right + padding, true));
        if (end < start) {
            continue;
        }
        context.save();
        // Den Ausschnitt in physischen Pixelkoordinaten festlegen, damit auch bei
        // nicht ganzzahliger devicePixelRatio keine teilweise abgedeckten Randpixel entstehen.
        context.setTransform(1, 0, 0, 1, 0, 0);
        context.beginPath();
        context.rect(left, 0, right - left, height);
        context.clip();
        context.setTransform(ratio, 0, 0, ratio, 0, 0);
        drawRange(start, end);
        context.restore();
    }
}

function processCompactSeries(series, type) {
    const result = [];

    let lastValid = 0;

    if (!Array.isArray(series)) {
        return {
            times: [], values: []
        };
    }

    const addPoint = (timestamp, value, order = 0) => {
        timestamp = Number(timestamp);
        value = Number(value);

        if (!Number.isFinite(timestamp) || !Number.isFinite(value)) {
            return;
        }

        if (type === "network") {
            if (value < 0 || value > MAX_NETWORK) {
                value = lastValid;
            } else {
                lastValid = value;
            }
        }

        if (type === "percent") {
            value = safePercent(value);
        }

        result.push({
            time: timestamp, value: value, order: order
        });
    };

    for (const point of series) {
        if (Array.isArray(point)) {
            /*
             * Version 4:
             *
             * [
             *     averageTimestamp,
             *     average,
             *     minTimestamp,
             *     min,
             *     maxTimestamp,
             *     max
             * ]
             */
            if (point.length >= 6) {
                addPoint(point[0], point[1], 1);
                addPoint(point[2], point[3], 0);
                addPoint(point[4], point[5], 2);

                continue;
            }

            /*
             * Version 3:
             *
             * [timestamp, average, min, max]
             *
             * Die genauen Zeitstempel von Minimum und Maximum fehlen hier noch.
             * Trotzdem werden die Extremwerte dargestellt, bis die Datei
             * vom Backend als Version 4 neu aufgebaut wurde.
             */
            if (point.length >= 4) {
                addPoint(point[0], point[2], 0);
                addPoint(point[0], point[1], 1);
                addPoint(point[0], point[3], 2);

                continue;
            }

            /*
             * Version 2:
             *
             * [timestamp, value]
             */
            if (point.length >= 2) {
                addPoint(point[0], point[1]);

                continue;
            }
        }

        if (point && typeof point === "object") {
            addPoint(point.time, point.value);
        }
    }

    /*
     * Minima, Durchschnittswerte und Maxima chronologisch sortieren.
     * Bei identischen Zeitstempeln bleibt die Reihenfolge eindeutig definiert.
     */
    result.sort((a, b) => {
        if (a.time !== b.time) {
            return a.time - b.time;
        }

        return a.order - b.order;
    });

    /*
     * Exakt doppelte Punkte entfernen.
     */
    const filtered = [];

    for (const point of result) {
        const previous = filtered[filtered.length - 1];

        if (previous && previous.time === point.time && previous.value === point.value) {
            continue;
        }

        filtered.push(point);
    }

    return {
        times: filtered.map(point => point.time), values: filtered.map(point => point.value)
    };
}

function processCompactData(data) {
    const down = processCompactSeries(data.series.down, "network");
    const up = processCompactSeries(data.series.up, "network");
    const cpu = processCompactSeries(data.series.cpu, "percent");
    const ram = processCompactSeries(data.series.ram, "percent");

    downTimes = down.times;
    downValues = down.values;

    upTimes = up.times;
    upValues = up.values;

    cpuTimes = cpu.times;
    cpuValues = cpu.values;

    ramTimes = ram.times;
    ramValues = ram.values;
}

function processLegacyData(data) {
    const keys = Object.keys(data);
    const arrayLen = keys.length;

    downTimes = new Array(arrayLen);
    downValues = new Array(arrayLen);

    upTimes = new Array(arrayLen);
    upValues = new Array(arrayLen);

    cpuTimes = new Array(arrayLen);
    cpuValues = new Array(arrayLen);

    ramTimes = new Array(arrayLen);
    ramValues = new Array(arrayLen);

    let lastDown = 0;
    let lastUp = 0;

    for (let i = 0; i < arrayLen; i++) {
        const timestamp = Number(keys[i]);
        const row = data[keys[i]];

        let down = Number(row.network.down);
        let up = Number(row.network.up);

        if (!Number.isFinite(down) || down < 0 || down > MAX_NETWORK) {
            down = lastDown;
        } else {
            lastDown = down;
        }

        if (!Number.isFinite(up) || up < 0 || up > MAX_NETWORK) {
            up = lastUp;
        } else {
            lastUp = up;
        }

        downTimes[i] = timestamp;
        downValues[i] = down;

        upTimes[i] = timestamp;
        upValues[i] = up;

        cpuTimes[i] = timestamp;
        cpuValues[i] = safePercent(row.cpu);

        ramTimes[i] = timestamp;
        ramValues[i] = safePercent(row.ram);

    }
}

function formatTimestamp(timestamp) {
    const date = new Date(timestamp * 1000);

    const hours = ("0" + date.getHours()).slice(-2);
    const minutes = ("0" + date.getMinutes()).slice(-2);

    const day = ("0" + date.getDate()).slice(-2);
    const month = ("0" + (date.getMonth() + 1)).slice(-2);
    const year = date.getFullYear().toString().slice(-2);

    return hours + ":" + minutes + "\n" + day + "." + month + "." + year;
}

function findClosestPoint(graphPoints, x, y, hitbox = HITBOX) {
    if (!graphPoints || !graphPoints.xs.length) {
        return null;
    }
    const {xs, ys, values, times, measurement} = graphPoints;
    const minX = x - hitbox;
    const maxX = x + hitbox;
    let left = 0;
    let right = xs.length;
    while (left < right) {
        const middle = Math.floor((left + right) / 2);
        if (xs[middle] < minX) {
            left = middle + 1;
        } else {
            right = middle;
        }
    }
    let closest = -1;
    let closestDistance = Infinity;
    for (let index = left; index < xs.length && xs[index] <= maxX; index++) {
        const dx = xs[index] - x;
        const dy = ys[index] - y;
        if (Math.abs(dy) > hitbox) {
            continue;
        }
        const distance = dx * dx + dy * dy;
        if (distance < closestDistance) {
            closest = index;
            closestDistance = distance;
        }
    }
    return closest < 0 ? null : {
        coordinates: [xs[closest], ys[closest]], value: values[closest], time: times[closest], measurement
    };
}

function cancelRender() {
    renderGeneration++;
    clearTimeout(renderTimer);
    renderTimer = 0;
}

function redraw() {
    cancelRender();
    if (!hasData || !settings || dataRequest !== latestRequest) {
        return;
    }
    const generation = renderGeneration;
    const revision = renderRevision;
    const request = dataRequest;
    const series = [["download", downValues, downTimes, "Mbit/s"], ["upload", upValues, upTimes, "Mbit/s"], ["cpu", cpuValues, cpuTimes, "%"], ["ram", ramValues, ramTimes, "%"]];
    const drawNext = async index => {
        if (generation !== renderGeneration) {
            return;
        }
        try {
            betaMode = settings.betaMode;
            const [id, values, times, unit] = series[index];
            const entry = canvases[id];
            const size = settings.sizes[id];
            if (entry && size && size.width && size.height) {
                const canvas = {
                    cssWidth: size.width, cssHeight: size.height, get width() {
                        return entry.canvas.width;
                    }, set width(value) {
                        entry.canvas.width = value;
                    }, get height() {
                        return entry.canvas.height;
                    }, set height(value) {
                        entry.canvas.height = value;
                    }
                };
                const drawStart = performance.now();
                drawGraph(canvas, entry.context, values, times, unit, id);
                const drawEnd = performance.now();
                const graphPoints = points[id];
                // Ein unabhängiges, für das Auslesen optimiertes Canvas vermeidet die direkte
                // Darstellung und fordert Software-Rendering an, sofern der Browser dies unterstützt.
                let bitmap;
                if (settings.renderMode === "png") {
                    const blob = await entry.canvas.convertToBlob({type: "image/png"});
                    if (generation !== renderGeneration) {
                        return;
                    }
                    bitmap = await createImageBitmap(blob);
                } else {
                    bitmap = entry.canvas.transferToImageBitmap();
                }
                if (settings.debug) {
                    console.log("[Monitoring]", id, {
                        points: values.length,
                        drawingMs: Math.round(drawEnd - drawStart),
                        bitmapMs: Math.round(performance.now() - drawEnd),
                        width: bitmap.width,
                        height: bitmap.height,
                        pathChunkSize: settings.pathChunkSize,
                        renderMode: settings.renderMode
                    });
                }
                if (generation !== renderGeneration) {
                    bitmap.close();
                    return;
                }
                const frame = ++frameSequence;
                pendingFrames.set(id, {frame, points: graphPoints});
                self.postMessage({
                    type: "frame", id, frame, request, revision, width: size.width, height: size.height, bitmap
                }, [bitmap]);
            }
            // Zwischen den Graphen die Ausführung unterbrechen, damit die Rasterisierung
            // und Bildkomposition nicht gesammelt in einer einzigen Worker-Aufgabe angestossen werden.
            if (index + 1 < series.length) {
                renderTimer = setTimeout(() => drawNext(index + 1), GRAPH_SPACING_MS);
            } else {
                renderTimer = 0;
                if (dataRequest === latestRequest) {
                    self.postMessage({type: "loaded", request, revision});
                }
            }
        } catch (error) {
            if (generation !== renderGeneration) {
                return;
            }
            cancelRender();
            self.postMessage({type: "error", request: latestRequest, message: String(error)});
        }
    };
    renderTimer = setTimeout(() => drawNext(0), 0);
}

async function load(message) {
    latestRequest = message.request;
    cancelRender();
    if (controller) {
        controller.abort();
    }
    const active = new AbortController();
    controller = active;
    settings = message.settings;
    renderRevision = message.revision;
    try {
        const response = await fetch("/system/monitoring/" + message.selectedTime, {
            credentials: "same-origin",
            headers: {"Accept": "application/json", "X-Requested-With": "XMLHttpRequest"},
            signal: active.signal
        });
        if (!response.ok) {
            throw new Error("HTTP " + response.status);
        }
        let data;
        try {
            data = await response.json();
        } catch (error) {
            throw new Error("Expected monitoring JSON; received " + (response.headers.get("content-type") || "unknown content type") + " from " + response.url + ". " + error.message);
        }
        if (active.signal.aborted || message.request !== latestRequest) {
            return;
        }
        if (!data || typeof data !== "object") {
            throw new Error("Invalid monitoring response");
        }
        // Beim Ersetzen des Datensatzes keine asynchrone Unterbrechung zulassen, damit kein neuer Ladevorgang dazwischen ausgeführt wird.
        if (Number(data.version) >= 2 && data.series && typeof data.series === "object") {
            processCompactData(data);
        } else {
            processLegacyData(data);
        }
        currentSelect = message.selectedTime;
        hasData = true;
        dataRequest = message.request;
        redraw();
    } catch (error) {
        if (!active.signal.aborted && message.request === latestRequest) {
            self.postMessage({type: "error", request: message.request, message: String(error)});
        }
    } finally {
        if (controller === active) {
            controller = null;
        }
    }
}

self.onmessage = event => {
    const message = event.data;
    switch (message.type) {
        case "init":
            for (const id of message.ids) {
                const canvas = new OffscreenCanvas(1, 1);
                const context = canvas.getContext("2d", {willReadFrequently: true});
                if (!context) {
                    throw new Error("Cannot create detached 2D rendering context.");
                }
                canvases[id] = {canvas, context};
            }
            break;
        case "load":
            load(message);
            break;
        case "redraw":
            settings = message.settings;
            renderRevision = message.revision;
            redraw();
            break;
        case "presented": {
            const pending = pendingFrames.get(message.id);
            if (pending?.frame === message.frame) {
                presentedFrames.set(message.id, pending);
                pendingFrames.delete(message.id);
            }
            break;
        }
        case "discard": {
            if (pendingFrames.get(message.id)?.frame === message.frame) {
                pendingFrames.delete(message.id);
            }
            break;
        }
        case "tooltip": {
            const displayed = presentedFrames.get(message.id);
            const point = displayed?.frame === message.frame ? findClosestPoint(displayed.points, message.x, message.y, message.hitbox) : null;
            self.postMessage({type: "tooltip", sequence: message.sequence, point});
            break;
        }
    }
};
