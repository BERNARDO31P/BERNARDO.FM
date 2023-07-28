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

    page = this.getAttribute("data-page");
    prevPage = undefined;

    clearURL();
    hidePlaylist();

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

        playlist[playIndex]["player"].reset();

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
bindEvent("click", "[data-title]", function (e) {
    e.preventDefault();

    const target = e.target;
    clearTimeout(touchTimeout);

    const currentTime = new Date().getTime();
    const timeDifference = currentTime - touched;

    if (timeDifference < defaultDelay && timeDifference > 0 && touchedElement === target) {
        showNotification(target.getAttribute("data-title"), 3000);
    } else {
        touchTimeout = setTimeout(() => {
            target.closest("tr").dispatchEvent(clickEvent);
        }, defaultDelay);
    }

    touched = currentTime;
    touchedElement = target;
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

        hidePlaylist();
        loadPage();
    }, defaultDelay);
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
 * Zeigt den Lautstärkeregler
 */
bindEvent("mouseover, touchend", ".volume, .volumeBackground", function () {
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
bindEvent("click", ".volume svg", function (e) {
    muteAudio(e);
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
    }, defaultDelay);
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