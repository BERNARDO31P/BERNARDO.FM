if (typeof window["monitoring"] !== 'undefined') throw new Error("Dieses Skript wurde bereits geladen.");

let timeValues = [], downValues = [], upValues = [], cpuValues = [], ramValues = [];
let canvasDown, canvasUp, canvasCpu, canvasRam;
let currentSelect = 4;
let points = {};

let tooltip = document.getElementById("tooltip");

window["monitoring"] = () => {
    canvasDown = document.getElementById("download");
    canvasUp = document.getElementById("upload");
    canvasCpu = document.getElementById("cpu");
    canvasRam = document.getElementById("ram");

    getData();
    startBackgroundProcesses();

    canvasDown.parentNode.scrollLeft = canvasDown.scrollWidth;
    canvasUp.parentNode.scrollLeft = canvasUp.scrollWidth;
    canvasCpu.parentNode.scrollLeft = canvasCpu.scrollWidth;
    canvasRam.parentNode.scrollLeft = canvasRam.scrollWidth;

    canvasDown.onmousemove
        = canvasUp.onmousemove
        = canvasCpu.onmousemove
        = canvasRam.onmousemove
        = canvasDown.onclick
        = canvasUp.onclick
        = canvasCpu.onclick
        = canvasRam.onclick = function (e) {
        showTooltip(this, e);
    }

    canvasDown.onmouseout = canvasUp.onmouseout = canvasCpu.onmouseout = canvasRam.onmouseout = function () {
        setTimeout(function () {
            if (currentHover !== tooltip) tooltip.style.display = "none";
        }, 0);
    }

    canvasDown.parentNode.onscroll = canvasUp.parentNode.onscroll = canvasCpu.parentNode.onscroll = canvasRam.parentNode.onscroll = function () {
        tooltip.style.display = "none";
    }
    
    document.getElementById("time").addEventListener("change", function () {
        getData();
    });
}

/*
 * Funktion: timestampToTime()
 * Autor: Bernardo de Oliveira
 * Argumente:
 *  timestamps: (Array) Die Timestamps welche umgewandelt werden sollen
 *
 * Konvertiert Timestamps zu einer leserlichen Zeit um
 */
function timestampToTime(timestamps) {
    let time = [];

    for (let timestamp of timestamps) {
        let date = new Date(timestamp * 1000);

        let hours = ("0" + date.getHours()).slice(-2);
        let minutes = ("0" + date.getMinutes()).slice(-2);

        let day = ("0" + date.getDate()).slice(-2);
        let month = ("0" + (date.getMonth() + 1)).slice(-2);
        let year = date.getFullYear().toString().slice(-2);

        time.push(hours + ":" + minutes + "\n" + day + "." + month + "." + year);
    }

    return time;
}

function startBackgroundProcesses() {
    clearInterval(backgroundProcesses[0] ?? 0);
    clearInterval(backgroundProcesses[1] ?? 0);

    backgroundProcesses[0] = setInterval(function () {
        getData();
    }, currentSelect * 500);

    backgroundProcesses[1] = setInterval(function () {
        redraw();
    }, currentSelect * 125);
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
function drawGraph(canvas, dataArr, timeArr, measurement, canvasID) {
    let context = canvas.getContext("2d");
    let canvasStyle = window.getComputedStyle(canvas);
    let canvasWidth = Number(canvasStyle.width.replace("px", ""));
    let canvasHeight = Number(canvasStyle.height.replace("px", ""));

    // Hiermit passt sich der Graph an
    let GRAPH_HEIGHT = canvasHeight;
    let GRAPH_WIDTH = canvasWidth;
    canvas.height = canvasHeight;
    canvas.width = canvasWidth;

    // Definition von den Rändern
    let GRAPH_TOP = 30;
    let GRAPH_BOTTOM = GRAPH_HEIGHT - (GRAPH_TOP * 2);
    let GRAPH_LEFT = 20;
    let GRAPH_RIGHT = GRAPH_WIDTH - (GRAPH_LEFT * 5);

    let arrayLen = dataArr.length;

    // Limit number of drawn points to canvas width
    const PIXELS_PER_POINT = 10;

    const MAX_POINTS = (GRAPH_RIGHT - GRAPH_LEFT) / PIXELS_PER_POINT;
    const skip = Math.max(1, Math.ceil(arrayLen / MAX_POINTS));

    let largest = -Infinity;
    let smallest = Infinity;

    for (let i = 0; i < dataArr.length; i++) {
        const v = dataArr[i];
        if (v > largest) largest = v;
        if (v < smallest) smallest = v;
    }

    // Graph-Clear
    context.clearRect(0, 0, canvasWidth, canvasHeight);
    // Setze Schriftart für fillText()
    context.font = "13px Arial";

    if (theme === "light") {
        context.strokeStyle = "#BBB";
        context.fillStyle = "#3f3f3f";
    } else {
        context.strokeStyle = "#606060";
        context.fillStyle = "#b9b9b9";
    }

    // Umriss Generierung
    context.beginPath();
    context.moveTo(GRAPH_LEFT, GRAPH_BOTTOM);
    context.lineTo(GRAPH_RIGHT, GRAPH_BOTTOM);
    context.lineTo(GRAPH_RIGHT, GRAPH_TOP);
    context.stroke();

    // Referenzlinien zeichnen
    context.beginPath();
    context.moveTo(GRAPH_LEFT, GRAPH_TOP);
    context.lineTo(GRAPH_RIGHT, GRAPH_TOP);
    // Referenz für die Daten: Erster Wert

    context.fillText((Math.round(largest * 100) / 100).toString(), GRAPH_RIGHT + 15, GRAPH_TOP);
    context.stroke();

    // Referenzlinien zeichnen
    context.beginPath();
    context.moveTo(GRAPH_LEFT, (GRAPH_HEIGHT) / 4 + GRAPH_TOP);
    context.lineTo(GRAPH_RIGHT, (GRAPH_HEIGHT) / 4 + GRAPH_TOP);
    // Referenz für die Daten: Zweiter Wert
    context.fillText((Math.round((smallest + ((largest - smallest) / 3) * 2) * 100) / 100).toString(), GRAPH_RIGHT + 15, (GRAPH_HEIGHT) / 4 + GRAPH_TOP);
    context.stroke();

    // Referenzlinien zeichnen
    context.beginPath();
    context.moveTo(GRAPH_LEFT, (GRAPH_HEIGHT) / 2 + GRAPH_TOP);
    context.lineTo(GRAPH_RIGHT, (GRAPH_HEIGHT) / 2 + GRAPH_TOP);
    // Referenz für die Daten: Dritter Wert
    context.fillText((Math.round((smallest + (largest - smallest) / 3) * 100) / 100).toString() + " " + measurement, GRAPH_RIGHT + 15, (GRAPH_HEIGHT) / 2 + GRAPH_TOP);
    context.stroke();

    // Referenzlinien zeichnen
    context.beginPath();
    context.moveTo(GRAPH_LEFT, (GRAPH_HEIGHT) / 4 * 3 + GRAPH_TOP);
    context.lineTo(GRAPH_RIGHT, (GRAPH_HEIGHT) / 4 * 3 + GRAPH_TOP);
    // Referenz für die Daten: Letzter Wert
    context.fillText((Math.round(smallest * 100) / 100).toString(), GRAPH_RIGHT + 15, (GRAPH_HEIGHT) / 4 * 3 + GRAPH_TOP);
    context.stroke();

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

        for (let i = 0; i < label.length; i++) {
            context.fillText(label[i], x, GRAPH_BOTTOM + 15 + (i * 14));
        }
    }

    context.textAlign = "left";
    context.textBaseline = "alphabetic";

    // Verbindungslinie Zeichnen
    context.beginPath();

    if (theme === "light") {
        context.fillStyle = "black";
        context.strokeStyle = "black";
    } else {
        context.fillStyle = "#d0d0d0";
        context.strokeStyle = "#d0d0d0";
    }

    let radius;
    if (getWidth() > 1000) {
        radius = 3;
        context.lineWidth = 2;
    } else {
        radius = 2;
        context.lineWidth = 1;
    }

    for (let i = 0; i < arrayLen; i += skip) {

        let end = Math.min(i + skip, arrayLen);

        let minIndex = i;
        let maxIndex = i;

        for (let j = i; j < end; j++) {
            if (dataArr[j] < dataArr[minIndex]) minIndex = j;
            if (dataArr[j] > dataArr[maxIndex]) maxIndex = j;
        }

        const indices = [minIndex, maxIndex].sort((a, b) => a - b);

        for (let idx of indices) {
            context.lineTo(
                (GRAPH_RIGHT - GRAPH_LEFT) / arrayLen * idx + GRAPH_LEFT,
                ((GRAPH_BOTTOM - GRAPH_TOP) - dataArr[idx] / largest * (GRAPH_BOTTOM - GRAPH_TOP)) + GRAPH_TOP
            );
        }
    }

    context.stroke();

    if (typeof points[canvasID] === 'undefined') points[canvasID] = {};

    for (let i = 0; i < arrayLen; i += skip) {

        let end = Math.min(i + skip, arrayLen);

        let minIndex = i;
        let maxIndex = i;

        for (let j = i; j < end; j++) {
            if (dataArr[j] < dataArr[minIndex]) minIndex = j;
            if (dataArr[j] > dataArr[maxIndex]) maxIndex = j;
        }

        const indices = [minIndex, maxIndex];

        for (let idx of indices) {

            const circle = new Path2D();
            let x = (GRAPH_RIGHT - GRAPH_LEFT) / arrayLen * idx + GRAPH_LEFT;
            let y = ((GRAPH_BOTTOM - GRAPH_TOP) - dataArr[idx] / largest * (GRAPH_BOTTOM - GRAPH_TOP)) + GRAPH_TOP;

            points[canvasID][idx] = {};
            points[canvasID][idx]["coordinates"] = [x, y];
            points[canvasID][idx]["value"] = dataArr[idx];
            points[canvasID][idx]["measurement"] = measurement;

            circle.arc(x, y, radius, 0, 2 * Math.PI);
            context.fill(circle);
        }
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
function getData() {
    const select = document.getElementById("time");
    const lastTime = currentSelect;

    currentSelect = parseInt(select.value) ?? 4;

    if (select && lastTime !== parseInt(select.value)) {
        startBackgroundProcesses();
    }

    currentSelect = parseInt(select.value) ?? 4;

    const data = tryParseJSON(httpGet("/system/monitoring/" + currentSelect));

    if (typeof data === 'object') {
        let timestamps = Object.keys(data);
        timeValues = [...new Set(timestampToTime(timestamps))];

        const MAX_NETWORK = 12000;

        downValues = sanitizeNetworkValues(
            Object.values(data).map(function (d) {
                return d["network"]["down"];
            }),
            MAX_NETWORK
        );

        upValues = sanitizeNetworkValues(
            Object.values(data).map(function (d) {
                return d["network"]["up"];
            }),
            MAX_NETWORK
        );
        cpuValues = Object.values(data).map(function (d) {
            return d["cpu"];
        });
        ramValues = Object.values(data).map(function (d) {
            return d["ram"];
        });
    }

    if (select && lastTime !== parseInt(select.value)) {
        redraw();
    }
}

/*
 * Funktion: redraw()
 * Autor: Bernardo de Oliveira
 *
 * Führt die Funktionen zum die Graphen zu zeichnen mit den Werten aus
 */
function redraw() {
    drawGraph(canvasDown, downValues, timeValues, "Mbit/s", canvasDown.id);
    drawGraph(canvasUp, upValues, timeValues, "Mbit/s", canvasUp.id);
    drawGraph(canvasCpu, cpuValues, timeValues, "%", canvasCpu.id);
    drawGraph(canvasRam, ramValues, timeValues, "%", canvasRam.id);
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

        if ((e.offsetY - 3 < pointY && e.offsetY + 3 > pointY) && (e.offsetX - 3 < pointX && e.offsetX + 3 > pointX)) {
            let content = document.getElementById("content");
            let contentRect = content.getBoundingClientRect();

            tooltip.style.top = mouseY - contentRect.top + 10 + "px";
            tooltip.style.left = mouseX - contentRect.left + 10 + "px";
            tooltip.style.display = "initial";

            tooltip.textContent = points[object.id][objectID]["value"] + " " + points[object.id][objectID]["measurement"];
        }
    }
}

window.addEventListener('resize', () => {
    redraw();
});