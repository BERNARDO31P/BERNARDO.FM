if (typeof window["monitoring"] !== "undefined") throw new Error("Dieses Skript wurde bereits geladen.");

let timeValues = [], downValues = [], upValues = [], cpuValues = [], ramValues = [];
let canvasDown, canvasUp, canvasCpu, canvasRam;
let currentSelect = 4;
let points = {};

let ctxDown, ctxUp, ctxCpu, ctxRam;
let tooltip;

let initialScrollDone = false;

const HITBOX = 6;

window["monitoring"] = () => {
    canvasDown = document.getElementById("download");
    canvasUp = document.getElementById("upload");
    canvasCpu = document.getElementById("cpu");
    canvasRam = document.getElementById("ram");

    setLoading(true);
    getData().then(scrollToEnd);
    startBackgroundProcesses();
    initDropdown();

    tooltip = document.getElementById("tooltip");

    canvasDown.onmousemove
        = canvasUp.onmousemove
        = canvasCpu.onmousemove
        = canvasRam.onmousemove
        = canvasDown.onclick
        = canvasUp.onclick
        = canvasCpu.onclick
        = canvasRam.onclick = function (e) {
        showTooltip(this, e);
    };

    canvasDown.onmouseout = canvasUp.onmouseout = canvasCpu.onmouseout = canvasRam.onmouseout = function () {
        setTimeout(function () {
            if (currentHover !== tooltip) tooltip.style.display = "none";
        }, 0);
    };

    [canvasDown, canvasUp, canvasCpu, canvasRam].forEach(canvas => {
        canvas.closest(".fullWidth").addEventListener(
            "scroll",
            () => tooltip.style.display = "none",
            { passive: true }
        );
    });

    ctxDown = canvasDown.getContext("2d");
    ctxUp = canvasUp.getContext("2d");
    ctxCpu = canvasCpu.getContext("2d");
    ctxRam = canvasRam.getContext("2d");
};

function initDropdown() {
    const dropdown = document.getElementById("time");
    if (!dropdown) return;

    // prevent double binding
    if (dropdown.dataset.initialized) return;
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

            list.querySelectorAll("div").forEach(o => o.classList.remove("active"));
            option.classList.add("active");

            dropdown.classList.remove("open");

            setLoading(true);
            getData();
        });
    });

    document.addEventListener("click", (e) => {
        if (!dropdown.contains(e.target)) {
            dropdown.classList.remove("open");
        }
    });
}

let redrawScheduled = false;
let lastDraw = 0;

function scheduleRedraw() {
    if (performance.now() - lastDraw < 500) return;
    lastDraw = performance.now();

    if (redrawScheduled) return;

    redrawScheduled = true;

    requestAnimationFrame(() => {
        redrawScheduled = false;
        redraw();
    });
}

function format2(value) {
    const num = Number(value);
    return Number.isFinite(num) ? num.toFixed(2) : "0.00";
}

function safePercent(v) {
    v = Number(v);
    return Number.isFinite(v) ? Math.min(100, Math.max(0, v)) : 0;
}

function setLoading(state) {
    document.querySelectorAll(".graph-loader").forEach(loader => {
        loader.classList.toggle("show", state);
    });
}

function scrollToEnd() {
    const downContainer = canvasDown.closest(".fullWidth");
    const upContainer = canvasUp.closest(".fullWidth");
    const cpuContainer = canvasCpu.closest(".fullWidth");
    const ramContainer = canvasRam.closest(".fullWidth");

    downContainer.scrollLeft = downContainer.scrollWidth;
    upContainer.scrollLeft = upContainer.scrollWidth;
    cpuContainer.scrollLeft = cpuContainer.scrollWidth;
    ramContainer.scrollLeft = ramContainer.scrollWidth;
}

function startBackgroundProcesses() {
    clearInterval(backgroundProcesses[0] ?? 0);
    clearInterval(backgroundProcesses[1] ?? 0);

    backgroundProcesses[0] = setInterval(getData, currentSelect * 800);
    backgroundProcesses[1] = setInterval(scheduleRedraw, currentSelect * 600);
}

/*
 * Funktion: drawGraph()
 * Autor: Bernardo de Oliveira
 * Argumente:
 *  canvas: (Objekt) Die Timestamps welche umgewandelt werden sollen
 *  dataArr: (Array) Die Werte
 *  timeArr: (Array) Die Uhrzeiten
 *  measurement: (String) Die Masseinheit der Werte
 *
 * Zeichnet einen Graphen anhand von Werten und Zeiten
 * !Inline-Kommentare beachten!
 */
function drawGraph(canvas, context, dataArr, timeArr, measurement, canvasID) {
    points[canvasID] = {};

    let canvasWidth = canvas.clientWidth;
    let canvasHeight = canvas.clientHeight;

    if (canvas.width !== canvasWidth || canvas.height !== canvasHeight) {
        canvas.width = canvasWidth;
        canvas.height = canvasHeight;
    }

    let GRAPH_HEIGHT = canvasHeight;
    let GRAPH_WIDTH = canvasWidth;

    let GRAPH_TOP = 30;
    let GRAPH_BOTTOM = GRAPH_HEIGHT - (GRAPH_TOP * 2);
    let GRAPH_LEFT = 20;
    let GRAPH_RIGHT = GRAPH_WIDTH - (GRAPH_LEFT * 5);

    let graphRange = GRAPH_BOTTOM - GRAPH_TOP;

    let arrayLen = dataArr.length;
    if (!arrayLen) return;

    const PIXELS_PER_POINT = 10;
    const MAX_POINTS = (GRAPH_RIGHT - GRAPH_LEFT) / PIXELS_PER_POINT;
    const skip = Math.max(1, Math.ceil(arrayLen / MAX_POINTS));

    let largest = -Infinity;
    let smallest = Infinity;

    for (let i = 0; i < arrayLen; i++) {
        const v = dataArr[i];
        if (v > largest) largest = v;
        if (v < smallest) smallest = v;
    }

    if (largest === smallest) {
        largest += 1;
        smallest -= 1;
    }

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

    const valueRange = largest - smallest || 1;

    drawLine(GRAPH_TOP, format2(largest));

    drawLine(
        GRAPH_TOP + graphRange * (1/3),
        format2(smallest + (valueRange * 2/3))
    );

    drawLine(
        GRAPH_TOP + graphRange * (2/3),
        format2(smallest + (valueRange * 1/3)) + " " + measurement
    );

    drawLine(
        GRAPH_BOTTOM,
        format2(smallest)
    );

    const maxClocks = 7;
    const step = Math.max(1, Math.floor((arrayLen - 1) / (maxClocks - 1)));

    context.textAlign = "center";
    context.textBaseline = "top";

    for (let n = 0; n < maxClocks; n++) {
        const dataIndex = n * step;
        if (dataIndex >= arrayLen) break;

        const timeIndex = Math.round((dataIndex / (arrayLen - 1)) * (timeArr.length - 1));
        const x = (GRAPH_RIGHT / (arrayLen - 1)) * dataIndex + GRAPH_LEFT + 20;

        const label = timeArr[timeIndex].split("\n");

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

    let radius = getWidth() > 1000 ? 3 : 2;
    context.lineWidth = getWidth() > 1000 ? 2 : 1;

    const xStep = (GRAPH_RIGHT - GRAPH_LEFT) / (arrayLen - 1);

    function getPoint(idx) {
        let x = xStep * idx + GRAPH_LEFT;

        let normalized = (dataArr[idx] - smallest) / valueRange;
        let y = GRAPH_BOTTOM - (normalized * graphRange);

        return { x, y };
    }

    // draw line
    context.beginPath();

    context.lineJoin = "round";
    context.lineCap = "round";

    for (let i = 0; i < arrayLen; i += skip) {
        let end = Math.min(i + skip, arrayLen);

        let minIndex = i;
        let maxIndex = i;

        for (let j = i; j < end; j++) {
            if (dataArr[j] < dataArr[minIndex]) minIndex = j;
            if (dataArr[j] > dataArr[maxIndex]) maxIndex = j;
        }

        const indices = minIndex < maxIndex ? [minIndex, maxIndex] : [maxIndex, minIndex];

        for (let k = 0; k < 2; k++) {
            const p = getPoint(indices[k]);
            context.lineTo(p.x, p.y);
        }
    }

    context.stroke();

    // draw dots
    for (let i = 0; i < arrayLen; i += skip) {
        let end = Math.min(i + skip, arrayLen);

        let minIndex = i;
        let maxIndex = i;

        for (let j = i; j < end; j++) {
            if (dataArr[j] < dataArr[minIndex]) minIndex = j;
            if (dataArr[j] > dataArr[maxIndex]) maxIndex = j;
        }

        const indices = [minIndex, maxIndex];

        context.beginPath();

        for (let k = 0; k < 2; k++) {
            const idx = indices[k];
            const p = getPoint(idx);

            points[canvasID][idx] = {
                coordinates: [p.x, p.y],
                value: dataArr[idx],
                measurement: measurement,
                time: timeArr[idx]
            };

            context.arc(p.x, p.y, radius, 0, Math.PI * 2);
        }

        context.fill();
    }
}

function sanitizeNetworkValues(values, maxValue) {
    let result = [];
    let lastValid = 0;

    for (let i = 0; i < values.length; i++) {
        let v = Number(values[i]);

        if (!Number.isFinite(v) || v < 0 || v > maxValue) {
            result.push(lastValid);
        } else {
            lastValid = v;
            result.push(v);
        }
    }

    return result;
}

/*
 * Funktion: getData()
 * Autor: Bernardo de Oliveira
 *
 * Holt die Graph-Werte und speichert diese separat ab
 */
async function getData() {
    const dropdown = document.getElementById("time");
    const input = dropdown.querySelector("input");
    const newValue = parseInt(input.value) ?? 4;

    if (isNaN(newValue)) return;

    const lastTime = currentSelect;
    currentSelect = newValue;

    if (lastTime !== newValue) {
        startBackgroundProcesses();
    }

    const response = await fetch("/system/monitoring/" + currentSelect);
    const data = await response.json();

    await processDataAsync(data);

    requestAnimationFrame(() => {
        redraw();

        if (!initialScrollDone) {
            requestAnimationFrame(scrollToEnd); // ensure layout is ready
            initialScrollDone = true;
        }

        setLoading(false); // hide spinner when done
    });
}

async function processDataAsync(data) {
    if (!data || typeof data !== "object") return;

    const keys = Object.keys(data);
    const values = Object.values(data);

    const MAX_NETWORK = 12000;
    const CHUNK_SIZE = 2000;

    timeValues = [];
    downValues = [];
    upValues = [];
    cpuValues = [];
    ramValues = [];

    for (let i = 0; i < values.length; i++) {
        let d = values[i];

        timeValues.push(formatTimestamp(keys[i]));
        downValues.push(Number(d.network.down));
        upValues.push(Number(d.network.up));
        cpuValues.push(safePercent(d.cpu));
        ramValues.push(safePercent(d.ram));

        if (i > 0 && i % CHUNK_SIZE === 0) {
            await new Promise((resolve) => setTimeout(resolve, 0));
        }
    }

    downValues = sanitizeNetworkValues(downValues, MAX_NETWORK);
    upValues = sanitizeNetworkValues(upValues, MAX_NETWORK);
}

function formatTimestamp(timestamp) {
    let date = new Date(timestamp * 1000);

    let hours = ("0" + date.getHours()).slice(-2);
    let minutes = ("0" + date.getMinutes()).slice(-2);

    let day = ("0" + date.getDate()).slice(-2);
    let month = ("0" + (date.getMonth() + 1)).slice(-2);
    let year = date.getFullYear().toString().slice(-2);

    return hours + ":" + minutes + "\n" + day + "." + month + "." + year;
}

/*
 * Funktion: redraw()
 * Autor: Bernardo de Oliveira
 *
 * Führt die Funktionen zum die Graphen zu zeichnen mit den Werten aus
 */
function redraw() {
    drawGraph(canvasDown, ctxDown, downValues, timeValues, "Mbit/s", canvasDown.id);
    drawGraph(canvasUp, ctxUp, upValues, timeValues, "Mbit/s", canvasUp.id);
    drawGraph(canvasCpu, ctxCpu, cpuValues, timeValues, "%", canvasCpu.id);
    drawGraph(canvasRam, ctxRam, ramValues, timeValues, "%", canvasRam.id);
}

/*
 * Funktion: showTooltip()
 * Autor: Bernardo de Oliveira
 * Argumente:
 *  object: (Objekt) Das Canvas, welches den Event ausgelöst hat
 *  e: (Event) Das Event
 *
 * Zeigt ein Tooltip mit den genaueren Informationen an
 * Berechnet die Position anhand der Position der Maus und der Scroll Position
 */
function showTooltip(object, e) {
    for (let objectID in points[object.id]) {
        let point = points[object.id][objectID]["coordinates"];
        let pointX = point[0], pointY = point[1];

        if (Math.abs(e.offsetX - pointX) < HITBOX && Math.abs(e.offsetY - pointY) < HITBOX) {
            let content = document.getElementById("content");
            let contentRect = content.getBoundingClientRect();

            tooltip.style.top = mouseY - contentRect.top + 10 + "px";
            tooltip.style.left = mouseX - contentRect.left + 10 + "px";
            tooltip.style.display = "initial";

            const point = points[object.id][objectID];

            tooltip.innerHTML =
                format2(point.value) + " " + point.measurement + "<br/>" + point.time;

            return;
        }
    }
}

let resizeTimer;

window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(redraw, 150);
});