if (typeof window["monitoring"] !== "undefined") throw new Error("Dieses Skript wurde bereits geladen.");

let monitoringRequest = 0;

let downTimes = [], downValues = [];
let upTimes = [], upValues = [];
let cpuTimes = [], cpuValues = [];
let ramTimes = [], ramValues = [];

let canvasDown, canvasUp, canvasCpu, canvasRam;
let currentSelect = 4;
let points = {};

let ctxDown, ctxUp, ctxCpu, ctxRam;
let tooltip;

let initialScrollDone = false;

const HITBOX = 10;
const TOUCH_HITBOX = 16;
const MAX_NETWORK = 12000;

window["monitoring"] = () => {
    canvasDown = document.getElementById("download");
    canvasUp = document.getElementById("upload");
    canvasCpu = document.getElementById("cpu");
    canvasRam = document.getElementById("ram");

    ctxDown = canvasDown.getContext("2d");
    ctxUp = canvasUp.getContext("2d");
    ctxCpu = canvasCpu.getContext("2d");
    ctxRam = canvasRam.getContext("2d");

    tooltip = document.getElementById("tooltip");

    setLoading(true);
    getData();

    startBackgroundProcesses();
    initDropdown();

    [canvasDown, canvasUp, canvasCpu, canvasRam].forEach(canvas => {
        /*
         * Maus bewegt das Tooltip laufend.
         */
        canvas.addEventListener("pointermove", event => {
            if (event.pointerType === "mouse") {
                showTooltip(canvas, event);
            }
        });

        /*
         * Klick oder Touch zeigt das Tooltip.
         * Pointer Events verhindern doppelte Touch/Click Behandlung.
         */
        canvas.addEventListener("pointerdown", event => {
            showTooltip(canvas, event);
        });

        /*
         * Nur bei einer Maus automatisch ausblenden.
         * Touch und Pen lassen das Tooltip sichtbar.
         */
        canvas.addEventListener("pointerleave", event => {
            if (event.pointerType === "mouse") {
                tooltip.style.display = "none";
            }
        });

        canvas.closest(".fullWidth").addEventListener("scroll", () => {
            tooltip.style.display = "none";
        }, {passive: true});
    });

    /*
     * Auf Touch Geräten bleibt das Tooltip nach dem Antippen sichtbar.
     * Ein Tap ausserhalb der Graphen schliesst es wieder.
     */
    document.addEventListener("pointerdown", event => {
        if (
            event.pointerType !== "mouse"
            && !event.target.closest("canvas")
            && !event.target.closest("#tooltip")
        ) {
            tooltip.style.display = "none";
        }
    });
};

/*
 * Funktion: initDropdown()
 * Autor: Bernardo de Oliveira
 *
 * Initialisiert die Zeit Auswahl
 */
function initDropdown() {
    const dropdown = document.getElementById("time");

    if (!dropdown || dropdown.dataset.initialized) return;

    dropdown.dataset.initialized = "1";

    const selected = dropdown.querySelector(".dropdown-selected");
    const list = dropdown.querySelector(".dropdown-list");
    const input = dropdown.querySelector("input");

    selected.addEventListener("click", () => {
        dropdown.classList.toggle("open");
    });

    list.querySelectorAll("div").forEach(option => {
        option.addEventListener("click", () => {
            selected.textContent = "Time: " + option.textContent;
            input.value = option.dataset.value;

            list.querySelectorAll("div").forEach(element => element.classList.remove("active"));

            option.classList.add("active");
            dropdown.classList.remove("open");

            setLoading(true);
            getData();
        });
    });

    document.addEventListener("click", event => {
        if (!dropdown.contains(event.target)) dropdown.classList.remove("open");
    });
}

/*
 * Funktion: format2()
 * Autor: Bernardo de Oliveira
 *
 * Formatiert einen Wert mit zwei Dezimalstellen
 */
function format2(value) {
    const number = Number(value);

    return Number.isFinite(number) ? number.toFixed(2) : "0.00";
}

/*
 * Funktion: safePercent()
 * Autor: Bernardo de Oliveira
 *
 * Begrenzt Prozentwerte auf 0 bis 100
 */
function safePercent(value) {
    value = Number(value);

    return Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0;
}

/*
 * Funktion: setLoading()
 * Autor: Bernardo de Oliveira
 *
 * Zeigt oder versteckt den Graph Loader
 */
function setLoading(state) {
    document.querySelectorAll(".graph-loader").forEach(loader => {
        loader.classList.toggle("show", state);
    });
}

/*
 * Funktion: scrollToEnd()
 * Autor: Bernardo de Oliveira
 *
 * Scrollt alle Graphen an das Ende
 */
function scrollToEnd() {
    [canvasDown, canvasUp, canvasCpu, canvasRam].forEach(canvas => {
        const container = canvas.closest(".fullWidth");

        container.scrollLeft = container.scrollWidth;
    });
}

/*
 * Funktion: startBackgroundProcesses()
 * Autor: Bernardo de Oliveira
 *
 * Startet den Hintergrund Refresh
 */
function startBackgroundProcesses() {
    clearInterval(backgroundProcesses[0] ?? 0);
    clearInterval(backgroundProcesses[1] ?? 0);

    backgroundProcesses[0] = setInterval(getData, Math.max((currentSelect / 100), 2) * 800);
}

/*
 * Funktion: getVisibleDotIndices()
 * Autor: Bernardo de Oliveira
 *
 * Reduziert nur die sichtbaren Punkte des Graphen
 * Minima und Maxima bleiben erhalten damit Peaks anklickbar bleiben
 */
function getVisibleDotIndices(dataArr, maxDots) {
    const length = dataArr.length;

    if (!length) return [];

    if (length <= maxDots) {
        return Array.from({length}, (_, index) => index);
    }

    if (maxDots <= 2) {
        return [0, length - 1];
    }

    const indices = new Set([0, length - 1]);
    const bucketCount = Math.max(1, Math.floor((maxDots - 2) / 2));
    const bucketSize = Math.max(1, (length - 2) / bucketCount);

    for (let bucket = 0; bucket < bucketCount; bucket++) {
        const start = Math.max(1, Math.floor(1 + bucket * bucketSize));
        const end = Math.min(length - 1, Math.ceil(1 + (bucket + 1) * bucketSize));

        if (start >= end) continue;

        let minIndex = start;
        let maxIndex = start;

        for (let index = start + 1; index < end; index++) {
            if (dataArr[index] < dataArr[minIndex]) minIndex = index;
            if (dataArr[index] > dataArr[maxIndex]) maxIndex = index;
        }

        indices.add(minIndex);
        indices.add(maxIndex);
    }

    return Array.from(indices).sort((a, b) => a - b);
}

/*
 * Funktion: drawGraph()
 * Autor: Bernardo de Oliveira
 * Argumente:
 *  canvas: (Objekt) Das Canvas
 *  context: (Objekt) Der Canvas Context
 *  dataArr: (Array) Die Messwerte
 *  timeArr: (Array) Die Timestamps
 *  measurement: (String) Die Masseinheit
 *  canvasID: (String) Die Canvas ID
 *
 * Zeichnet einen Graphen
 */
function drawGraph(canvas, context, dataArr, timeArr, measurement, canvasID) {
    points[canvasID] = [];

    const canvasWidth = canvas.clientWidth;
    const canvasHeight = canvas.clientHeight;
    const pixelRatio = Math.max(1, window.devicePixelRatio || 1);

    const bufferWidth = Math.round(canvasWidth * pixelRatio);
    const bufferHeight = Math.round(canvasHeight * pixelRatio);

    if (canvas.width !== bufferWidth || canvas.height !== bufferHeight) {
        canvas.width = bufferWidth;
        canvas.height = bufferHeight;
    }

    /*
     * Alle Zeichenkoordinaten bleiben in CSS Pixeln.
     * Dadurch stimmen auch mouse offsetX/offsetY weiterhin.
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

    if (!arrayLen) return;

    let largest = Number(dataArr[0]);
    let smallest = Number(dataArr[0]);

    for (let i = 1; i < arrayLen; i++) {
        const value = Number(dataArr[i]);

        if (value > largest) largest = value;
        if (value < smallest) smallest = value;
    }

    if (largest === smallest) {
        largest += 1;
        smallest -= 1;
    }

    const valueRange = largest - smallest || 1;

    context.font = "13px Arial";

    if (theme === "light") {
        context.strokeStyle = "#BBB";
        context.fillStyle = "#3f3f3f";
    } else {
        context.strokeStyle = "#606060";
        context.fillStyle = "#b9b9b9";
    }

    /*
     * Achsen
     */
    context.beginPath();
    context.moveTo(GRAPH_LEFT, GRAPH_BOTTOM);
    context.lineTo(GRAPH_RIGHT, GRAPH_BOTTOM);
    context.lineTo(GRAPH_RIGHT, GRAPH_TOP);
    context.stroke();

    /*
     * Raster und Beschriftungen
     */
    const drawLine = (y, text) => {
        context.beginPath();
        context.moveTo(GRAPH_LEFT, y);
        context.lineTo(GRAPH_RIGHT, y);
        context.fillText(text, GRAPH_RIGHT + 15, y);
        context.stroke();
    };

    drawLine(GRAPH_TOP, format2(largest));
    drawLine(GRAPH_TOP + graphRange * (1 / 3), format2(smallest + (valueRange * 2 / 3)));
    drawLine(GRAPH_TOP + graphRange * (2 / 3), format2(smallest + (valueRange / 3)) + " " + measurement);
    drawLine(GRAPH_BOTTOM, format2(smallest));

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
        const timestamp = maxClocks === 1
            ? firstTime
            : firstTime + ((timeRange * i) / (maxClocks - 1));

        const x = getX(timestamp);
        const label = formatTimestamp(timestamp).split("\n");

        /*
         * Timestamp innerhalb des Canvas halten.
         * Dadurch werden die erste und letzte Beschriftung nicht abgeschnitten.
         */
        const labelWidth = Math.max(
            context.measureText(label[0]).width,
            context.measureText(label[1]).width
        );

        const halfWidth = labelWidth / 2;
        const LABEL_MARGIN = 4;

        const labelX = Math.max(
            halfWidth + LABEL_MARGIN,
            Math.min(
                x,
                canvasWidth - halfWidth - LABEL_MARGIN
            )
        );

        context.fillText(label[0], labelX, GRAPH_BOTTOM + 15);
        context.fillText(label[1], labelX, GRAPH_BOTTOM + 29);
    }

    context.textAlign = "left";
    context.textBaseline = "alphabetic";

    if (theme === "light") {
        context.fillStyle = "black";
        context.strokeStyle = "black";
    } else {
        context.fillStyle = "#d0d0d0";
        context.strokeStyle = "#d0d0d0";
    }

    const largeScreen = getWidth() > 1000;

    context.lineWidth = largeScreen ? 2 : 1;
    context.lineJoin = "round";
    context.lineCap = "round";

    const getPoint = index => {
        const x = getX(Number(timeArr[index]));
        const normalized = (Number(dataArr[index]) - smallest) / valueRange;
        const y = GRAPH_BOTTOM - (normalized * graphRange);

        return {x, y};
    };

    /*
     * Die vollständige Backend Auflösung wird für die Linie verwendet.
     * Es findet hier keine zweite Datenkomprimierung mehr statt.
     */
    const graphPoints = new Array(arrayLen);

    for (let index = 0; index < arrayLen; index++) {
        const point = getPoint(index);

        graphPoints[index] = point;

        points[canvasID].push({
            coordinates: [point.x, point.y],
            value: dataArr[index],
            measurement: measurement,
            time: timeArr[index]
        });
    }

    /*
     * Kurze Zeiträume werden weich gezeichnet.
     * Bei langen Zeiträumen bleiben die echten linearen Übergänge erhalten,
     * damit Peaks und Trends nicht künstlich verändert werden.
     */
    const useCurves = currentSelect <= 60;

    context.beginPath();
    context.moveTo(graphPoints[0].x, graphPoints[0].y);

    for (let i = 1; i < graphPoints.length; i++) {
        const previous = graphPoints[i - 1];
        const current = graphPoints[i];

        if (useCurves) {
            const middleX = (previous.x + current.x) / 2;

            context.bezierCurveTo(
                middleX,
                previous.y,
                middleX,
                current.y,
                current.x,
                current.y
            );
        } else {
            context.lineTo(current.x, current.y);
        }
    }

    context.stroke();
}

/*
 * Funktion: processCompactSeries()
 * Autor: Bernardo de Oliveira
 *
 * Verarbeitet kompakte Monitoring Daten.
 * Durchschnittswerte bilden den normalen Verlauf.
 * Minimum und Maximum jedes Buckets bleiben zwingend erhalten,
 * damit Peaks bei längeren Zeiträumen nicht verloren gehen.
 */
function processCompactSeries(series, type) {
    const result = [];

    let lastValid = 0;

    if (!Array.isArray(series)) {
        return {
            times: [],
            values: []
        };
    }

    const addPoint = (timestamp, value, order = 0) => {
        timestamp = Number(timestamp);
        value = Number(value);

        if (!Number.isFinite(timestamp) || !Number.isFinite(value)) return;

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
            time: timestamp,
            value: value,
            order: order
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
             * Der genaue Timestamp von Min/Max fehlt hier noch.
             * Trotzdem werden die Peaks dargestellt, bis die Datei
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
     * Minima, Durchschnitt und Maxima chronologisch sortieren.
     * Bei identischem Timestamp bleibt die Reihenfolge stabil definiert.
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

        if (
            previous
            && previous.time === point.time
            && previous.value === point.value
        ) {
            continue;
        }

        filtered.push(point);
    }

    return {
        times: filtered.map(point => point.time),
        values: filtered.map(point => point.value)
    };
}

/*
 * Funktion: processCompactData()
 * Autor: Bernardo de Oliveira
 *
 * Verarbeitet das kompakte Monitoring Format
 */
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

/*
 * Funktion: processLegacyData()
 * Autor: Bernardo de Oliveira
 *
 * Unterstützt weiterhin das alte Monitoring Format
 */
async function processLegacyData(data) {
    const keys = Object.keys(data);
    const arrayLen = keys.length;

    const CHUNK_SIZE = 50000;

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

        if (i > 0 && i % CHUNK_SIZE === 0) {
            await new Promise(resolve => setTimeout(resolve, 0));
        }
    }
}

/*
 * Funktion: processDataAsync()
 * Autor: Bernardo de Oliveira
 *
 * Erkennt und verarbeitet das neue oder alte Monitoring Format
 */
async function processDataAsync(data) {
    if (!data || typeof data !== "object") return;

    if (
        Number(data.version) >= 2
        && data.series
        && typeof data.series === "object"
    ) {
        processCompactData(data);
        return;
    }

    await processLegacyData(data);
}

/*
 * Funktion: getData()
 * Autor: Bernardo de Oliveira
 *
 * Holt die Monitoring Daten und zeichnet die Graphen
 * Verhindert, dass ältere Requests neuere Daten überschreiben
 */
async function getData() {
    const dropdown = document.getElementById("time");
    const input = dropdown.querySelector("input");
    const newValue = parseInt(input.value, 10);

    if (isNaN(newValue)) return;

    const lastTime = currentSelect;
    currentSelect = newValue;

    if (lastTime !== newValue) {
        startBackgroundProcesses();
    }

    const request = ++monitoringRequest;
    const selectedTime = currentSelect;

    const data = await httpGetJSON("/system/monitoring/" + selectedTime);

    if (request !== monitoringRequest || selectedTime !== currentSelect) return;

    if (!data) {
        setLoading(false);
        return;
    }

    await processDataAsync(data);

    if (request !== monitoringRequest || selectedTime !== currentSelect) return;

    requestAnimationFrame(() => {
        if (request !== monitoringRequest || selectedTime !== currentSelect) return;

        redraw();

        if (!initialScrollDone) {
            requestAnimationFrame(scrollToEnd);
            initialScrollDone = true;
        }

        setLoading(false);
    });
}

/*
 * Funktion: formatTimestamp()
 * Autor: Bernardo de Oliveira
 *
 * Formatiert einen Unix Timestamp
 */
function formatTimestamp(timestamp) {
    const date = new Date(timestamp * 1000);

    const hours = ("0" + date.getHours()).slice(-2);
    const minutes = ("0" + date.getMinutes()).slice(-2);

    const day = ("0" + date.getDate()).slice(-2);
    const month = ("0" + (date.getMonth() + 1)).slice(-2);
    const year = date.getFullYear().toString().slice(-2);

    return hours + ":" + minutes + "\n" + day + "." + month + "." + year;
}

/*
 * Funktion: redraw()
 * Autor: Bernardo de Oliveira
 *
 * Zeichnet alle Monitoring Graphen neu
 */
function redraw() {
    drawGraph(canvasDown, ctxDown, downValues, downTimes, "Mbit/s", canvasDown.id);
    drawGraph(canvasUp, ctxUp, upValues, upTimes, "Mbit/s", canvasUp.id);
    drawGraph(canvasCpu, ctxCpu, cpuValues, cpuTimes, "%", canvasCpu.id);
    drawGraph(canvasRam, ctxRam, ramValues, ramTimes, "%", canvasRam.id);
}

/*
 * Funktion: findClosestPoint()
 * Autor: Bernardo de Oliveira
 * Argumente:
 *  graphPoints: (Array) Die verfügbaren Graph Punkte
 *  x: (Number) Die horizontale Pointer Position
 *  y: (Number) Die vertikale Pointer Position
 *  hitbox: (Number) Die erlaubte Distanz zum Graph Punkt
 *
 * Sucht den räumlich nächsten Graph Punkt
 * Berücksichtigt X und Y damit eng beieinanderliegende Peaks erkannt werden
 */
function findClosestPoint(graphPoints, x, y, hitbox = HITBOX) {
    if (!graphPoints.length) return null;

    const minX = x - hitbox;
    const maxX = x + hitbox;

    let left = 0;
    let right = graphPoints.length;

    /*
     * Ersten Punkt innerhalb des horizontalen Suchbereichs finden
     */
    while (left < right) {
        const middle = Math.floor((left + right) / 2);

        if (graphPoints[middle].coordinates[0] < minX) {
            left = middle + 1;
        } else {
            right = middle;
        }
    }

    let closest = null;
    let closestDistance = Infinity;

    /*
     * Alle Punkte im horizontalen Hitbox Bereich vergleichen
     * Dadurch gewinnt bei gleichem X der Punkt welcher auch vertikal
     * tatsächlich unter dem Pointer liegt
     */
    for (let index = left; index < graphPoints.length; index++) {
        const point = graphPoints[index];
        const pointX = point.coordinates[0];
        const pointY = point.coordinates[1];

        if (pointX > maxX) break;

        const distanceX = pointX - x;
        const distanceY = pointY - y;

        if (Math.abs(distanceY) > hitbox) continue;

        const distance = (distanceX * distanceX) + (distanceY * distanceY);

        if (distance < closestDistance) {
            closest = point;
            closestDistance = distance;
        }
    }

    return closest;
}

/*
 * Funktion: showTooltip()
 * Autor: Bernardo de Oliveira
 * Argumente:
 *  object: (Objekt) Das Canvas, welches den Event ausgelöst hat
 *  event: (Event) Das Pointer Event
 *
 * Zeigt das Tooltip des räumlich nächstgelegenen Graph Punktes an
 * Touch und Pen verwenden eine grössere Hitbox
 * Das Tooltip bleibt immer vollständig im sichtbaren Bereich
 */
function showTooltip(object, event) {
    const graphPoints = points[object.id];

    if (!graphPoints || !graphPoints.length) return;

    const canvasRect = object.getBoundingClientRect();

    const pointerX = event.clientX - canvasRect.left;
    const pointerY = event.clientY - canvasRect.top;

    const isMouse = event.pointerType === "mouse" || !event.pointerType;
    const hitbox = isMouse ? HITBOX : TOUCH_HITBOX;

    const point = findClosestPoint(
        graphPoints,
        pointerX,
        pointerY,
        hitbox
    );

    if (point === null) {
        if (isMouse) {
            tooltip.style.display = "none";
        }

        return;
    }

    tooltip.innerHTML = format2(point.value)
        + " "
        + point.measurement
        + "<br/>"
        + formatTimestamp(point.time);

    const GAP = 10;
    const VIEWPORT_MARGIN = 8;

    /*
     * Tooltip zuerst am Ursprung seines absoluten
     * Koordinatensystems anzeigen.
     */
    tooltip.style.left = "0px";
    tooltip.style.top = "0px";
    tooltip.style.display = "block";

    /*
     * Tatsächliche Position von left: 0 / top: 0 messen.
     * Daraus wird die gewünschte Viewport Position berechnet.
     */
    let tooltipRect = tooltip.getBoundingClientRect();

    let left = event.clientX + GAP - tooltipRect.left;
    let top = event.clientY + GAP - tooltipRect.top;

    tooltip.style.left = left + "px";
    tooltip.style.top = top + "px";

    /*
     * Nach dem Positionieren nochmals messen und exakt auf
     * 10px rechts/unterhalb des Pointers korrigieren.
     */
    tooltipRect = tooltip.getBoundingClientRect();

    left += event.clientX + GAP - tooltipRect.left;
    top += event.clientY + GAP - tooltipRect.top;

    tooltip.style.left = left + "px";
    tooltip.style.top = top + "px";

    /*
     * Sichtbaren Viewport bestimmen.
     */
    const viewport = window.visualViewport;

    const viewportLeft = viewport ? viewport.offsetLeft : 0;
    const viewportTop = viewport ? viewport.offsetTop : 0;
    const viewportRight = viewport ? viewport.offsetLeft + viewport.width : window.innerWidth;
    const viewportBottom = viewport ? viewport.offsetTop + viewport.height : window.innerHeight;

    /*
     * Nur wenn nötig verschieben.
     * Das Tooltip wird nicht künstlich auf die andere Seite gespiegelt,
     * sondern lediglich vollständig in den Viewport geschoben.
     */
    tooltipRect = tooltip.getBoundingClientRect();

    if (tooltipRect.right > viewportRight - VIEWPORT_MARGIN) {
        left -= tooltipRect.right - (viewportRight - VIEWPORT_MARGIN);
    }

    if (tooltipRect.left < viewportLeft + VIEWPORT_MARGIN) {
        left += viewportLeft + VIEWPORT_MARGIN - tooltipRect.left;
    }

    if (tooltipRect.bottom > viewportBottom - VIEWPORT_MARGIN) {
        top -= tooltipRect.bottom - (viewportBottom - VIEWPORT_MARGIN);
    }

    if (tooltipRect.top < viewportTop + VIEWPORT_MARGIN) {
        top += viewportTop + VIEWPORT_MARGIN - tooltipRect.top;
    }

    tooltip.style.left = left + "px";
    tooltip.style.top = top + "px";
}

let resizeTimer;

window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(redraw, 150);
});