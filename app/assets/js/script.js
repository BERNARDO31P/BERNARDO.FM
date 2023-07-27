/*
 * Funktion: Anonym
 * Autor: Bernardo de Oliveira
 *
 * Wenn der Benutzer sich nicht ganz oben befindet, wird ein Schatten zur Navigation hinzugefügt
 */
window.addEventListener("scroll", () => {
    let navbar = document.getElementById("navbar");
    let menu = document.getElementById("menu");

    if (window.scrollY === 0) {
        navbar.classList.remove("shadow");
    } else {
        navbar.classList.add("shadow");
    }

    if (menu.classList.contains("show")) menu.classList.remove("show");
});

document.addEventListener("visibilitychange", function () {
    if (typeof playlist[playIndex] === 'undefined' || typeof playlist[playIndex]["player"] === 'undefined') return;
    const player = playlist[playIndex]["player"];

    if (document.hidden) {
        player.removeTimeUpdate();

        clearInterval(songInterval);
        songInterval = null;
    } else {
        updateSongData();
        updateURL();

        if (player.isPlaying()) {
            player.addTimeUpdate();
            playPauseButton("play");
        } else {
            playPauseButton("pause");
        }
    }
});

/*
 * Funktion: Anonym
 * Autor: Bernardo de Oliveira
 *
 * Wenn der Benutzer die Fenstergrösse verändert, werden die Controls versteckt
 */
window.addEventListener("resize", function () {
    updateSearch();
});

/*
 * Funktion: Diverse Funktionen
 * Autor: Bernardo de Oliveira
 *
 * Diverse Funktionen welche ausgeführt werden, sobald die Bildschirmausrichtung geändert wird
 * Dafür da um das Suchfeld anzupassen (Breite)
 *
 * Es werden beide Events benötigt, um die meisten Browser zu unterstützen
 */
window.addEventListener("orientationchange", updateSearch);
if ('orientation' in screen) {
    screen.orientation.addEventListener('change', updateSearch);
}

/*
 * Funktion: loadPage()
 * Autor: Bernardo de Oliveira
 *
 * Lädt eine den Inhalt einer externen Seite und fügt diesen in den internen Inhalt ein
 * Ändert den Titel der Webseite
 * Wird durch ein Event aufgerufen
 */
function loadPage() {
    location.href = setGetParameter(location.href, "page", page);
    window.scrollTo({top: 0, left: 0, behavior: "smooth"});

    let content = document.querySelector("#content"), title = document.querySelector("title");
    let data = htmlToElement(httpGet("./pages/" + page + ".html"));
    dataIncludeReplace(data);

    content.innerHTML = data.body.innerHTML;

    if (typeof playlist[playIndex] === 'undefined'
        || (typeof playlist[playIndex]["player"] !== 'undefined'
            && !playlist[playIndex]["player"].isPlaying())) {
        let subpage = (data.querySelector("title")) ? data.querySelector("title").textContent : "error";
        title.textContent = subpage + " - " + title.textContent.split(" - ")[1];
    }

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
            showNotification("Page not implemented yet.", 3000);
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

    script.src = source;
    prior.parentNode.insertBefore(script, prior);
    prior.remove();
}

/*
 * Funktion: Anonym
 * Autor: Bernardo de Oliveira
 *
 * Sobald eine neue Unterseite angedrückt wird, wird diese in die URL eingefügt
 */
bindEvent("click", "#navbar [data-page]", function (e) {
    e.preventDefault();

    let navigation = document.querySelector("#navigation");
    if (navigation.classList.contains("show"))
        navigation.classList.remove("show");

    let queueView = document.querySelector("#queueView");
    let clientRect = queueView.getBoundingClientRect();
    if (clientRect.top === 60) {
        let body = document.getElementsByTagName("body")[0];
        let angleIcon = document.getElementsByClassName("fa-angle-up")[0];

        hidePlaylist(body, queueView, angleIcon);
    }

    page = this.getAttribute("data-page");
    prevPage = undefined;

    clearURL();
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
    else {
        navigation.classList.add("show");

        let menu = document.querySelector("#menu");
        menu.classList.remove("show");
    }
});

/*
 * Funktion: Diverse Funktionen
 * Autor: Bernardo de Oliveira
 *
 * Diverse Funktionen welche durch Benutzereingaben ausgelöst werden
 */
bindEvent("click", "#player .fa-pause", () => pauseSong());
bindEvent("mousedown, touchstart", "#timeline", () => onTimelinePress());
bindEvent("input", "#timeline", (e) => onTimelineMove(e));
bindEvent("mouseup, touchend", "#timeline", (e) => onTimelineRelease(e.target.value));
bindEvent("click", "#player .fa-step-forward", () => nextSong());
bindEvent("click", "#player .fa-step-backward", () => previousSong());

/*
 * Funktion: Anonym
 * Autor: Bernardo de Oliveira
 *
 * Handler, wenn im Player auf den Play Knopf drückt
 * Wenn das Lied beendet wurde, wird überprüft, ob ein nächstes Lied abgespielt werden kann
 */
bindEvent("click", "#player .fa-play", async () => {
    let timeline = document.getElementById("timeline");
    if (timeline.max === timeline.value) {
        let nextIndex = nextSongIndex();
        let diffIndex = (playIndex !== nextIndex);
        partIndex = 0;

        if (typeof playlist[nextIndex] !== 'undefined') {
            if (typeof playlist[nextIndex]["player"] === 'undefined')
                await downloadPart(0, nextIndex, partIndex);

            playIndex = nextIndex;
        }

        let player = playlist[playIndex]["player"];
        player.setOffset(0);
        player.setCurrentTime(0);

        play(diffIndex);
    }

    play();
});

/*
 * Funktion: Anonym
 * Autor: Bernardo de Oliveira
 *
 * Zeigt bei einem Click eine Benachrichtigung mit dem Songnamen oder Künstlernamen
 * Wenn das Endgerät ein Touchgerät ist, muss man doppelt drücken
 */
bindEvent("mouseup, touchend", "[data-title]", function (e) {
    const target = e.target;

    e.preventDefault();

    const currentTime = new Date().getTime();
    const timeDifference = currentTime - touched;

    if (timeDifference < 300 && timeDifference > 0 && touchedElement === target) {
        showNotification(target.getAttribute("data-title"), 3000);
    }

    touched = currentTime;
    touchedElement = target;
});

/*
 * Funktion: Anonym
 * Autor: Bernardo de Oliveira
 *
 * Findet heraus welches Lied abgespielt werden soll
 * Spielt das Lied ab
 */
bindEvent("click", "#queueView tr[data-id]", async function () {
    pauseSong();
    playPauseButton("load");

    let id = this.dataset.id;

    for (let [key, value] of Object.entries(playlist)) {
        if (value["id"] === id) playIndex = Number(key);
    }

    nextPlayIndex = playIndex;

    partIndex = 0;
    nextPartIndex = 0;

    if (typeof playlist[playIndex]["player"] === 'undefined')
        await downloadPart(0, playIndex, partIndex);

    let player = playlist[playIndex]["player"];
    player.setOffset(0);
    player.setCurrentTime(0);

    play(true);
});

/*
 * Funktion: Anonym
 * Autor: Bernardo de Oliveira
 *
 * Findet heraus welches Lied gelöscht werden soll
 * Löscht das Lied aus der Wiedergabenliste und der Liste mit den Teilen
 *
 * Definiert den PlayIndex neu, da dieser eventuell nicht mehr gleich ist
 */
bindEvent("click", "#queueView .fa-trash", async function () {
    let id = this.closest(".controlsQueue").dataset.id;
    let current = playlist[playIndex]["id"];

    const indexes = playlist.map((elm, idx) => elm["id"] === id ? idx : "").filter(String);
    const nodes = Array.prototype.slice.call(this.closest("tbody").children);
    const index = nodes.indexOf(this.closest("tr"));
    const lastOfIndex = indexes.length === 1;
    const sameIndex = id === current && lastOfIndex;

    if (sameIndex) pauseSong();

    delete playlist[index];
    playlist = generateNumericalOrder(playlist);

    if (lastOfIndex)
        delete partlist[id];

    if (sameIndex) {
        const previousIndex = previousSongIndex();
        if (typeof playlist[previousIndex] !== 'undefined') {
            await previousSong(true);
        }
    } else if (index < playIndex) {
        playIndex--;
    }

    this.closest("tr").remove();

    let queueView = document.getElementById("queueView");
    let queue = queueView.querySelector("#queue");

    if (queue.scrollHeight > queue.clientHeight) queue.style.right = "-10px";
    else queue.style.right = "0";
});

/*
 * Funktion: Anonym
 * Autor: Bernardo de Oliveira
 *
 * Ändert die Unterseite zu "music" und speichert sich die vorherige Seite
 */
bindEvent("input", "#search input", function () {
    clearTimeout(searchTimeout);
    let value = this.value;
    let times = this.closest("#search").querySelector(".fa-times");

    if (page !== "music") prevPage = getGetParameter(location.href, "page");

    searchTimeout = setTimeout(function () {
        if (!value) {
            times.classList.remove("show");
            page = (prevPage) ? prevPage : "music";
        } else {
            times.classList.add("show");
            page = "music";
        }

        window.location.href = "#!page=" + page;
        loadPage();
    }, 500);
});

/*
 * Funktion: Anonym
 * Autor: Bernardo de Oliveira
 *
 * Löscht die Eingabe beim Klicken vom X
 */
bindEvent("click", "#search .fa-times", function () {
    let inputEvent = new Event('input', {
        bubbles: true,
        cancelable: true,
    });

    let input = this.closest("#search").querySelector("input");
    input.value = "";

    input.dispatchEvent(inputEvent);
    input.focus();

    this.classList.remove("show");
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
 * Mischt die Playlist durch und aktualisiert die Playlist-Ansicht
 */
bindEvent("click", ".fa-random", function () {
    let currentSong = playlist[playIndex];

    if (currentSong) {
        pauseSong();
        playPauseButton("load");

        delete playlist[playIndex];
        playlist.splice(playIndex, 1);
        playlist = playlist.sort(() => 0.5 - Math.random());
        playlist.unshift(currentSong);

        playIndex = 0;
        nextPlayIndex = 0;

        partIndex = 0;
        nextPartIndex = 0;

        generateListView(playlist).then((listView) => {
            let queueView = document.getElementById("queueView");
            let queue = queueView.querySelector("#queue");

            queue.innerHTML = "";
            queue.appendChild(listView);
        });

        playlist[playIndex]["player"].setOffset(0);

        play();
    }
});

/*
 * Funktion: Anonym
 * Autor: Bernardo de Oliveira
 *
 * Zeigt den Lautstärkeregler an
 */
bindEvent("mouseover", ".volume, .volumeBackground", function () {
    document.getElementsByClassName("volumeBackground")[0].classList.add("show");
    hideVolumeSlider();
});

/*
 * Funktion: Anonym
 * Autor: Bernardo de Oliveira
 *
 * Dafür da um auch in JavaScript zu wissen, auf welchem Element man sich momentan befindet
 */
document.addEventListener("mouseover", function (e) {
    currentHover = e.target;
});


/*
 * Funktion: Anonym
 * Autor: Bernardo de Oliveira
 *
 * Versteckt den Lautstärkeregler
 */
bindEvent("mouseout", ".volume", () => hideVolumeSlider(0));

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
bindEvent("click", ".volume", function (e) {
    muteAudio(e);
});

/*
 * Funktion: Anonym
 * Autor: Bernardo de Oliveira
 *
 * Versteckt die Wiedergabeliste
 */
bindEvent("click", "[data-angle='up']", function () {
    let queueView = document.getElementById("queueView");
    let navbar = document.getElementById("navbar");
    let body = document.getElementsByTagName("body")[0];

    hidePlaylist(body, queueView, this);
    clearInterval(songInterval);
    songInterval = null;

    clearURL();

    if (window.scrollY !== 0) navbar.classList.add("shadow");
});

/*
 * Funktion: Anonym
 * Autor: Bernardo de Oliveira
 *
 * Generiert und zeigt die Wiedergabeliste
 */
bindEvent("click", "[data-angle='down']", function () {
    let queueView = document.getElementById("queueView");
    let navbar = document.getElementById("navbar");
    let body = document.getElementsByTagName("body")[0];

    navbar.classList.remove("shadow");
    body.style.overflowY = "hidden";

    this.animate([
        {transform: 'rotate(0deg)'},
        {transform: 'rotate(-180deg)'}
    ], {
        duration: 200,
        fill: "forwards"
    });

    let queue = queueView.querySelector("#queue");
    if (changedQueue) {
        generateQueue(playlist).then(listView => {
            queue.innerHTML = "";
            queue.appendChild(listView);

            if (queue.scrollHeight > queue.clientHeight) queue.style.right = "-10px";
            else queue.style.right = "0";
        });

        changedQueue = false;
        updatePlaying();
    } else {
        updatePlaying();
    }

    queueView.animate([
        {top: '100%'},
        {top: '60px'}
    ], {
        duration: 300,
        fill: "forwards"
    });

    this.setAttribute("data-angle", "up");
});

/*
 * Funktion: Anonym
 * Autor: Bernardo de Oliveira
 *
 * Ändert das Design-Attribut und ändert somit auch das Design
 */
bindEvent("click", ".theme-toggler", function () {
    let html = document.getElementsByTagName("html")[0], icon = this.querySelector("svg");

    if (html.getAttribute("data-theme") === "dark") {
        html.setAttribute("data-theme", "light");

        icon.classList.remove("fa-sun");
        icon.classList.add("fa-moon");

        theme = "light";
        setCookie("theme", "light", getExpireTime(30));
    } else {
        html.setAttribute("data-theme", "dark");

        icon.classList.remove("fa-moon");
        icon.classList.add("fa-sun");

        theme = "dark";
        setCookie("theme", "dark", getExpireTime(30));
    }

    document.getElementById("menu").classList.remove("show");
});

/*
 * Funktion: Anonym
 * Autor: Bernardo de Oliveira
 *
 * Zeigt das Suchfeld, wenn der Knopf gedrückt wird
 */
bindEvent("click", ".search-toggler", function () {
    showSearch();
});

/*
 * Funktion: Anonym
 * Autor: Bernardo de Oliveira
 *
 * Zeigt und versteckt das Menü, wenn der Knopf gedrückt wird
 */
bindEvent("click", "#menu-toggler", function () {
    let menu = this.parentNode.querySelector("#menu");

    if (menu.classList.contains("show"))
        menu.classList.remove("show");
    else {
        menu.classList.add("show");

        let navigation = document.querySelector("#navigation");
        navigation.classList.remove("show");
    }
});

/*
 * Funktion: Anonym
 * Autor: Bernardo de Oliveira
 *
 * Versteckt das Menü, sobald die Maus es verlässt
 */
bindEvent("mouseout", "#menu", function () {
    if (!isTouchScreen()) {
        let menu = this;

        setTimeout(function () {
            if (currentHover.closest("#menu") !== menu) menu.classList.remove("show");
        });
    }
});

/*
 * Funktion: Anonym
 * Autor: Bernardo de Oliveira
 *
 * Versteckt die Suche, sobald der Fokus verloren geht
 */
bindEvent("focusout", "#search", function () {
    let input = this.querySelector("input");
    input.readOnly = true;

    if (getWidth() <= 1150 && !input.value) {
        input.style.width = "";
        input.classList.remove("show");
    }

    setTimeout(function () {
        input.readOnly = false;
    }, 500);
});

/*
 * Funktion: Anonym
 * Autor: Bernardo de Oliveira
 *
 * Wechselt die Ansicht in der Wiedergabenliste zur Liste
 */
bindEvent("click", "#queueInfo .queue:not(.active)", function () {
    let queueInfo = document.getElementById("queueInfo");

    queueInfo.querySelector("#info").style.display = "none";
    queueInfo.querySelector("#queue").style.display = "block";

    queueInfo.querySelector(".info").classList.remove("active");
    this.classList.add("active");
});

/*
 * Funktion: Anonym
 * Autor: Bernardo de Oliveira
 *
 * Wechselt die Ansicht in der Wiedergabenliste zur Infobox
 */
bindEvent("click", "#queueInfo .info:not(.active)", function () {
    let queueInfo = document.getElementById("queueInfo");

    queueInfo.querySelector("#queue").style.display = "none";
    queueInfo.querySelector("#info").style.display = "block";

    queueInfo.querySelector(".queue").classList.remove("active");
    this.classList.add("active");
});

/*
 * Funktion: Anonym
 * Autor: Bernardo de Oliveira
 *
 * Wird ausgeführt, sobald die Seite geladen hat
 * Setzt je nach Farbauswahl das richtige Symbol (z.B. Mond für dark mode)
 *
 * Lädt die korrekte Seite und ersetzt die fehlenden Elemente
 * Aktualisiert die Navigation
 *
 * Startet den ServiceWorker
 */
document.addEventListener("DOMContentLoaded", function () {
    let iconInterval = setInterval(function () {
        let togglers = document.getElementsByClassName("theme-toggler");

        if (togglers) {
            for (let toggler of togglers) {
                let icon = toggler.querySelector("svg");

                if (icon) {
                    if (theme === "light") icon.classList.add("fa-moon");
                    else icon.classList.add("fa-sun");

                    clearInterval(iconInterval);
                }
            }

        }
    }, 50);

    page = getGetParameter(location.href, "page") ?? "home";
    loadPage();
    dataIncludeReplace(document.body);
    setActiveNavbar();

    /*if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.min.js');
    }*/

    navigator.serviceWorker.getRegistrations().then(function (registrations) {
        for (let registration of registrations) {
            registration.unregister()
        }
    });
});