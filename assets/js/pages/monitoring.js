if (typeof window["monitoring"] !== 'undefined') throw new Error("Dieses Skript wurde bereits geladen.");

let timeValues = [], downValues = [], upValues = [], cpuValues = [], ramValues = [];
let canvasDown, canvasUp, canvasCpu, canvasRam;

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
function drawGraph(canvas, dataArr, timeArr, measurement) {
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
        context.fillStyle = "black";
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

    context.lineWidth = 2;
    for (let i = 0; i < arrayLen; i++) {
        context.lineTo((GRAPH_RIGHT - GRAPH_LEFT) / arrayLen * i + GRAPH_LEFT, ((GRAPH_BOTTOM - GRAPH_TOP) - dataArr[i] / largest * (GRAPH_BOTTOM - GRAPH_TOP)) + GRAPH_TOP);

    }
    context.stroke();

    // Punkte zeichnen
    for (let i = 0; i < arrayLen; i++) {
        const circle = new Path2D();
        circle.arc((GRAPH_RIGHT - GRAPH_LEFT) / arrayLen * i + GRAPH_LEFT, ((GRAPH_BOTTOM - GRAPH_TOP) - dataArr[i] / largest * (GRAPH_BOTTOM - GRAPH_TOP)) + GRAPH_TOP, 3, 0, 2 * Math.PI);
        context.fill(circle);
    }
}

window.addEventListener('resize', () => {
    redraw();
});

function getData() {
    let data = tryParseJSON(httpGet("/db/monitoring.json"));

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

function redraw() {
    drawGraph(canvasDown, downValues, timeValues, "Mbit/s");
    drawGraph(canvasUp, upValues, timeValues, "Mbit/s");
    drawGraph(canvasCpu, cpuValues, timeValues, "%");
    drawGraph(canvasRam, ramValues, timeValues, "%");
}