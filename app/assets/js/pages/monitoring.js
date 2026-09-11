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

const HITBOX = 6;
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

    canvasDown.onmousemove
        = canvasUp.onmousemove
        = canvasCpu.onmousemove
        = canvasRam.onmousemove
        = canvasDown.onclick
        = canvasUp.onclick
        = canvasCpu.onclick
        = canvasRam.onclick = function (event) {
        showTooltip(this, event);
    };

    canvasDown.onmouseout
        = canvasUp.onmouseout
        = canvasCpu.onmouseout
        = canvasRam.onmouseout = function () {
        setTimeout(() => {
            if (currentHover !== tooltip) tooltip.style.display = "none";
        }, 0);
    };

    [canvasDown, canvasUp, canvasCpu, canvasRam].forEach(canvas => {
        canvas.closest(".fullWidth").addEventListener("scroll", () => tooltip.style.display = "none", {passive: true});
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
 * Funktion: getSampledIndices()
 * Autor: Bernardo de Oliveira
 *
 * Reduziert die Anzahl zu zeichnender Punkte anhand fester Zeitgruppen
 * Minimum und Maximum jeder Zeitgruppe bleiben erhalten
 */
function getSampledIndices(dataArr, timeArr, maxPoints) {
    const arrayLen = Math.min(dataArr.length, timeArr.length);

    if (!arrayLen) return [];

    if (arrayLen <= maxPoints) {
        return Array.from({length: arrayLen}, (_, index) => index);
    }

    const firstTime = timeArr[0];
    const lastTime = timeArr[arrayLen - 1];
    const timeRange = Math.max(1, lastTime - firstTime);

    const desiredBuckets = Math.max(1, Math.floor(maxPoints / 2));
    const rawBucketSize = timeRange / desiredBuckets;
    const bucketSize = getStableBucketSize(rawBucketSize);

    const indices = [];

    let currentBucket = null;
    let minIndex = null;
    let maxIndex = null;

    const finishBucket = () => {
        if (minIndex === null || maxIndex === null) return;

        if (minIndex === maxIndex) {
            indices.push(minIndex);
        } else if (minIndex < maxIndex) {
            indices.push(minIndex, maxIndex);
        } else {
            indices.push(maxIndex, minIndex);
        }
    };

    for (let i = 0; i < arrayLen; i++) {
        const bucket = Math.floor(timeArr[i] / bucketSize);

        if (currentBucket === null) {
            currentBucket = bucket;
            minIndex = i;
            maxIndex = i;
            continue;
        }

        if (bucket !== currentBucket) {
            finishBucket();

            currentBucket = bucket;
            minIndex = i;
            maxIndex = i;

            continue;
        }

        if (dataArr[i] < dataArr[minIndex]) minIndex = i;
        if (dataArr[i] > dataArr[maxIndex]) maxIndex = i;
    }

    finishBucket();

    return indices;
}

/*
 * Funktion: getStableBucketSize()
 * Autor: Bernardo de Oliveira
 *
 * Wählt eine feste Zeitgrösse für die Darstellung
 * Verhindert, dass sich die Sampling Gruppen bei jedem Update verschieben
 */
function getStableBucketSize(seconds) {
    const sizes = [
        1,
        2,
        5,
        10,
        15,
        30,
        60,
        120,
        300,
        600,
        900,
        1800,
        3600,
        7200,
        14400,
        21600,
        43200,
        86400
    ];

    for (const size of sizes) {
        if (size >= seconds) return size;
    }

    return Math.ceil(seconds / 86400) * 86400;
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

    if (canvas.width !== canvasWidth || canvas.height !== canvasHeight) {
        canvas.width = canvasWidth;
        canvas.height = canvasHeight;
    }

    const GRAPH_HEIGHT = canvasHeight;
    const GRAPH_WIDTH = canvasWidth;

    const GRAPH_TOP = 30;
    const GRAPH_BOTTOM = GRAPH_HEIGHT - (GRAPH_TOP * 2);
    const GRAPH_LEFT = 20;
    const GRAPH_RIGHT = GRAPH_WIDTH - (GRAPH_LEFT * 5);

    const graphRange = GRAPH_BOTTOM - GRAPH_TOP;
    const arrayLen = Math.min(dataArr.length, timeArr.length);

    if (!arrayLen) {
        context.clearRect(0, 0, canvasWidth, canvasHeight);
        return;
    }

    let largest = dataArr[0];
    let smallest = dataArr[0];

    for (let i = 1; i < arrayLen; i++) {
        const value = dataArr[i];

        if (value > largest) largest = value;
        if (value < smallest) smallest = value;
    }

    if (largest === smallest) {
        largest += 1;
        smallest -= 1;
    }

    const valueRange = largest - smallest || 1;

    context.clearRect(0, 0, canvasWidth, canvasHeight);
    context.font = "13px Arial";

    if (theme === "light") {
        context.strokeStyle = "#BBB";
        context.fillStyle = "#3f3f3f";
    } else {
        context.strokeStyle = "#606060";
        context.fillStyle = "#b9b9b9";
    }

    // axes
    context.beginPath();
    context.moveTo(GRAPH_LEFT, GRAPH_BOTTOM);
    context.lineTo(GRAPH_RIGHT, GRAPH_BOTTOM);
    context.lineTo(GRAPH_RIGHT, GRAPH_TOP);
    context.stroke();

    // grid + labels
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

    const firstTime = timeArr[0];
    const lastTime = timeArr[arrayLen - 1];
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

        context.fillText(label[0], x, GRAPH_BOTTOM + 15);
        context.fillText(label[1], x, GRAPH_BOTTOM + 29);
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
    const radius = largeScreen ? 3 : 2;

    context.lineWidth = largeScreen ? 2 : 1;
    context.lineJoin = "round";
    context.lineCap = "round";

    const getPoint = index => {
        const x = getX(timeArr[index]);
        const normalized = (dataArr[index] - smallest) / valueRange;
        const y = GRAPH_BOTTOM - (normalized * graphRange);

        return {x, y};
    };

    const PIXELS_PER_POINT = 10;
    const maxPoints = Math.max(2, Math.floor((GRAPH_RIGHT - GRAPH_LEFT) / PIXELS_PER_POINT));
    const sampledIndices = getSampledIndices(dataArr, timeArr, maxPoints);

    // draw line
    context.beginPath();

    sampledIndices.forEach((index, position) => {
        const point = getPoint(index);

        if (position === 0) {
            context.moveTo(point.x, point.y);
        } else {
            context.lineTo(point.x, point.y);
        }
    });

    context.stroke();

    // draw dots
    context.beginPath();

    for (const index of sampledIndices) {
        const point = getPoint(index);

        points[canvasID].push({
            coordinates: [point.x, point.y],
            value: dataArr[index],
            measurement: measurement,
            time: timeArr[index]
        });

        context.moveTo(point.x + radius, point.y);
        context.arc(point.x, point.y, radius, 0, Math.PI * 2);
    }

    context.fill();
}

/*
 * Funktion: processCompactSeries()
 * Autor: Bernardo de Oliveira
 *
 * Verarbeitet eine Serie des kompakten Monitoring Formats
 */
function processCompactSeries(series, type) {
    const times = [];
    const values = [];

    let lastValid = 0;

    if (!Array.isArray(series)) {
        return {times, values};
    }

    for (const point of series) {
        if (!Array.isArray(point) || point.length < 2) continue;

        const timestamp = Number(point[0]);
        let value = Number(point[1]);

        if (!Number.isFinite(timestamp) || !Number.isFinite(value)) continue;

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

        times.push(timestamp);
        values.push(value);
    }

    return {times, values};
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

    if (data.version === 2 && data.series && typeof data.series === "object") {
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
 *
 * Sucht mit Binary Search den nächsten Graph Punkt
 */
function findClosestPoint(graphPoints, x) {
    let left = 0;
    let right = graphPoints.length - 1;

    while (left < right) {
        const middle = Math.floor((left + right) / 2);

        if (graphPoints[middle].coordinates[0] < x) {
            left = middle + 1;
        } else {
            right = middle;
        }
    }

    let closest = graphPoints[left];

    if (left > 0) {
        const previous = graphPoints[left - 1];

        if (Math.abs(previous.coordinates[0] - x) < Math.abs(closest.coordinates[0] - x)) {
            closest = previous;
        }
    }

    return closest;
}

/*
 * Funktion: showTooltip()
 * Autor: Bernardo de Oliveira
 * Argumente:
 *  object: (Objekt) Das Canvas, welches den Event ausgelöst hat
 *  event: (Event) Das Event
 *
 * Zeigt das Tooltip des nächstgelegenen Graph Punktes an
 */
function showTooltip(object, event) {
    const graphPoints = points[object.id];

    if (!graphPoints || !graphPoints.length) return;

    const point = findClosestPoint(graphPoints, event.offsetX);

    if (
        Math.abs(event.offsetX - point.coordinates[0]) >= HITBOX ||
        Math.abs(event.offsetY - point.coordinates[1]) >= HITBOX
    ) {
        tooltip.style.display = "none";
        return;
    }

    const content = document.getElementById("content");
    const contentRect = content.getBoundingClientRect();

    tooltip.style.top = mouseY - contentRect.top + 10 + "px";
    tooltip.style.left = mouseX - contentRect.left + 10 + "px";
    tooltip.style.display = "initial";

    tooltip.innerHTML = format2(point.value) + " " + point.measurement + "<br/>" + formatTimestamp(point.time);
}

let resizeTimer;

window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(redraw, 150);
});