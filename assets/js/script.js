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
window.addEventListener("resize", function() {
    removeControls("controlsContent");
    removeControls("controlsPlaylist");
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

bindEvent("click", "#player .fa-forward", () => nextSong());

bindEvent("click", "#player .fa-backward", () => previousSong());

bindEvent("touchstart", "#timeline", () => onTimelinePress());

bindEvent("touchend", "#timeline", (e) => onTimelineRelease(e));

bindEvent("mousedown", "#timeline", () => onTimelinePress());

bindEvent("input", "#timeline", (e) => onTimelineMove(e));

bindEvent("mouseup", "#timeline", (e) => onTimelineRelease(e));

/*
 * Funktion: Anonym
 * Autor: Bernardo de Oliveira
 *
 * Ändert die Farbe des Icons, damit der Benutzer erkennt, dass es aktiviert wurde
 * Mischt die Playlist durch und aktualisiert die Playlist-Ansicht
 */
bindEvent("click", ".fa-random", function () {
    let currentSong = playlist[playIndex];

    playlist[playIndex]["player"].stop();

    delete playlist[playIndex];
    playlist.splice(0,1);
    playlist = playlist.sort((a, b) => 0.5 - Math.random());
    playlist.unshift(currentSong);

    playIndex = 0;

    let playlistView = document.getElementById("playlistView");
    let playlistList = playlistView.querySelector("#playlist");
    playlistList.innerHTML = "";
    playlistList.appendChild(generateTable(playlist, false));

    play();
});

/*
 * Funktion: Anonym
 * Autor: Bernardo de Oliveira
 *
 * Zeigt die Optionen von einem Lied (Abspielen, zur Wiedergabeliste hinzufügen usw)
 */
bindEvent("mouseover", "#playlistView tr[data-id]", function () {
    let controls = document.getElementById("controlsPlaylist");
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
 * Öffnet die Playlist-Ansicht
 * Generiert die Playlist-Tabelle
 *
 * Rotiert das Icon, damit der Benutzer erkennt, dass man das Menü wieder schliessen kann
 */
bindEvent("click", ".fa-angle-up", function () {
    let playlistView = document.getElementById("playlistView");
    let body = document.getElementsByTagName("body")[0];

    if (this.getAttribute("data-angle") === "up") {
        body.style.overflowY = "initial";

        this.animate([
            {transform: 'rotate(-180deg)'},
            {transform: 'rotate(0deg)'}
        ], {
            duration: 200,
            fill: "forwards"
        });

        playlistView.animateCallback([
            {height: 'calc(100% - 200px)'},
            {height: '0%'}
        ], {
            duration: 300,
            fill: "forwards",
        }, function () {
            playlistView.style.display = "none";
        });

        this.setAttribute("data-angle", "down");
    } else {
        body.style.overflowY = "hidden";

        this.animate([
            {transform: 'rotate(0deg)'},
            {transform: 'rotate(-180deg)'}
        ], {
            duration: 200,
            fill: "forwards"
        });

        let playlistList = playlistView.querySelector("#playlist");
        playlistList.innerHTML = "";
        playlistList.appendChild(generateTable(playlist, false, true));

        playlistView.style.display = "initial";
        playlistView.animate([
            {height: '0%'},
            {height: 'calc(100% - 200px)'}
        ], {
            duration: 300,
            fill: "forwards"
        });

        this.setAttribute("data-angle", "up");
    }

    document.getElementById("controlsContent").style.display = "none";
    document.getElementById("controlsPlaylist").style.display = "none";
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
bindEvent("click", "#playlistView .fa-play", function () {
    playlist[playIndex]["player"].stop();

    let id = Number(this.closest("#controlsPlaylist").getAttribute("data-id"));

    for (let key = 0; key < Object.keys(playlist).length; key++) {
        let value = playlist[key];

        if (value["id"] === id)
            playIndex = key;
    }

    currentTime = 0;

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
    let html = document.getElementsByTagName("html")[0];

    if (html.getAttribute("data-theme") === "dark") {
        html.setAttribute("data-theme", "light");
        setCookie("theme", "light");
    } else {
        html.setAttribute("data-theme", "dark");
        setCookie("theme", "dark");
    }
});

page = getPage();
window.location.href = "#!page=" + page;
