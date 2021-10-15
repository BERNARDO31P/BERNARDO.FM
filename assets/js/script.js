let httpGetM = await import(window.location.protocol + "//" + window.location.host + "/assets/js/httpGet.js");
let includeHTMLM = await import(window.location.protocol + "//" + window.location.host + "/assets/js/includeHTML.js");

/*
 * Funktion: dataIncludeReplace()
 * Autor: Bernardo de Oliveira
 *
 * Lädt eine den Inhalt einer externen SeiLeider konnten wir keine Songs findente und fügt diesen in den internen Inhalt ein
 * Ändert den Titel der Webseite
 * Wird durch ein Event aufgerufen
 */
function loadPage() {
    let content = document.querySelector("#content"), title = document.querySelector("title");
    let data = includeHTMLM.htmlToElement(httpGetM.httpGet("./pages/" + page + ".html"));

    includeHTMLM.dataIncludeReplace(data);

    content.innerHTML = data.body.innerHTML;

    let subpage = (data.querySelector("title")) ? data.querySelector("title").innerText : "error";
    title.innerText = title.innerText.split(" - ")[0] + " - " + subpage;

    let scripts = data.getElementsByTagName("script");
    for (let i = 0; i < scripts.length; i++) {
        let script = URL.createObjectURL(new Blob([httpGetM.httpGet(scripts[i].src)], {
            type: 'application/javascript'
        }));
        import(script);
    }

    let i = 0;
    let pageLoad = setInterval(function () {
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

window.addEventListener('popstate', loadPage);

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

/*
 * Funktion: Anonym
 * Autor: Bernardo de Oliveira
 *
 * Sobald eine neue Unterseite angedrückt wird, wird diese in die URL eingefügt
 */
bindEvent("click", "[data-page]", function (e) {
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

bindEvent("click", "#player .fa-play", () => playSong());

bindEvent("touchstart", "#timeline", () => onTimelinePress());

bindEvent("mousedown", "#timeline", () => onTimelinePress());

bindEvent("input", "#timeline", (e) => onTimelineMove(e));

/*
 * Funktion: Anonym
 * Autor: Bernardo de Oliveira
 *
 * Ändert die Farbe des Icons, damit der Benutzer erkennt, dass es aktiviert wurde
 * Mischt die Playlist durch und aktualisiert die Playlist-Ansicht
 */
bindEvent("click", ".fa-random", function () {
    let currentSong = playlist[playIndex];

    currentSong["player"].sources[partlist[playIndex][partIndex]].setPosition(0);
    currentSong["player"].stop();

    delete playlist[playIndex];
    playlist.splice(0, 1);
    playlist = playlist.sort((a, b) => 0.5 - Math.random());
    playlist.unshift(currentSong);

    playIndex = 0;
    partIndex = 0;
    currentTime = 0;

    playlist[playIndex]["player"].sources[partlist[playIndex][partIndex]].setPosition(0);
    let queueView = document.getElementById("queueView");
    let queue = queueView.querySelector("#queue");
    queue.innerHTML = "";
    queue.appendChild(generateTable(playlist, false));

    play();
});

/*
 * Funktion: Anonym
 * Autor: Bernardo de Oliveira
 *
 * Zeigt die Optionen von einem Lied (Abspielen, zur Wiedergabeliste hinzufügen usw)
 */
bindEvent("mouseover", "#queueView tr[data-id]", function () {
    let controls = document.getElementById("controlsQueue");
    controls.style.display = "none";

    let tbody = this.closest("tbody");
    if (isElementVisible(this, tbody)) {
        let height = Number(getComputedStyle(controls).height.replace("px", ""));
        let pos = this.getBoundingClientRect();

        controls.style.left = pos.right - 100 + "px";
        controls.style.top = pos.top + (pos.height - height) / 2 + "px";
        controls.setAttribute("data-id", this.getAttribute("data-id"));

        setTimeout(() => {
            controls.style.display = "initial"
        }, 50);
    }
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
    window.location.href = "#!page=" + page;
});

/*
 * Funktion: Anonym
 * Autor: Bernardo de Oliveira
 *
 * Ändert die Ansicht auf Gitteransicht
 */
bindEvent("click", "#view .fa-grip-horizontal", function () {
    setCookie("view", "grip");
    window.location.href = "#!page=" + page;
});

/*
 * Funktion: Anonym
 * Autor: Bernardo de Oliveira
 *
 * Findet heraus welches Lied abgespielt werden soll
 * Spielt das Lied ab
 */
bindEvent("click", "#queueView .fa-play", function () {
    playlist[playIndex]["player"].stop();

    let id = Number(this.closest("#controlsQueue").getAttribute("data-id"));

    for (let key = 0; key < Object.keys(playlist).length; key++) {
        let value = playlist[key];

        if (value["id"] === id)
            playIndex = key;
    }

    currentTime = 0;
    partIndex = 0;

    clearInterval(secondsInterval);
    play();
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

        setCookie("theme", "light");
    } else {
        html.setAttribute("data-theme", "dark");

        icon.classList.remove("fa-moon");
        icon.classList.add("fa-sun");

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
            this.style.color = "black";
            this.querySelector(".repeatOne").classList.remove("show");
            break;
    }
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
    previousVolume = null;

    playlist[playIndex]["player"].setGain(volume * 65535);

    let volumeIcon = prev(volumeSlider.closest(".volumeBackground"));
    setVolumeIcon(volumeIcon, volumeSlider);

    hideVolumeSlider();
});

/*
 * Funktion: Anonym
 * Autor: Bernardo de Oliveira
 *
 * Schaltet die Wiedergabe auf stumm oder setzt die vorherige Lautstärke
 */
bindEvent("click", ".volume", function (e) {
    if (!isTouchScreen() || touched) {
        let volumeIcon = this.querySelector("svg"), volumeSlider = this.querySelector(".volumeSlider");
        if (e.target === volumeSlider) return;

        if (previousVolume) {
            volumeSlider.value = previousVolume * 100;
            setVolumeIcon(volumeIcon, volumeSlider);
            volume = previousVolume;
            previousVolume = null;
        } else {
            volumeIcon.classList.remove("fa-volume-*");
            volumeIcon.classList.add("fa-volume-mute");
            previousVolume = volume;
            volumeSlider.value = volume = 0;
        }

        playlist[playIndex]["player"].setGain(volume * 65535);

        hideVolumeSlider();
    } else touched = true;
});

setTimeout(function () {
    let theme = document.querySelector("[data-theme]").getAttribute("data-theme");
    let icon = document.getElementById("theme-toggler").querySelector("svg");

    if (theme === "light") icon.classList.add("fa-moon");
    else icon.classList.add("fa-sun");
});

page = getPage();
window.location.href = "#!page=" + page;
