if (typeof window["monitoring"] !== 'undefined') throw new Error("Dieses Skript wurde bereits geladen.");

let timeValues = [], downValues = [], upValues = [], cpuValues = [], ramValues = [];
let canvasDown, canvasUp, canvasCpu, canvasRam;
let points = {};

let tooltip = document.getElementById("tooltip");

window["monitoring"] = () => {
    canvasDown = document.getElementById("download");
    canvasUp = document.getElementById("upload");
    canvasCpu = document.getElementById("cpu");
    canvasRam = document.getElementById("ram");

    getData();
    backgroundProcesses[0] = setInterval(function () {
        getData();
    }, 2000);

    backgroundProcesses[1] = setInterval(function () {
        redraw();
    }, 500);

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
        let hours = ("0" + date.getHours()).substr(-2);
        let minutes = ("0" + date.getMinutes()).substr(-2);

        time.push(hours + ":" + minutes);
    }

    return time;
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
    let largest = Math.max(...dataArr);
    let smallest = Math.min(...dataArr);

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

    context.fillText(Math.round(largest * 100) / 100, GRAPH_RIGHT + 15, GRAPH_TOP);
    context.stroke();

    // Referenzlinien zeichnen
    context.beginPath();
    context.moveTo(GRAPH_LEFT, (GRAPH_HEIGHT) / 4 + GRAPH_TOP);
    context.lineTo(GRAPH_RIGHT, (GRAPH_HEIGHT) / 4 + GRAPH_TOP);
    // Referenz für die Daten: Zweiter Wert
    context.fillText(Math.round((smallest + ((largest - smallest) / 3) * 2) * 100) / 100, GRAPH_RIGHT + 15, (GRAPH_HEIGHT) / 4 + GRAPH_TOP);
    context.stroke();

    // Referenzlinien zeichnen
    context.beginPath();
    context.moveTo(GRAPH_LEFT, (GRAPH_HEIGHT) / 2 + GRAPH_TOP);
    context.lineTo(GRAPH_RIGHT, (GRAPH_HEIGHT) / 2 + GRAPH_TOP);
    // Referenz für die Daten: Dritter Wert
    context.fillText(Math.round((smallest + (largest - smallest) / 3) * 100) / 100 + " " + measurement, GRAPH_RIGHT + 15, (GRAPH_HEIGHT) / 2 + GRAPH_TOP);
    context.stroke();

    // Referenzlinien zeichnen
    context.beginPath();
    context.moveTo(GRAPH_LEFT, (GRAPH_HEIGHT) / 4 * 3 + GRAPH_TOP);
    context.lineTo(GRAPH_RIGHT, (GRAPH_HEIGHT) / 4 * 3 + GRAPH_TOP);
    // Referenz für die Daten: Letzter Wert
    context.fillText(Math.round(smallest * 100) / 100, GRAPH_RIGHT + 15, (GRAPH_HEIGHT) / 4 * 3 + GRAPH_TOP);
    context.stroke();

    // Information, dass die Werte Uhrzeiten sind
    context.fillText("Time", GRAPH_RIGHT / 2 + GRAPH_LEFT, GRAPH_BOTTOM + 50);

    // Referenz für die Zeit
    for (let i = 0, j = 0; i < arrayLen; i++) {
        if (i % 30 === 0) {
            context.fillText(timeArr[j], GRAPH_RIGHT / arrayLen * i + GRAPH_LEFT, GRAPH_BOTTOM + GRAPH_TOP);
            j++;
        }
    }

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

    for (let i = 0; i < arrayLen; i++) {
        context.lineTo((GRAPH_RIGHT - GRAPH_LEFT) / arrayLen * i + GRAPH_LEFT, ((GRAPH_BOTTOM - GRAPH_TOP) - dataArr[i] / largest * (GRAPH_BOTTOM - GRAPH_TOP)) + GRAPH_TOP);

    }
    context.stroke();

    if (typeof points[canvasID] === 'undefined') points[canvasID] = {};

    // Punkte zeichnen
    for (let i = 0; i < arrayLen; i++) {
        const circle = new Path2D();
        let x = (GRAPH_RIGHT - GRAPH_LEFT) / arrayLen * i + GRAPH_LEFT;
        let y = ((GRAPH_BOTTOM - GRAPH_TOP) - dataArr[i] / largest * (GRAPH_BOTTOM - GRAPH_TOP)) + GRAPH_TOP;

        points[canvasID][i] = {};
        points[canvasID][i]["coordinates"] = [x, y];
        points[canvasID][i]["value"] = dataArr[i];
        points[canvasID][i]["measurement"] = measurement;

        circle.arc(x, y, radius, 0, 2 * Math.PI);
        context.fill(circle);
    }
}

/*
 * Funktion: getData()
 * Autor: Bernardo de Oliveira
 *
 * Holt die Graph-Werte und speichert diese separat ab
 */
function getData() {
    let data = tryParseJSON(httpGet("/system/monitoring"));

    if (typeof data === 'object') {
        let timestamps = Object.keys(data);
        timeValues = [...new Set(timestampToTime(timestamps))];

        downValues = Object.values(data).map(function (d) {
            return d["network"]["down"];
        });
        upValues = Object.values(data).map(function (d) {
            return d["network"]["up"];
        });
        cpuValues = Object.values(data).map(function (d) {
            return d["cpu"];
        });
        ramValues = Object.values(data).map(function (d) {
            return d["ram"];
        });
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