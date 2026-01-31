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

    let GRAPH_TOP = 30;
    let GRAPH_BOTTOM = canvasHeight - (GRAPH_TOP * 2);
    let GRAPH_LEFT = 20;
    let GRAPH_RIGHT = canvasWidth - (GRAPH_LEFT * 5);

    canvas.width = canvasWidth;
    canvas.height = canvasHeight;

    let arrayLen = dataArr.length;
    if (!arrayLen) return;

    let largest = Math.max(...dataArr);
    let smallest = Math.min(...dataArr);

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

    // reference lines
    const refs = [
        { y: GRAPH_TOP, v: largest },
        { y: canvasHeight / 4 + GRAPH_TOP, v: smallest + (largest - smallest) * 2 / 3 },
        { y: canvasHeight / 2 + GRAPH_TOP, v: smallest + (largest - smallest) / 3 },
        { y: canvasHeight * 3 / 4 - GRAPH_TOP, v: smallest }
    ];

    for (let r of refs) {
        context.beginPath();
        context.moveTo(GRAPH_LEFT, r.y);
        context.lineTo(GRAPH_RIGHT, r.y);
        context.stroke();
        context.fillText(
            Math.round(r.v * 100) / 100 + (r === refs[2] ? " " + measurement : ""),
            GRAPH_RIGHT + 15,
            r.y
        );
    }

    context.fillText("Time", GRAPH_RIGHT / 2 + GRAPH_LEFT, GRAPH_BOTTOM + 50);

    // clocks (max 7)
    const maxClocks = 7;
    const clockStep = Math.max(1, Math.floor((arrayLen - 1) / (maxClocks - 1)));

    for (let n = 0; n < maxClocks; n++) {
        const dataIndex = n * clockStep;
        if (dataIndex >= arrayLen) break;

        const timeIndex = Math.round(
            (dataIndex / (arrayLen - 1)) * (timeArr.length - 1)
        );

        const x = (GRAPH_RIGHT / (arrayLen - 1)) * dataIndex + GRAPH_LEFT;
        context.fillText(timeArr[timeIndex], x, GRAPH_BOTTOM + GRAPH_TOP);
    }

    // line + dots decimation (max 120)
    const maxDots = 120;
    const dotStep = Math.max(1, Math.ceil(arrayLen / maxDots));

    if (theme === "light") {
        context.strokeStyle = "black";
        context.fillStyle = "black";
    } else {
        context.strokeStyle = "#d0d0d0";
        context.fillStyle = "#d0d0d0";
    }

    context.lineWidth = getWidth() > 1000 ? 2 : 1;
    const radius = getWidth() > 1000 ? 3 : 2;

    points[canvasID] = {};

    // line
    context.beginPath();
    let first = true;

    for (let i = 0; i < arrayLen; i += dotStep) {
        const x = (GRAPH_RIGHT - GRAPH_LEFT) / arrayLen * i + GRAPH_LEFT;
        const y = ((GRAPH_BOTTOM - GRAPH_TOP)
                - dataArr[i] / largest * (GRAPH_BOTTOM - GRAPH_TOP))
            + GRAPH_TOP;

        if (first) {
            context.moveTo(x, y);
            first = false;
        } else {
            context.lineTo(x, y);
        }
    }
    context.stroke();

    // dots
    for (let i = 0; i < arrayLen; i += dotStep) {
        const x = (GRAPH_RIGHT - GRAPH_LEFT) / arrayLen * i + GRAPH_LEFT;
        const y = ((GRAPH_BOTTOM - GRAPH_TOP)
                - dataArr[i] / largest * (GRAPH_BOTTOM - GRAPH_TOP))
            + GRAPH_TOP;

        const circle = new Path2D();
        circle.arc(x, y, radius, 0, 2 * Math.PI);
        context.fill(circle);

        points[canvasID][i] = {
            coordinates: [x, y],
            value: dataArr[i],
            measurement: measurement
        };
    }
}

/*
 * Funktion: getData()
 * Autor: Bernardo de Oliveira
 *
 * Holt die Graph-Werte und speichert diese separat ab
 */
function getData() {
    const select = document.getElementById("time");
    const time = (select) ? parseInt(select.value) : 4;
    const data = tryParseJSON(httpGet("/system/monitoring/" + time));

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