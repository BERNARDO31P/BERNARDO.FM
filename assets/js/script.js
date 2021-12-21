/*
 * Funktion: Anonym
 * Autor: Bernardo de Oliveira
 *
 * Wenn der Benutzer sich nicht ganz oben befindet, wird ein Schatten zur Navigation hinzugefügt
 */
window.addEventListener("scroll", () => {
    let navbar = document.querySelector("#navbar");

    if (window.scrollY === 0) {
        navbar.classList.remove("shadow");
    } else {
        navbar.classList.add("shadow");
    }
});

/*
 * Funktion: Anonym
 * Autor: Bernardo de Oliveira
 *
 * Wenn der Benutzer die Fenstergrösse verändert, werden die Controls versteckt
 */
window.addEventListener("resize", function () {
    removeControls("controlsContent");
    removeControls("controlsQueue");
}, true);

// TODO: Comment
document.onkeydown = function(e) {

    let keys = ["K", "Space", "M", "ArrowLeft", "ArrowRight", "J", "L", "R", "S", "ArrowUp", "ArrowDown"];
    let key = e.code.replace("Key", "");

    if (!(currentHover instanceof HTMLInputElement)) {
        if (keys.includes(key)) {
            e.preventDefault();

            let player = document.getElementById("player");
            let timeline = player.querySelector("#timeline");

            let mouseUpEvent = new Event('mouseup', {
                bubbles: true,
                cancelable: true,
            });

            let clickEvent = new Event('click', {
                bubbles: true,
                cancelable: true,
            });

            switch (key) {
                case "R":
                    let repeatButton = player.querySelector(".repeat");
                    repeatButton.dispatchEvent(clickEvent);

                    break;
                case "S":
                    let shuffleButton = player.querySelector(".fa-random");
                    shuffleButton.dispatchEvent(clickEvent);

                    break;
                case "K":
                case "Space":
                    if (playing) pauseSong();
                    else play();
                    break;
                case "M":
                    muteAudio();
                    break;
                case "ArrowLeft":
                    timeline.value = Number(timeline.value) - 5;
                    timeline.dispatchEvent(mouseUpEvent);
                    break;
                case "ArrowRight":
                    timeline.value = Number(timeline.value) + 5;
                    timeline.dispatchEvent(mouseUpEvent);
                    break;
                case "J":
                    timeline.value = Number(timeline.value) - 10;
                    timeline.dispatchEvent(mouseUpEvent);
                    break;
                case "L":
                    timeline.value = Number(timeline.value) + 10;
                    timeline.dispatchEvent(mouseUpEvent);
                    break;
                case "ArrowUp":
                    volume = volume + 0.1;
                    if (volume > 1) volume = 1;

                    setVolume(volume);
                    break;
                case "ArrowDown":
                    volume = volume - 0.1
                    if (volume < 0) volume = 0;

                    setVolume(volume);
                    break;
            }
        }
    }
};

/*
 * Funktion: loadPage()
 * Autor: Bernardo de Oliveira
 *
 * Lädt eine den Inhalt einer externen Seite und fügt diesen in den internen Inhalt ein
 * Ändert den Titel der Webseite
 * Wird durch ein Event aufgerufen
 */
function loadPage() {
    let content = document.querySelector("#content"), title = document.querySelector("title");
    let data = htmlToElement(httpGet("./pages/" + page + ".html"));
    dataIncludeReplace(data);

    content.innerHTML = data.body.innerHTML;

    let subpage = (data.querySelector("title")) ? data.querySelector("title").textContent : "error";
    title.textContent = title.textContent.split(" - ")[0] + " - " + subpage;

    if (backgroundProcesses.length) {
        for (let backgroundProcess of backgroundProcesses) {
            clearInterval(backgroundProcess);
        }
        backgroundProcesses = [];
    }

    if (typeof window[page] === 'undefined') {
        let scripts = data.getElementsByTagName("script");
        for (let script of scripts) {
            getScript(script.src);
        }
    }

    let i = 0;
    let pageLoad = setInterval(() => {
        if (typeof window[page] !== 'undefined') {
            clearInterval(pageLoad);
            window[page]();
        } else if (i > 3) {
            clearInterval(pageLoad);
            console.log("Function not implemented.");
        }
        i++;
    }, 100);
}

/*
 * Funktion: getScript()
 * Autor: Mahn (https://stackoverflow.com/a/28002292)
 * Argumente:
 *  source: (String)
 *
 * Lädt ein Skript nachträglich nach und fügt dieses an dem Ort hinzu, wo es sich befand
 */
function getScript(source) {
    let script = document.createElement('script');
    let prior = document.querySelectorAll("body script:last-child")[0];
    script.async = true;

    script.onload = script.onreadystatechange = function( _, isAbort ) {
        if(isAbort || !script.readyState || /loaded|complete/.test(script.readyState) ) {
            script.onload = script.onreadystatechange = null;
            script = undefined;
        }
    };

    script.src = source;
    prior.parentNode.insertBefore(script, prior);
    prior.remove();
}

/*
 * Funktion: getPage()
 * Autor: Bernardo de Oliveira
 *
 * Holt die derzeitige Seite aus der URL
 * wenn keine definitiert ist, wird die Startseite zurückgegeben
 */
function getPage() {
    let hash = window.location.hash;
    let match = hash.match("page=[^&]*");

    if (match)
        return match[0].split("=")[1];

    return "home";
}

/*
 * Funktion: Anonym
 * Autor: Bernardo de Oliveira
 *
 * Sobald eine neue Unterseite angedrückt wird, wird diese in die URL eingefügt
 */
bindEvent("click", "[data-page]", function (e) {
    e.preventDefault();

    let navigation = document.querySelector("#navigation");
    if (navigation.classList.contains("show"))
        navigation.classList.remove("show");

    let queueView = document.querySelector("#queueView");
    if (queueView.classList.contains("show")) {
        let body = document.getElementsByTagName("body")[0];
        let angleIcon = document.getElementsByClassName("fa-angle-up")[0];

        hidePlaylist(body, queueView, angleIcon);
    }

    page = e.target.dataset.page;
    prevPage = undefined;
    window.location.href = "#!page=" + page;
    loadPage();
    setActiveNavbar();
});

/*
 * Funktion: Anonym
 * Autor: Bernardo de Oliveira
 *
 * Öffnet die Navigation oder schliesst sie
 */
bindEvent("click", "#navbar-toggler", function () {
    let navigation = document.querySelector("#navigation");

    if (navigation.classList.contains("show"))
        navigation.classList.remove("show");
    else
        navigation.classList.add("show");
});

bindEvent("click", "#player .fa-pause", () => pauseSong());

bindEvent("click", "#player .fa-play", () => play());

bindEvent("touchstart", "#timeline", () => onTimelinePress());

bindEvent("mousedown", "#timeline", () => onTimelinePress());

bindEvent("input", "#timeline", (e) => onTimelineMove(e));

/*
 * Funktion: Anonym
 * Autor: Bernardo de Oliveira
 *
 * Zeigt bei einem Click eine Benachrichtigung mit dem Songnamen oder Künstlernamen
 * Wenn das Endgerät ein Touchgerät ist, muss man doppelt drücken
 */
bindEvent("click", "[data-title]", function () {
    if (!isTouchScreen() || touched) {
        let element = this;
        setTimeout(function() {
            if (currentHover === element) {
                touched = false;
                showNotification(element.getAttribute("data-title"), 3000);
            }
        }, 200);
    } else touched = true;
});

/*
 * Funktion: Anonym
 * Autor: Bernardo de Oliveira
 *
 * Zeigt die Optionen von einem Lied (Abspielen, zur Wiedergabeliste hinzufügen usw)
 */
bindEvent("mouseover", "#queueView tr[data-id]", function () {
    let controls = this.querySelector(".controlsQueue");
    if (!controls) {
        removeControls("controlsQueue");
        controls = createControls("controlsQueue", ["play"]);
        let pos = this.getBoundingClientRect();

        controls.style.top = "3px";
        controls.style.right = "0";
        controls.style.height = pos.height - 6 + "px";
        controls.style.lineHeight = pos.height - 6 + "px";
        controls.setAttribute("data-id", this.getAttribute("data-id"));

        setTimeout(() => {
            this.querySelector("td:last-of-type").appendChild(controls);
            controls.classList.add("show");
        }, 50);
    } else clearTimeout(controlsTimeout);
});

/*
 * Funktion: Anonym
 * Autor: Bernardo de Oliveira
 *
 * Entfernt die Liedoptionen
 */
bindEvent("mouseout", "#queueView tr[data-id]", function () {
    let row = this;
    controlsTimeout = setTimeout(function () {
        if (row !== currentHover.closest("tr")) {
            touched = false;
            let controls = row.querySelector(".controlsQueue");
            if (controls) controls.remove();
        }
    }, 0);
});

/*
 * Funktion: Anonym
 * Autor: Bernardo de Oliveira
 *
 * Ändert die Unterseite zu "music" und speichert sich die vorherige Seite
 */
bindEvent("input", "#search", function () {
    if (page !== "music") prevPage = getPage();

    if (this.value || typeof prevPage === 'undefined') page = "music";
    else page = prevPage;

    window.location.href = "#!page=" + page;
    loadPage();
});

/*
 * Funktion: Anonym
 * Autor: Bernardo de Oliveira
 *
 * Schliess die Navigation beim Drücken von "Enter"
 */
bindEvent("keyup", "#search", function (e) {
    if (e.keyCode === 13) {
        e.preventDefault();

        let navigation = document.querySelector("#navigation");
        if (navigation.classList.contains("show"))
            navigation.classList.remove("show");
    }
});

/*
 * Funktion: Anonym
 * Autor: Bernardo de Oliveira
 *
 * Ändert die Ansicht auf Listenansicht
 */
bindEvent("click", "#view .fa-list", function () {
    setCookie("view", "list");
    loadPage();
});

/*
 * Funktion: Anonym
 * Autor: Bernardo de Oliveira
 *
 * Ändert die Ansicht auf Gitteransicht
 */
bindEvent("click", "#view .fa-grip-horizontal", function () {
    setCookie("view", "grid");
    loadPage();
});

/*
 * Funktion: Anonym
 * Autor: Bernardo de Oliveira
 *
 * Ändert das Design-Attribut und ändert somit auch das Design
 */
bindEvent("click", "#theme-toggler", function () {
    let html = document.getElementsByTagName("html")[0], icon = this.querySelector("svg");

    if (html.getAttribute("data-theme") === "dark") {
        html.setAttribute("data-theme", "light");

        icon.classList.remove("fa-sun");
        icon.classList.add("fa-moon");

        theme = "light";
        setCookie("theme", "light");
    } else {
        html.setAttribute("data-theme", "dark");

        icon.classList.remove("fa-moon");
        icon.classList.add("fa-sun");

        theme = "dark";
        setCookie("theme", "dark");
    }
});

/*
 * Funktion: Anonym
 * Autor: Bernardo de Oliveira
 *
 * Änder je nach Wiederholungsmodus die Farbe des Symbols
 * Zeigt an, dass entweder die Playlist oder auch nur ein Lied wiederholt wird
 * Setzt den Wiederholungsmodus
 */
bindEvent("click", ".repeat", function () {
    switch (repeatMode) {
        case 0:
            repeatMode = 1;
            this.style.color = "#1d93ff";
            break;
        case 1:
            repeatMode = 2;
            this.querySelector(".repeatOne").classList.add("show");
            break;
        case 2:
            repeatMode = 0;
            this.style.color = "unset";
            this.querySelector(".repeatOne").classList.remove("show");
            break;
    }
});

/*
     * Funktion: Anonym
     * Autor: Bernardo de Oliveira
     *
     * Ändert die Farbe des Icons, damit der Benutzer erkennt, dass es aktiviert wurde
     * Mischt die Playlist durch und aktualisiert die Playlist-Ansicht
     */
bindEvent("click", ".fa-random", function () {
    let currentSong = playlist[playIndex];
    resetSong(playIndex);

    delete playlist[playIndex];
    playlist.splice(0, 1);
    playlist = playlist.sort((a, b) => 0.5 - Math.random());
    playlist.unshift(currentSong);

    playIndex = 0;
    partIndex = 0;
    currentTime = 0;

    let queueView = document.getElementById("queueView");
    let queue = queueView.querySelector("#queue");

    queue.innerHTML = "";
    queue.appendChild(generateListView(playlist, false));

    play();
});

/*
 * Funktion: Anonym
 * Autor: Bernardo de Oliveira
 *
 * Zeigt den Lautstärkeregler an
 */
bindEvent("mouseover", ".volume", function () {
    document.getElementsByClassName("volumeBackground")[0].classList.add("show");
    hideVolumeSlider();
});

/*
 * Funktion: Anonym
 * Autor: Bernardo de Oliveira
 *
 * Versteckt den Lautstärkeregler
 */
bindEvent("mouseout", ".volume", function () {
    document.getElementsByClassName("volumeBackground")[0].classList.remove("show");
});

/*
 * Funktion: Anonym
 * Autor: Bernardo de Oliveira
 *
 * Ändert die Lautstärke
 */
bindEvent("input", ".volumeSlider", function () {
    let volumeSlider = this;
    volume = volumeSlider.value / 100;

    setVolume(volume);
});

/*
 * Funktion: Anonym
 * Autor: Bernardo de Oliveira
 *
 * Schaltet die Wiedergabe auf stumm oder setzt die vorherige Lautstärke
 */
bindEvent("click", ".volume svg", function (e) {
    muteAudio(e);
});

let iconInterval = setInterval(function () {
    let icon = document.getElementById("theme-toggler").querySelector("svg");

    if (icon) {
        if (theme === "light") icon.classList.add("fa-moon");
        else icon.classList.add("fa-sun");
        clearInterval(iconInterval);
    }
}, 50);

page = getPage();
window.location.href = "#!page=" + page;
loadPage();
dataIncludeReplace(document.body);
setActiveNavbar();

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.min.js');
}