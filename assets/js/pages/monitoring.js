window["monitoring"] = () => {
    let content = document.getElementById("content");
    let canvas = document.createElement("canvas");
    canvas.classList.add("graph");

    content.insertBefore(canvas, content.firstChild);

    let testValues = [0, 6, 8, 7, 5, 6, 5, 10, 2, 13, 1, 5, 9, 14];
    let testTime = ["00:00", "00:20", "00:40", "01:00", "01:20", "01:40", "02:00"];

    setInterval(function () {
        let lastTime = testTime.at(-1);
        let parts = lastTime.split(":");
        let date = new Date(null, null, null, Number(parts[0]), Number(parts[1]));
        let newTime = addMinutes(date, 20);

        testValues.push(Math.random() * (1000 - 1) + 1);
        testTime.push(("0" + newTime.getHours()).slice(-2) + ":" + ("0" + newTime.getMinutes()).slice(-2));
        testValues.shift();
        testTime.shift();

        drawGraph(canvas, testValues, testTime);
    }, 1000);
}

function addMinutes(date, minutes) {
    return new Date(date.getTime() + minutes * 60000);
}


function drawGraph(canvas, dataArr, timeArr) {
    let context = canvas.getContext("2d");
    let canvasStyle = window.getComputedStyle(canvas);
    let canvasWidth = Number(canvasStyle.width.replace("px", ""));
    let canvasHeight = Number(canvasStyle.height.replace("px", ""));

    let GRAPH_HEIGHT = canvasHeight - 100;
    let GRAPH_WIDTH = canvasWidth - 100;

    canvas.height = canvasHeight;
    canvas.width = canvasWidth;

    let GRAPH_TOP = 25;
    let GRAPH_BOTTOM = GRAPH_HEIGHT + GRAPH_TOP;
    let GRAPH_LEFT = 35;
    let GRAPH_RIGHT = GRAPH_WIDTH - GRAPH_LEFT;

    let arrayLen = dataArr.length;
    let largest = Math.max(...dataArr);

    context.clearRect(0, 0, canvasWidth, canvasHeight);
    // set font for fillText()
    context.font = "16px Arial";

    // draw X and Y axis
    context.beginPath();
    context.moveTo(GRAPH_LEFT, GRAPH_BOTTOM);
    context.lineTo(GRAPH_RIGHT, GRAPH_BOTTOM);
    context.lineTo(GRAPH_RIGHT, GRAPH_TOP);
    context.stroke();

    // draw reference line
    context.beginPath();
    context.strokeStyle = "#BBB";
    context.moveTo(GRAPH_LEFT, GRAPH_TOP);
    context.lineTo(GRAPH_RIGHT, GRAPH_TOP);
    // draw reference value for hours
    context.fillText(Math.round(largest * 100) / 100, GRAPH_RIGHT + 15, GRAPH_TOP);
    context.stroke();

    // draw reference line
    context.beginPath();
    context.moveTo(GRAPH_LEFT, (GRAPH_HEIGHT) / 4 * 3 + GRAPH_TOP);
    context.lineTo(GRAPH_RIGHT, (GRAPH_HEIGHT) / 4 * 3 + GRAPH_TOP);
    // draw reference value for hours
    context.fillText(Math.round(largest / 4 * 100) / 100, GRAPH_RIGHT + 15, (GRAPH_HEIGHT) / 4 * 3 + GRAPH_TOP);
    context.stroke();

    // draw reference line
    context.beginPath();
    context.moveTo(GRAPH_LEFT, (GRAPH_HEIGHT) / 2 + GRAPH_TOP);
    context.lineTo(GRAPH_RIGHT, (GRAPH_HEIGHT) / 2 + GRAPH_TOP);
    // draw reference value for hours
    context.fillText(Math.round(largest / 2 * 100) / 100 + " Mbit/s", GRAPH_RIGHT + 15, (GRAPH_HEIGHT) / 2 + GRAPH_TOP);
    context.stroke();

    // draw reference line)
    context.beginPath();
    context.moveTo(GRAPH_LEFT, (GRAPH_HEIGHT) / 4 + GRAPH_TOP);
    context.lineTo(GRAPH_RIGHT, (GRAPH_HEIGHT) / 4 + GRAPH_TOP);
    // draw reference value for hours
    context.fillText(Math.round(largest / 4 * 3 * 100) / 100, GRAPH_RIGHT + 15, (GRAPH_HEIGHT) / 4 + GRAPH_TOP);
    context.stroke();

    // draw titles
    context.fillText("Time", GRAPH_RIGHT / 2.23, GRAPH_BOTTOM + 50);

    context.beginPath();
    context.fillStyle = "black";
    context.strokeStyle = "black";
    context.lineWidth = 2;

    context.moveTo(GRAPH_LEFT, (GRAPH_HEIGHT - dataArr[0] / largest * GRAPH_HEIGHT) + GRAPH_TOP);
    // draw reference value for day of the week
    for (let i = 0, j = 0; i < arrayLen; i++) {
        context.lineTo(GRAPH_RIGHT / arrayLen * i + GRAPH_LEFT, (GRAPH_HEIGHT - dataArr[i] / largest * GRAPH_HEIGHT) + GRAPH_TOP);
        // draw reference value for day of the week

        if (i % 4 === 0) {
            context.fillText(timeArr[j], GRAPH_RIGHT / arrayLen * i + 15, GRAPH_BOTTOM + GRAPH_TOP);
            j++;
        }
    }
    context.stroke();

    // drawing of circles
    context.moveTo(GRAPH_LEFT, (GRAPH_HEIGHT - dataArr[0] / largest * GRAPH_HEIGHT) + GRAPH_TOP);
    for (let i = 0; i < arrayLen; i++) {
        const circle = new Path2D();
        circle.arc(GRAPH_RIGHT / arrayLen * i + GRAPH_LEFT, (GRAPH_HEIGHT - dataArr[i] / largest * GRAPH_HEIGHT) + GRAPH_TOP, 6, 0, 2 * Math.PI);
        context.fillStyle = 'black';
        context.fill(circle);
    }
}