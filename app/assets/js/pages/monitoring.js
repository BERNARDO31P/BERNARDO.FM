(function () {
    if (typeof window["monitoring"] !== "undefined") {
        return;
    }

    let monitoringRequest = 0;
    let canvasDown, canvasUp, canvasCpu, canvasRam;
    let currentSelect = 4;
    let tooltip;
    let initialScrollDone = false;
    let betaMode = true;
    const HITBOX = 10;
    const TOUCH_HITBOX = 16;
    const monitoringWorkerPath = window.monitoringWorkerUrl || "/assets/js/pages/monitoring.worker.min.js";
    let monitoringWorker = null;
    let monitoringPending = false;
    let monitoringWorkerFailed = false;
    let monitoringCanvases = [];
    let tooltipSequence = 0;
    let tooltipPending = null;
    let tooltipQueued = null;
    let monitoringListeners = null;
    let tooltipFrame = 0;
    let tooltipInput = null;
    let tooltipHTML = null;
    let renderRevision = 0;
    let presentation = new Map();
    const canvasContexts = new WeakMap();
    let graphLoaders = new Map();

    function hideTooltip() {
        tooltipSequence++;
        tooltipQueued = null;
        tooltipInput = null;
        if (tooltipFrame) {
            cancelAnimationFrame(tooltipFrame);
        }
        tooltipFrame = 0;
        if (tooltip) {
            tooltip.style.display = "none";
        }
    }

    function getRenderSettings() {
        const sizes = {};
        for (const canvas of monitoringCanvases) {
            sizes[canvas.id] = {width: canvas.clientWidth, height: canvas.clientHeight};
        }
        return {
            sizes,
            betaMode,
            pixelRatio: Math.max(1, window.devicePixelRatio || 1),
            largeScreen: getWidth() > 1000,
            pixelReduction: window.monitoringPixelReduction === true,
            pathChunkSize: Number.isFinite(window.monitoringPathChunkSize)
                ? Math.max(0, Math.floor(window.monitoringPathChunkSize)) : 512,
            debug: window.monitoringDebug === true,
            renderMode: window.monitoringRenderMode === "png" ? "png" : "bitmap"
        };
    }

    function initWorker() {
        if (typeof Worker === "undefined" || typeof OffscreenCanvas === "undefined") {
            throw new Error("Monitoring requires Web Workers and OffscreenCanvas.");
        }
        if (monitoringWorker) {
            monitoringWorker.terminate();
        }
        monitoringPending = false;
        monitoringWorkerFailed = false;
        tooltipPending = null;
        presentation = new Map();
        hideTooltip();
        const url = new URL(monitoringWorkerPath, window.location.origin);
        const worker = new Worker(url);
        monitoringWorker = worker;
        worker.onmessage = event => {
            const message = event.data;
            if (worker !== monitoringWorker) {
                if (message.type === "frame") {
                    message.bitmap.close();
                }
                return;
            }
            if (message.type === "frame") {
                const canvas = monitoringCanvases.find(item => item.id === message.id);
                if (!canvas?.isConnected || message.request !== monitoringRequest || message.revision !== renderRevision) {
                    message.bitmap.close();
                    worker.postMessage({type: "discard", id: message.id, frame: message.frame});
                    return;
                }
                try {
                    const context = canvasContexts.get(canvas);
                    if (canvas.width !== message.bitmap.width) {
                        canvas.width = message.bitmap.width;
                    }
                    if (canvas.height !== message.bitmap.height) {
                        canvas.height = message.bitmap.height;
                    }
                    context.transferFromImageBitmap(message.bitmap);
                    presentation.set(message.id, {frame: message.frame, width: message.width, height: message.height});
                    if (tooltipPending?.id === message.id || tooltipQueued?.id === message.id) {
                        hideTooltip();
                    }
                    worker.postMessage({type: "presented", id: message.id, frame: message.frame});
                    setLoading(false, canvas);
                } catch (error) {
                    message.bitmap.close();
                    worker.postMessage({type: "discard", id: message.id, frame: message.frame});
                    monitoringWorkerFailed = true;
                    monitoringPending = false;
                    stopBackgroundProcesses();
                    setLoading(false);
                    worker.terminate();
                    console.error("Monitoring bitmap presentation:", error);
                }
                return;
            }
            if (message.type === "tooltip") {
                const pending = tooltipPending;
                tooltipPending = null;
                if (pending && pending.sequence === message.sequence && message.sequence === tooltipSequence && presentation.get(pending.id)?.frame === pending.frame) {
                    renderTooltip(message.point, pending);
                }
                flushTooltip();
                return;
            }
            if (message.request !== monitoringRequest) {
                return;
            }
            if (message.type === "loaded" && message.revision === renderRevision && !monitoringWorkerFailed) {
                monitoringPending = false;
                if (!initialScrollDone) {
                    requestAnimationFrame(() => {
                        if (worker === monitoringWorker) {
                            scrollToEnd();
                        }
                    });
                    initialScrollDone = true;
                }
                setLoading(false);
                startBackgroundProcesses();
            } else if (message.type === "error") {
                monitoringPending = false;
                setLoading(false);
                stopBackgroundProcesses();
                console.error("Monitoring:", message.message);
            }
        };
        worker.onerror = event => {
            if (worker !== monitoringWorker) {
                return;
            }
            monitoringPending = false;
            setLoading(false);
            stopBackgroundProcesses();
            worker.terminate();
            monitoringWorkerFailed = true;
            console.error("Monitoring worker:", url.href, event.message);
        };
        for (const canvas of monitoringCanvases) {
            if (!canvasContexts.has(canvas)) {
                const context = canvas.getContext("bitmaprenderer");
                if (!context) {
                    throw new Error("Monitoring requires an ImageBitmap rendering context.");
                }
                canvasContexts.set(canvas, context);
            }
        }
        worker.postMessage({type: "init", ids: monitoringCanvases.map(canvas => canvas.id)});
    }

    window["monitoring"] = () => {
        const next = ["download", "upload", "cpu", "ram"].map(id => document.getElementById(id));
        if (next.some(canvas => !canvas)) {
            stopBackgroundProcesses();
            return;
        }
        if (monitoringWorker && next.every((canvas, index) => canvas === monitoringCanvases[index])) {
            return;
        }
        stopBackgroundProcesses();
        if (monitoringListeners) {
            monitoringListeners.abort();
        }
        monitoringListeners = new AbortController();
        const signal = monitoringListeners.signal;
        initialScrollDone = false;
        [canvasDown, canvasUp, canvasCpu, canvasRam] = next;
        monitoringCanvases = next;
        graphLoaders = findGraphLoaders();
        tooltip = document.getElementById("tooltip");
        tooltipHTML = null;
        try {
            initWorker();
        } catch (error) {
            monitoringWorkerFailed = true;
            if (monitoringWorker) {
                monitoringWorker.terminate();
            }
            setLoading(false);
            console.error("Monitoring initialization:", error);
            return;
        }
        initDropdown();
        initBetaSwitch();
        setLoading(true);
        getData();
        for (const canvas of monitoringCanvases) {
            canvas.addEventListener("pointermove", event => {
                if (event.pointerType === "mouse") {
                    showTooltip(canvas, event);
                }
            }, {signal});
            canvas.addEventListener("pointerdown", event => showTooltip(canvas, event), {signal});
            canvas.addEventListener("pointerleave", event => {
                if (event.pointerType === "mouse") {
                    hideTooltip();
                }
            }, {signal});
            canvas.closest(".fullWidth").addEventListener("scroll", hideTooltip, {passive: true, signal});
        }
        document.addEventListener("pointerdown", event => {
            if (event.pointerType !== "mouse" && !event.target.closest("canvas") && !event.target.closest("#tooltip")) {
                hideTooltip();
            }
        }, {signal});
    };

    /*
     * Funktion: initDropdown()
     * Autor: Bernardo de Oliveira
     *
     * Initialisiert die Auswahl des Zeitraums.
     */
    function initDropdown() {
        const dropdown = document.getElementById("time");

        if (!dropdown || dropdown.dataset.initialized) {
            return;
        }

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

                if (!monitoringPending || Number(input.value) !== currentSelect) {
                    setLoading(true);
                }
                getData();
            });
        });

        document.addEventListener("click", event => {
            if (!dropdown.contains(event.target)) {
                dropdown.classList.remove("open");
            }
        });
    }

    /*
     * Funktion: initBetaSwitch()
     * Autor: Bernardo de Oliveira
     *
     * Initialisiert den Schalter für die Beta-Graphendarstellung.
     */
    function initBetaSwitch() {
        const betaSwitch = document.getElementById("monitoring-beta");

        if (!betaSwitch || betaSwitch.dataset.initialized) {
            return;
        }

        betaSwitch.dataset.initialized = "1";
        betaMode = betaSwitch.checked;

        betaSwitch.addEventListener("change", () => {
            betaMode = betaSwitch.checked;
            redraw();
        });
    }

    /*
     * Funktion: format2()
     * Autor: Bernardo de Oliveira
     *
     * Formatiert einen Wert mit zwei Dezimalstellen.
     */
    function format2(value) {
        const number = Number(value);

        return Number.isFinite(number) ? number.toFixed(2) : "0.00";
    }

    /*
     * Funktion: setLoading()
     * Autor: Bernardo de Oliveira
     *
     * Zeigt oder versteckt die Ladeanimation des Graphen.
     */
    function findGraphLoaders() {
        const result = new Map();
        const loaders = Array.from(document.querySelectorAll(".graph-loader"));
        const used = new Set();

        // Explizite Zuordnungen haben unabhängig von der HTML-Verschachtelung Vorrang.
        for (const canvas of monitoringCanvases) {
            const loader = loaders.find(item => item.dataset.graph === canvas.id);
            if (loader && !used.has(loader)) {
                result.set(canvas, loader);
                used.add(loader);
            }
        }

        // Andernfalls den nächstgelegenen Container mit genau diesem Graphen
        // und einer noch nicht zugeordneten Ladeanimation suchen. Die Ladeanimation
        // kann sich auf derselben HTML-Ebene wie das Canvas befinden.
        for (const canvas of monitoringCanvases) {
            if (result.has(canvas)) {
                continue;
            }
            for (let parent = canvas.parentElement; parent; parent = parent.parentElement) {
                const graphs = monitoringCanvases.filter(item => parent.contains(item));
                if (graphs.length !== 1) {
                    break;
                }
                const candidates = loaders.filter(item => !used.has(item)
                    && !item.dataset.graph && parent.contains(item));
                if (candidates.length === 1) {
                    result.set(canvas, candidates[0]);
                    used.add(candidates[0]);
                    break;
                }
            }
        }
        return result;
    }

    function setLoading(state, canvas = null) {
        if (canvas) {
            // Nur die Ladeanimation des tatsächlich angezeigten Bitmaps ausblenden.
            graphLoaders.get(canvas)?.classList.toggle("show", state);
            return;
        }
        // Beim erstmaligen Laden, bei Zeitraumsänderungen und bei endgültigen Fehlern sind alle Ladeanimationen betroffen.
        document.querySelectorAll(".graph-loader").forEach(loader => {
            loader.classList.toggle("show", state);
        });
    }

    /*
     * Funktion: scrollToEnd()
     * Autor: Bernardo de Oliveira
     *
     * Scrollt alle Graphen bis zum Ende.
     */
    function scrollToEnd() {
        const containers = monitoringCanvases.map(canvas => canvas.closest(".fullWidth")).filter(Boolean);
        const widths = containers.map(container => container.scrollWidth);
        containers.forEach((container, index) => {
            container.scrollLeft = widths[index];
        });
    }

    /*
     * Funktion: startBackgroundProcesses()
     * Autor: Bernardo de Oliveira
     *
     * Startet die automatische Aktualisierung im Hintergrund.
     */
    function stopBackgroundProcesses() {
        clearInterval(backgroundProcesses[0] ?? 0);
        backgroundProcesses[0] = 0;
    }

    function startBackgroundProcesses() {
        stopBackgroundProcesses();
        if (!monitoringWorkerFailed && monitoringCanvases.every(canvas => canvas.isConnected)) {
            backgroundProcesses[0] = setInterval(getData, Math.max((currentSelect / 100), 2) * 800);
        }
    }

    function getData() {
        const input = document.getElementById("time")?.querySelector("input");
        const newValue = parseInt(input?.value, 10);
        if (!monitoringWorker || monitoringWorkerFailed || !Number.isFinite(newValue) || monitoringCanvases.some(canvas => !canvas.isConnected)) {
            stopBackgroundProcesses();
            setLoading(false);
            return;
        }
        const changed = currentSelect !== newValue;
        if (monitoringPending && !changed) {
            return;
        }
        currentSelect = newValue;
        stopBackgroundProcesses();
        if (changed) {
            hideTooltip();
        }
        monitoringPending = true;
        monitoringWorker.postMessage({
            type: "load",
            request: ++monitoringRequest,
            revision: ++renderRevision,
            selectedTime: currentSelect,
            settings: getRenderSettings()
        });
    }

    function redraw() {
        if (!monitoringWorker || monitoringWorkerFailed) {
            return;
        }
        hideTooltip();
        monitoringWorker.postMessage({type: "redraw", revision: ++renderRevision, settings: getRenderSettings()});
    }

    function showTooltip(canvas, event) {
        if (!monitoringWorker || monitoringWorkerFailed) {
            return;
        }
        tooltipInput = {
            canvas,
            clientX: event.clientX,
            clientY: event.clientY,
            isMouse: event.pointerType === "mouse" || !event.pointerType
        };
        if (tooltipFrame) {
            return;
        }
        tooltipFrame = requestAnimationFrame(() => {
            tooltipFrame = 0;
            const input = tooltipInput;
            tooltipInput = null;
            if (!input || !input.canvas.isConnected || monitoringWorkerFailed) {
                return;
            }
            const rect = input.canvas.getBoundingClientRect();
            const displayed = presentation.get(input.canvas.id);
            if (!displayed || !rect.width || !rect.height) {
                return;
            }
            tooltipQueued = {
                type: "tooltip",
                sequence: ++tooltipSequence,
                id: input.canvas.id,
                frame: displayed.frame,
                x: (input.clientX - rect.left) * displayed.width / rect.width,
                y: (input.clientY - rect.top) * displayed.height / rect.height,
                clientX: input.clientX,
                clientY: input.clientY,
                isMouse: input.isMouse,
                hitbox: input.isMouse ? HITBOX : TOUCH_HITBOX
            };
            flushTooltip();
        });
    }

    function flushTooltip() {
        if (!monitoringWorker || monitoringWorkerFailed || tooltipPending || !tooltipQueued) {
            return;
        }
        tooltipPending = tooltipQueued;
        tooltipQueued = null;
        monitoringWorker.postMessage(tooltipPending);
    }

    function renderTooltip(point, event) {
        if (!point) {
            if (event.isMouse) {
                hideTooltip();
            }
            return;
        }
        if (!tooltip || !tooltip.isConnected) {
            return;
        }
        const html = format2(point.value) + " " + point.measurement
            + "<br/>" + formatTimestamp(point.time);
        if (tooltipHTML !== html) {
            tooltip.innerHTML = html;
            tooltipHTML = html;
        }

        const GAP = 10;
        const MARGIN = 8;
        const viewport = window.visualViewport;
        const viewportLeft = viewport ? viewport.offsetLeft : 0;
        const viewportTop = viewport ? viewport.offsetTop : 0;
        const viewportRight = viewportLeft + (viewport ? viewport.width : window.innerWidth);
        const viewportBottom = viewportTop + (viewport ? viewport.height : window.innerHeight);

        // Den bestehenden CSS-Positionierungskontext beibehalten, aber nur einmal ausmessen.
        tooltip.style.left = "0px";
        tooltip.style.top = "0px";
        tooltip.style.display = "block";
        const rect = tooltip.getBoundingClientRect();
        const targetX = Math.max(viewportLeft + MARGIN,
            Math.min(event.clientX + GAP, viewportRight - MARGIN - rect.width));
        const targetY = Math.max(viewportTop + MARGIN,
            Math.min(event.clientY + GAP, viewportBottom - MARGIN - rect.height));
        tooltip.style.left = (targetX - rect.left) + "px";
        tooltip.style.top = (targetY - rect.top) + "px";
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

    let resizeTimer;

    window.addEventListener("resize", () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(redraw, 150);

    });
})();
