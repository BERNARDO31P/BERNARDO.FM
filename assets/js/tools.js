let currentHover = null,
    playIndex = 0,
    partIndex = 0,
    nextPartIndex = 0,
    playlist = [],
    partlist = {},
    playing = false,
    downloading = false,
    volume = 0,
    previousVolume = null,
    repeatMode = 0,
    touched = false,
    touchedElement = null,
    currentButton = null,
    changedQueue = false;

let backgroundProcesses = [];
let sliderTimeout = null, controlsTimeout = null, secondsInterval = null, timelineTimeout = null, searchTimeout = null;
let pageURL = window.location.protocol + "//" + window.location.host + new URL(window.location).pathname;
let page, prevPage, mouseX = 0, mouseY = 0;

/*
 * Autor: Bernardo de Oliveira
 *
 * Das Design wird in einem Cookie gespeichert
 * Hier wird dieser ausgelesen und das Design angewendet
 */
let theme = getCookie("theme");
if (!theme) theme = "light";
document.getElementsByTagName("html")[0].setAttribute("data-theme", theme);

HTMLElement.prototype.animateCallback = function (keyframes, options, callback) {
    let animation = this.animate(keyframes, options);

    animation.onfinish = function () {
        callback();
    }
}

/*
 * Funktion: anonym
 * Autor: Bernardo de Oliveira
 *
 * Speichert beim Bewegen des Mauszeigers die Koordinaten
 */
document.addEventListener("mousemove", (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
});

/*
 * Funktion: bindEvent()
 * Autor: Bernardo de Oliveira
 * Argumente:
 *  eventNames: (String) Event-Name z.B. click
 *  selector: (String) Den Element-Selector z.B. die ID oder Klasse usw.
 *  handler: (Object) Die Funktion welche ausgeführt werden soll
 *
 * Ist das Äquivalent zu .on(eventNames, selector, handler) in jQuery
 */
const bindEvent = (eventNames, selectors, handler) => {
    eventNames.split(', ').forEach((eventName) => {
        document.addEventListener(eventName, function (event) {
            selectors.split(', ').forEach((selector) => {
                if (event.target.matches(selector + ', ' + selector + ' *')) {
                    let element = event.target.closest(selector);
                    handler.apply(element, arguments);
                }
            });
        }, false);
    });
};

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
 * Funktion: prev()
 * Autor: Bernardo de Oliveira
 * Argumente:
 *  element: (Object) Das Element welches geprüft werden soll
 *  className: (String) Wenn eine Klasse mitgegeben wird, wird ein Filter angewendet
 *
 * Ist das Äquivalent zu .prev(selector) in jQuery
 */
const prev = (element, className = "") => {
    let prev = element.previousElementSibling;

    if (!className || prev.classList.contains(className))
        return prev;
}

/*
 * Funktion: httpGet()
 * Autor: Bernardo de Oliveira
 * Argumente:
 *  url: (String) URL von welcher heruntergeladen werden soll
 *
 * Holt sich den Inhalt einer URL und gibt diesen zurück
 */
function httpGet(url) {
    let xmlHttp = new XMLHttpRequest();

    xmlHttp.open("GET", url, false);

    try {
        xmlHttp.send();
        return xmlHttp.responseText;
    } catch (e) {
        return "<body>There was an error performing this request. Please try again later or reloading the page.</body>";
    }
}

/*
 * Funktion: updateSearch()
 * Autor: Bernardo de Oliveira
 *
 * Aktualisiert die Breite des Suchfeldes
 */
function updateSearch() {
    let search = document.getElementById("search").querySelector("input");

    if (search.style.width !== "") {
        setTimeout(function () {
            showSearch();
        }, 200);
    }
}

/*
 * Funktion: createSilence()
 * Autor: ktcy (https://gist.github.com/ktcy/1e981cfee7a309beebb33cdab1e29715)
 * Argumente:
 *  seconds: (Integer) Definiert die Dauer des Platzhalters
 *
 * Erstellt einen Platzhalter in der Länge des momentanen Liedes
 * Dafür da, damit die MediaSession API besser und vor allem überall funktioniert
 */
function createSilence(seconds = 1) {
    const sampleRate = 8000;
    const numChannels = 1;
    const bitsPerSample = 8;

    const blockAlign = numChannels * bitsPerSample / 8;
    const byteRate = sampleRate * blockAlign;
    const dataSize = Math.ceil(seconds * sampleRate) * blockAlign;
    const chunkSize = 36 + dataSize;
    const byteLength = 8 + chunkSize;

    const buffer = new ArrayBuffer(byteLength);
    const view = new DataView(buffer);

    view.setUint32(0, 0x52494646, false);    // Chunk ID 'RIFF'
    view.setUint32(4, chunkSize, true);      // File size
    view.setUint32(8, 0x57415645, false);    // Format 'WAVE'
    view.setUint32(12, 0x666D7420, false);   // Sub-chunk 1 ID 'fmt '
    view.setUint32(16, 16, true);            // Sub-chunk 1 size
    view.setUint16(20, 1, true);             // Audio format
    view.setUint16(22, numChannels, true);   // Number of channels
    view.setUint32(24, sampleRate, true);    // Sample rate
    view.setUint32(28, byteRate, true);      // Byte rate
    view.setUint16(32, blockAlign, true);    // Block align
    view.setUint16(34, bitsPerSample, true); // Bits per sample
    view.setUint32(36, 0x64617461, false);   // Sub-chunk 2 ID 'data'
    view.setUint32(40, dataSize, true);      // Sub-chunk 2 size

    for (let offset = 44; offset < byteLength; offset++) {
        view.setUint8(offset, 128);
    }

    const blob = new Blob([view], {type: 'audio/wav'});
    return URL.createObjectURL(blob);
}

/*
 * Funktion: htmlToElement()
 * Autor: Bernardo de Oliveira
 * Argumente:
 *  html: (String) HTML String welcher zu einem Element werden soll
 *
 * Wandelt ein String zu einem HTML Element um und gibt dieses zurück
 */
function htmlToElement(html) {
    let parser = new DOMParser();
    return parser.parseFromString(html, "text/html");
}

/*
 * Funktion: setActiveNavbar()
 * Autor: Bernardo de Oliveira
 *
 * Entfernt alle aktiven Menüpunkte
 * Setzt den korrekten Menüpunkt auf aktiv
 */
function setActiveNavbar() {
    document.querySelectorAll("#navigation li.active").forEach(function (element) {
        element.classList.remove("active");
    });

    document.querySelector("[data-page='" + page + "']").parentElement.classList.add("active");
}

/*
 * Funktion: dataIncludeReplace()
 * Autor: Bernardo de Oliveira
 * Argumente:
 *  object: (Object) Definiert das HTML
 *
 * Alle HTML Objekte mit dem Attribut "data-include" sowie "data-replace" werden ausgewählt
 * Gefundene Objekte werden mit einer Schleife geladen
 * In der Schleife wird das Attribut ausgelesen
 *
 * Die ausgelesene Datei wird in das Objekt geladen
 * oder das Objekt wird durch die ausgelesene Datei ersetzt
 */
function dataIncludeReplace(object) {
    let elementsInclude = object.querySelectorAll('[data-include]');
    let elementsReplace = object.querySelectorAll('[data-replace]');


    for (let elementInclude of elementsInclude) {
        let url = elementInclude.getAttribute("data-include");
        let data = htmlToElement(httpGet(url));

        let dataElementsInclude = data.querySelectorAll('[data-include]');
        let dataElementsReplace = data.querySelectorAll('[data-replace]');
        if (dataElementsInclude.length || dataElementsReplace.length) {
            dataIncludeReplace(data);
        }

        elementInclude.innerHTML = data.body.innerHTML;
        elementInclude.removeAttribute("data-include");
    }

    for (let elementReplace of elementsReplace) {
        let url = elementReplace.getAttribute("data-replace");
        let data = htmlToElement(httpGet(url));

        let dataElementsInclude = data.querySelectorAll('[data-include]');
        let dataElementsReplace = data.querySelectorAll('[data-replace]');
        if (dataElementsInclude.length || dataElementsReplace.length) {
            dataIncludeReplace(data);
        }

        elementReplace.outerHTML = data.body.innerHTML;
    }
}

/*
 * Funktion: tryParseJSON()
 * Autor: Matt H. [https://stackoverflow.com/questions/3710204/how-to-check-if-a-string-is-a-valid-json-string-in-javascript-without-using-try]
 * Argumente:
 *  jsonString: (String) JSON String welcher auf Gültigkeit überprüft wird
 *
 * Überprüft ob der mitgegebene JSON String gültig ist, sowie ob dieser ein Inhalt besitzt
 * Gibt dieses Objekt zurück, sonst false
 */
function tryParseJSON(jsonString) {
    try {
        let o = JSON.parse(jsonString);

        if (o && typeof o === "object") {
            return o;
        }
    } catch (e) {
    }

    return false;
}

/*
 * Funktion: showNotification()
 * Autor: Bernardo de Oliveira
 * Argumente:
 *  message: (String) Definiert die Nachricht in der Benachrichtigung
 *  time: (Integer) Definiert wie lange die Benachrichtigung angezeigt werden soll
 *
 * Animiert eine Benachrichtigung in die Anzeige
 * Wenn der Player angezeigt wird, wird die Benachrichtigung drüber angezeigt, sonst ganz unten
 */
function showNotification(message, time) {
    let content = document.getElementById("content");

    let notifications = document.getElementsByClassName("notification");
    for (let notification of notifications) {
        let notificationStyle = window.getComputedStyle(notification);
        let notificationPosition = notification.getBoundingClientRect();

        let bottom = Number(notificationStyle.bottom.replace("px", ""));
        notification.style.bottom = bottom + notificationPosition.height + 5 + "px";
    }

    let notification = document.createElement("div");
    notification.classList.add("notification");

    notification.textContent = message;
    notification.style.left = content.getBoundingClientRect().left + 10 + "px";

    content.parentNode.appendChild(notification);

    let player = document.getElementById("player");
    let playerStyle = window.getComputedStyle(player);

    let timeoutOpacity, timeoutBottom;

    notification.animateCallback([
        {opacity: 0},
        {opacity: 1}
    ], {
        duration: 100,
        fill: "forwards"
    }, function () {
        timeoutOpacity = setTimeout(() => {
            removeOpacityNotification(notification);
        }, time);
    });

    if (playerStyle.display !== "none") {
        if (getWidth() > 500) {
            notification.animateCallback([
                {bottom: '10px'},
                {bottom: '110px'}
            ], {
                duration: 100
            }, function () {
                notification.style.bottom = "110px";

                timeoutBottom = setTimeout(function () {
                    hideNotification(notification);
                }, time);
            });
        } else {
            notification.style.bottom = "110px";
        }
    }

    notification.onmouseover = function () {
        clearTimeout(timeoutOpacity);
        clearTimeout(timeoutBottom);
    }

    notification.onmouseout = function () {
        removeOpacityNotification(notification);
        hideNotification(notification);
    }
}

/*
 * Funktion: removeOpacityNotification()
 * Autor: Bernardo de Oliveira
 * Argumente:
 *  notification: (Object) Definiert die Benachrichtigung
 *
 * Entfernt die Sichtbarkeit von einer Benachrichtigung
 * Entfernt die Benachrichtigung nach Schluss
 */
function removeOpacityNotification(notification) {
    notification.animateCallback([
        {opacity: 1},
        {opacity: 0}
    ], {
        duration: 100,
        fill: "forwards"
    }, function () {
        notification.remove();
    });
}

/*
 * Funktion: hideNotification()
 * Autor: Bernardo de Oliveira
 * Argumente:
 *  notification: (Object) Definiert die Benachrichtigung
 *
 * Bewegt eine Benachrichtigung nach unten um sie zu verstecken
 */
function hideNotification(notification) {
    let position = window.getComputedStyle(notification);

    notification.animateCallback([
        {bottom: position.bottom},
        {bottom: '10px'}
    ], {
        duration: 100
    }, function () {
        notification.style.bottom = "10px";
    });
}

/*
 * Funktion: isTouchScreen()
 * Autor: bolmaster2 (https://stackoverflow.com/a/4819886)
 *
 * Überprüft, ob ein Gerät touch-fähig ist
 */
function isTouchScreen() {
    return (('ontouchstart' in window) ||
        (navigator.maxTouchPoints > 0) ||
        (navigator.msMaxTouchPoints > 0));
}

/*
 * Funktion: getWidth()
 * Autor: Bernardo de Oliveira
 *
 * Gibt die Browser Breite zurück
 */
function getWidth() {
    return Math.max(
        document.body.scrollWidth,
        document.documentElement.scrollWidth,
        document.body.offsetWidth,
        document.documentElement.offsetWidth,
        document.documentElement.clientWidth
    );
}

/*
 * Funktion: getCookie()
 * Autor: Bernardo de Oliveira
 * Argumente:
 *  name: (String) Cookie Name
 *
 * Sucht den Cookie über den Namen
 * Gibt den Wert zurück
 */
function getCookie(name) {
    let value = `; ${document.cookie}`, parts = value.split(`; ${name}=`);

    if (parts.length === 2) {
        return parts.pop().split(';').shift();
    } else {
        return "";
    }
}

/*
 * Funktion: setCookie()
 * Autor: Bernardo de Oliveira
 * Argumente:
 *  name: (String) Cookie Name
 *  value: (String) Cookie Wert
 *  expiresAt: (String) Auslaufdatum vom Cookie
 *
 * Erstellt einen Cookie und setzt die Werte
 */
function setCookie(name, value, expiresAt = "") {
    document.cookie = name + "=" + value + "; Expires=" + expiresAt + "; Path=/; SameSite=Lax";
}

/*
 * Funktion: ucFirst()
 * Autor: Bernardo de Oliveira
 * Argumente:
 *  string: (String) Zeichenkette
 *
 * Modifiziert eine Zeichenkette, sodass diese mit einem Grossbuchstaben beginnt
 */
function ucFirst(string) {
    return String(string).charAt(0).toUpperCase() + string.slice(1);
}

/*
 * Funktion: getMinutesAndSeconds()
 * Autor: Bernardo de Oliveira
 * Argumente:
 *  time: (Integer) Die Sekunden
 *
 * Wandelt Sekunden in Minuten und Sekunden um
 */
function getMinutesAndSeconds(time) {
    let minutes = Math.floor(time / 60);
    let seconds = time - minutes * 60;

    minutes = ("0" + minutes).slice(-2);
    seconds = ("0" + seconds).slice(-2);

    return minutes + ":" + seconds;
}

/*
 * Funktion: createControls()
 * Autor: Bernardo de Oliveira
 * Argumente:
 *  elementClass: (String) Defineirt die Klasse, welche dem Objekt zugewiesen wird
 *  actions: (Array) Definiert die Liedoptionen welche angezeigt werden sollen
 *
 * Generiert die Liedoptionen je nach Parameter
 */
function createControls(elementClass, actions) {
    let controls = document.createElement("div");
    controls.classList.add(elementClass);

    for (let action of actions) {
        let icon;
        switch (action) {
            case "play":

                icon = document.createElement("i");
                icon.title = "Play this song";
                icon.classList.add("fas", "fa-play");

                break;
            case "add":

                icon = document.createElement("div");
                icon.title = "Add this song to the queue";
                icon.classList.add("listAdd");

                let listIcon = document.createElement("i"), plusIcon = document.createElement("i");
                listIcon.classList.add("fas", "fa-list");
                plusIcon.classList.add("fas", "fa-plus");

                icon.appendChild(listIcon);
                icon.appendChild(plusIcon);

                break;
        }
        controls.appendChild(icon);
    }

    return controls;
}

/*
 * Funktion: removeControls()
 * Autor: Bernardo de Oliveira
 * Argumente:
 *  elementClass: (String) Defineirt die Objekte durch die Klasse
 *
 * Entfernt die Liedoptionen
 */
function removeControls(elementClass) {
    let controls = document.getElementsByClassName(elementClass);

    for (let control of controls) {
        control.remove();
    }
}

/*
 * Funktion: setVolumeIcon()
 * Autor: Bernardo de Oliveira
 * Argumente:
 *  volumeIcon: (Object) Definiert das Lautstärke Symbol
 *  volumeSlider: (Object) Definiert den Lautstärkeregler
 *
 * Setzt je nach Lautstärke das richtige Symbol
 */
function setVolumeIcon(volumeIcon, volumeSlider) {
    volumeIcon.classList.remove("fa-volume-*");

    if (volumeSlider.value >= 50) volumeIcon.classList.add("fa-volume-up");
    else if (volumeSlider.value >= 1) volumeIcon.classList.add("fa-volume-down");
    else volumeIcon.classList.add("fa-volume-off");
}

/*
 * Funktion: hideVolumeSlider()
 * Autor: Bernardo de Oliveira
 *
 * Versteckt den Lautstärkeregler
 */
function hideVolumeSlider() {
    clearTimeout(sliderTimeout);
    sliderTimeout = setTimeout(function () {
        document.getElementsByClassName("volumeBackground")[0].classList.remove("show");
        touched = false;
    }, 2000);
}

/*
 * Funktion: hidePlaylist()
 * Autor: Bernardo de Oliveira
 * Argumente:
 *  body: (Object) Definiert das Body-Objekt
 *  playlistView: (Object) Definiert die Playlist
 *  angleIcon: (Object) Definiert das Icon von der Playlist
 *
 * Versteckt die Playlist-Ansicht
 */
function hidePlaylist(body, queueView, angleIcon) {
    body.style.overflowY = "initial";

    angleIcon.animate([
        {transform: 'rotate(-180deg)'},
        {transform: 'rotate(0deg)'}
    ], {
        duration: 200,
        fill: "forwards"
    });

    queueView.animateCallback([
        {top: '60px'},
        {top: '100%'}
    ], {
        duration: 300,
        fill: "forwards",
    }, function () {
        queueView.classList.remove("show");
    });

    angleIcon.setAttribute("data-angle", "down");
}

/*
 * Funktion: setVolume()
 * Autor: Bernardo de Oliveira
 * Argumente:
 *  volume: (Double) Definiert die neue Lautstärke
 *
 * Ändert die Lautstärke auf den gewünschten Wert
 * Speichert sie in einem Cookie
 */
function setVolume(volume) {
    let volumeSlider = document.getElementById("player").querySelector(".volumeSlider");

    previousVolume = null;
    playlist[playIndex]["player"].setVolume(volume);
    volumeSlider.value = volume * 100;

    let volumeIcon = prev(volumeSlider.closest(".volumeBackground"));
    setVolumeIcon(volumeIcon, volumeSlider);
    setCookie("volume", volume);

    hideVolumeSlider();
}

/*
 * Funktion: muteAudio()
 * Autor: Bernardo de Oliveira
 * Argumente:
 *  e: (Event) Definiert das ausgelöste Event
 *
 * Setzt das Lied auf Stumm oder machts rückgängig
 * Speichert den Status in einen Cookie
 *
 * Wenn man auf einem Touchgerät ist, muss man zweimal drücken
 */
function muteAudio(e = null) {
    if (!isTouchScreen() || touched) {
        let volumeSlider = document.getElementById("player").querySelector(".volumeSlider"),
            volumeIcon = prev(volumeSlider.closest(".volumeBackground"));

        if (e && e.target === volumeSlider) return;

        if (previousVolume) {
            volumeSlider.value = previousVolume * 100;
            setVolumeIcon(volumeIcon, volumeSlider);
            volume = previousVolume;
            previousVolume = null;
            setCookie("muted", false);
        } else {
            volumeIcon.classList.remove("fa-volume-*");
            volumeIcon.classList.add("fa-volume-mute");
            previousVolume = volume;
            volumeSlider.value = volume = 0;
            setCookie("muted", true);
        }

        if (typeof playlist[playIndex] !== 'undefined')
            playlist[playIndex]["player"].setVolume(volume);

        hideVolumeSlider();
    } else touched = true;
}

/*
 * Funktion: showSearch()
 * Autor: Bernardo de Oliveira
 *
 * Zeigt das Suchfeld und fügt ein Fokus hinzu
 */
function showSearch() {
    let searchToggler = document.getElementsByClassName("search-toggler")[0];
    let input = searchToggler.closest(".icons").querySelector("#search input");
    let width = "";

    if (getWidth() <= 500) width = getWidth() - 195 + "px";
    else if (getWidth() <= 1150) width = getWidth() - 265 + "px";

    input.style.width = width;
    input.style.padding = "12px 65px 12px 16px";

    input.focus();
    document.getElementById("menu").classList.remove("show");
}

/*
 * Funktion: play()
 * Autor: Bernardo de Oliveira
 *
 * Fügt die neuen Liedinformationen in den Player und in die MediaSession API ein
 * Beginnt die Wiedergabe
 *
 * Startet eine Schleife, welche jede Sekunde den Fortschritt des Liedes abruft und ins Tooltip speichert
 */
function play(diffSong = false) {
    let player = document.getElementById("player");

    let song = playlist[playIndex];
    let gapless = song["player"];

    gapless.setVolume(volume);
    gapless.play();
    playing = true;

    if (diffSong) {
        let split = song["length"].split(":"), length = Number(split[0]) * 60 + Number(split[1]);
        let songLength = document.getElementById("timeInfo").querySelector("#length");
        let queueView = document.getElementById("queueView");
        let cover = queueView.querySelector("#playingCover").querySelector("img");

        cover.src = song["cover"]
        songLength.textContent = song["length"];
        player.querySelector("#timeline").max = length;

        MSAPI.src = createSilence(length);
        MSAPI.load();
        MSAPI.currentTime = 0;

        player.querySelector("#name").innerHTML = "<div class='truncate'>" +
            "<div class='content' title='" + song["name"] + "'>" + song["name"] + "</div>" +
            "<div class='spacer'>" + song["name"] + "</div>" +
            "<span>&nbsp;</span>" +
            "</div>";

        player.querySelector("#artist").innerHTML = "<div class='truncate'>" +
            "<div class='content' title='" + song["artist"] + "'>" + song["artist"] + "</div>" +
            "<div class='spacer'>" + song["artist"] + "</div>" +
            "<span>&nbsp;</span>" +
            "</div>";


        if ('mediaSession' in navigator) {
            let song = playlist[playIndex];

            let mouseUpEvent = new Event('mouseup', {
                bubbles: true,
                cancelable: true,
            });

            navigator.mediaSession.metadata = new MediaMetadata({
                title: song["name"],
                artist: song["artist"],
                artwork: [
                    {src: song["cover"], type: 'image/png'},
                ]
            });

            navigator.mediaSession.setActionHandler('play', function () {
                play()
            });
            navigator.mediaSession.setActionHandler('pause', function () {
                pauseSong()
            });
            navigator.mediaSession.setActionHandler('previoustrack', function () {
                previousSong()
            });
            navigator.mediaSession.setActionHandler('nexttrack', function () {
                nextSong()
            });
            navigator.mediaSession.setActionHandler('stop', function () {
                pauseSong()
            });
            navigator.mediaSession.setActionHandler('seekbackward', function () {
                let timeline = document.getElementById("timeline");

                timeline.value = Number(timeline.value) - 10;
                timeline.dispatchEvent(mouseUpEvent);
            });
            navigator.mediaSession.setActionHandler('seekforward', function () {
                let timeline = document.getElementById("timeline");

                timeline.value = Number(timeline.value) + 10;
                timeline.dispatchEvent(mouseUpEvent);
            });
            navigator.mediaSession.setActionHandler('seekto', function (details) {
                if ('seekTime' in details) {
                    let time = Math.round(details.seekTime);
                    onTimelineRelease(time);
                }
            })
        }

        let data = tryParseJSON(httpGet(pageURL + "system/info/" + song["id"]));
        let infoBox = queueView.querySelector("#info");
        if (Object.keys(data).length) {
            infoBox.innerHTML = "";
            for (let info of Object.values(data)) {
                infoBox.innerHTML += "<h3>" + info["name"] + "</h3>" +
                    "<p>" + info["description"] + "</p>";
            }
        } else {
            infoBox.innerHTML = "<h3>No description found.</h3>";
        }
    }

    player.style.display = "initial";
    if (MSAPI.paused) MSAPI.play();

    let title = document.querySelector("title");
    title.textContent = song["name"] + " - " + title.textContent.split(" - ")[1];

    if (!secondsInterval) {
        secondsInterval = setInterval(function () {
            let timeline = document.getElementById("timeline");
            let currentPosition = getCurrentPartTime();

            if (currentPosition) {
                let position = currentPosition + partlist[playIndex][partIndex]["from"];
                timeline.value = position;
                MSAPI.currentTime = position;

                if ('mediaSession' in navigator) {
                    navigator.mediaSession.setPositionState({
                        duration: MSAPI.duration,
                        playbackRate: MSAPI.playbackRate,
                        position: MSAPI.currentTime
                    });
                }
            }
        }, 1000);
    }
}

/*
 * Funktion: nextSongIndex()
 * Autor: Bernardo de Oliveira
 *
 * Holt sich die Array ID des nächsten Liedes
 */
function nextSongIndex() {
    let nextIndex = Number(playIndex) + 1;
    switch (repeatMode) {
        case 1:
            if (typeof playlist[nextIndex] === 'undefined')
                return 0;
            break;
        case 2:
            return playIndex;
    }
    return nextIndex;
}

/*
 * Funktion: previousSongIndex()
 * Autor: Bernardo de Oliveira
 *
 * Holt sich die Array ID des vorherigen Liedes
 */
function previousSongIndex() {
    let previousIndex = Number(playIndex) - 1;
    switch (repeatMode) {
        case 0:
        case 1:
            if (typeof playlist[previousIndex] === 'undefined')
                return 0;
            break;
        case 2:
            return playIndex;
    }
    return previousIndex;
}

/*
 * Funktion: playPauseButton()
 * Autor: Bernardo de Oliveira
 * Argumente:
 *  play: (Boolean) Definiert ob gerade abgespielt wird
 *
 * Ändert das Icon von "abspielen/pausieren"
 */
function playPauseButton(option = "pause") {
    let player = document.getElementById("player");
    let button = player.querySelector("#dynamicButton");

    if (currentButton !== option) {
        if (option === "play") {
            button.innerHTML = "<i class=\"fas fa-pause\"></i>";
        } else if (option === "pause") {
            button.innerHTML = "<i class=\"fa fa-play\"></i>";
        } else if (option === "load") {
            button.innerHTML = "<div class=\"lds-ring\"><div></div><div></div><div></div><div></div></div>";
        }
        currentButton = option;
    }
}

/*
 * Funktion: clearSong()
 * Autor: Bernardo de Oliveira
 * Argumente:
 *  index: (Integer) Definiert welches Lied
 *
 * Löscht alle Teile eines Liedes
 */
function clearSong(index) {
    if (typeof playlist[index]["player"] !== 'undefined') {
        playlist[index]["player"].stop();
        playlist[index]["player"].removeAllTracks();
    }
}

/*
 * Funktion: clearSong()
 * Autor: Bernardo de Oliveira
 *
 * Löscht alle Teile aller Lieder
 */
function clearSongs() {
    for (let index of Object.keys(playlist)) {
        clearSong(index);
    }
}

/*
 * Funktion: resetSong()
 * Autor: Bernardo de Oliveira
 * Argumente:
 *  index: (Integer) Definiert welches Lied
 *
 * Setzt ein Lied vollständig zurück
 * Alle Teile werden zurücksetzt
 */
function resetSong(index) {
    let gapless = playlist[index]["player"];

    if (playing) pauseSong();
    gapless.gotoTrack(0);

    for (let part of Object.values(partlist[index])) {
        if (typeof gapless.playlist.sources[part["gid"]] !== 'undefined')
            gapless.playlist.sources[part["gid"]].setPosition(0);
    }
}

/*
 * Funktion: pauseSong()
 * Autor: Bernardo de Oliveira
 *
 * Pausiert die Wiedergabe
 */
function pauseSong() {
    if (playing) {
        playPauseButton("pause");

        playlist[playIndex]["player"].pause();
        MSAPI.pause();

        clearInterval(secondsInterval);
        secondsInterval = null;

        playing = false;
    }
}

/*
 * Funktion: onTimelinePress()
 * Autor: Bernardo de Oliveira
 *
 * Sobald die Timeline angedrückt wird, wird die Zeit Information mit dem jetzigen Fortschritt des Liedes angezeigt
 * Die Wiedergabe wird pausiert
 */
function onTimelinePress() {
    let timeInfo = document.getElementById("timeInfo");
    timeInfo.style.display = "initial";

    pauseSong();
}

/*
 * Funktion: onTimelineMove()
 * Autor: Bernardo de Oliveira
 * Argumente:
 *  rangeEvent: (Event) Das ausgelöste Ereignis
 *
 * Die Zeit Information wird an die letzte bekannte Position der Maus verschoben
 * In der Zeit Information wird der Fortschritt des Liedes aktualisiert
 */
function onTimelineMove(rangeEvent) {
    let timeInfo = document.getElementById("timeInfo");
    let measurementTimeInfo = timeInfo.getBoundingClientRect();
    let measurementRange = rangeEvent.target.getBoundingClientRect();
    let leftPos = mouseX - (measurementTimeInfo["width"] / 2);

    if (leftPos < 0)
        leftPos = 0;
    else if ((leftPos + measurementTimeInfo["width"]) > getWidth())
        leftPos = getWidth() - measurementTimeInfo["width"];

    timeInfo.style.top = (measurementRange["top"] - measurementTimeInfo["height"] - 10) + "px";
    timeInfo.style.left = leftPos + "px";

    let currentTime = timeInfo.querySelector("#current");
    currentTime.textContent = getMinutesAndSeconds(rangeEvent.target.value);
}

/*
 * Funktion: generatePlaylistInfo()
 * Autor: Bernardo de Oliveira
 * Argumente:
 *  song: (Object) Die Songs, welche in der Playlist sind
 *
 * Generiert ein Cover aus vier Liedern für eine Playlist
 * Generiert die Künstler für die Playlist
 */
function generatePlaylistInfo(song) {
    let info = {"cover": document.createElement("div"), "artists": ""};
    info["cover"].classList.add("cover");

    for (let i = 0; i < 4; i++) {
        let songID = song["playlist"][i];
        let data = tryParseJSON(httpGet(pageURL + "system/song/" + songID));
        info["cover"].innerHTML += "<img src='" + data["cover"] + "' alt='Cover'/>";

        info["artists"] += data["artist"] + ", ";
    }

    info["artists"] = info["artists"].substring(0, info["artists"].length - 2) + " and more..";

    return info;
}

/*
 * Funktion: generateTableHead()
 * Autor: Bernardo de Oliveira
 * Argumente:
 *  columns: (Object) Die Daten, welche verarbeitet werden sollen
 *
 * Generiert eine Tabelle aus den Schlüssel (Table head)
 */
function generateTableHead(columns) {
    let thead = document.createElement("thead");
    let row = document.createElement("tr");

    for (let column of columns) {
        let th = document.createElement("th");
        th.textContent = ucFirst(column);
        row.appendChild(th);
    }
    thead.appendChild(row);
    return thead;
}

/*
 * Funktion: generateTableBody()
 * Autor: Bernardo de Oliveira
 * Argumente:
 *  data: (Object) Die Daten, welche verarbeitet werden sollen
 *  columns: (Array) Definiert die Spalten der Tabelle
 *  tbody: (Object) Definiert den Table Body
 *
 * Erstellt einen Table Body, wenn keiner mitgesendet wird
 * Generiert die Tabellenzeilen aus den Daten
 */
function generateTableBody(data, columns, tbody = null, cover = null) {
    if (!tbody) tbody = document.createElement("tbody");

    for (let row of Object.values(data)) {
        let tableRow = document.createElement("tr");
        if (typeof row["id"] !== 'undefined') tableRow.setAttribute("data-id", row["id"]);
        row = removeFromObject(row, ["id", "category", "player"]);

        generateTableRow(row, tableRow, columns, cover);

        tbody.appendChild(tableRow);
    }

    return tbody;
}

/*
 * Funktion: generateTableRow()
 * Autor: Bernardo de Oliveira
 * Argumente:
 *  rowData: (Object) Definiert die Reihendaten
 *  tableRow: (Object) Definiert die Tabellenreihe
 *  columns: (Array) Definiert die Spaltentitel
 *  cover: (String) Definiert das Sprites Cover, falls vorhanden
 *
 * Generiert die Tabellenzeilen aus den Daten
 *
 * Diese Funktion wird für die Musik Listenansicht und Firewall benutzt
 */
function generateTableRow(rowData, tableRow, columns, cover = null) {
    if (typeof rowData["playlist"] === 'undefined') {
        for (let column of columns) {
            column = column.toLowerCase();

            let element = (typeof rowData[column] !== 'undefined') ? rowData[column] : "";

            if (column === "cover") {
                if (cover !== null) {
                    tableRow.innerHTML += "<td><div class=\"cover\" style=\"background-image: url('" + cover + "'); background-position-x: -" + rowData["coverPos"] / 200 * 35 + "px\"></div></td>";
                } else {
                    tableRow.innerHTML += "<td><img src='" + rowData["cover"] + "' alt='cover' /></td>";
                }
            } else {
                let truncate = document.createElement("div");
                truncate.classList.add("truncate");

                let content = document.createElement("div");
                content.setAttribute("data-title", element);
                content.classList.add("content");
                content.textContent = element;

                switch (element) {
                    case "ACCEPT":
                        content.classList.add("green");
                        break;
                    case "DROP":
                        content.classList.add("red");
                        break;
                }

                let spacer = document.createElement("div");
                spacer.classList.add("spacer");
                spacer.textContent = element;

                let span = document.createElement("span");
                span.innerHTML = "&nbsp;";

                truncate.appendChild(content);
                truncate.appendChild(spacer);
                truncate.appendChild(span);

                let tableData = document.createElement("td");
                tableData.appendChild(truncate);
                tableRow.appendChild(tableData);
            }
        }
    } else {
        let info = generatePlaylistInfo(rowData);
        let td = document.createElement("td");
        td.appendChild(info["cover"]);
        tableRow.appendChild(td);
        tableRow.classList.add("playlist");

        tableRow.innerHTML += "<td>" + rowData["name"] + "</td>" +
            "<td colspan='2'>" +
            "<div class='truncate'>" +
            "<div class='content' data-title='" + info["artists"] + "'>" + info["artists"] + "</div>" +
            "<div class='spacer'>" + info["artists"] + "</div>" +
            "<span>&nbsp;</span>" +
            "</div>" +
            "</td>";
    }
}

/*
 * Funktion: removeFromObject()
 * Autor: Bernardo de Oliveira
 * Argumente:
 *  object: (Object): Das zu bearbeitende Objekt
 *  toRemove: (Object/String): Die Schlüssel die entfernt werden sollen
 *
 * Entfernt ein oder mehrere Schlüssel in einem Objekt, rekursiv
 */
function removeFromObject(object, toRemove = "", recursive = true) {
    let cleaned;

    if (object instanceof Object && object instanceof Array) {
        cleaned = [];

        for (let value of object) {
            if (value !== toRemove && !toRemove.includes(value)) cleaned.push(value);
        }
    } else {
        cleaned = {};

        for (let [key, value] of Object.entries(object)) {

            if (key !== toRemove && !toRemove.includes(key)) {
                if (typeof value === 'object' && recursive) {
                    cleaned[key] = removeFromObject(Object.assign({}, value), toRemove);
                } else {
                    if (!isNum(key)) cleaned[key] = value;
                    else {
                        if (!Array.isArray(cleaned)) cleaned = [];
                        cleaned.push(value);
                    }
                }
            }
        }
    }

    return cleaned;
}

/*
 * Funktion: isNum()
 * Autor: Bernardo de Oliveira
 * Argumente:
 *  val: (String) Definiert die Zeichenkette welche überprüft werden soll
 *
 * isNaN überprüft ob eine Zeichenkette keine Zahl ist
 * Falls es keine ist, wird TRUE zurückgegeben
 * Falls es eine ist, wird FALSE zurückgegeben
 *
 * Durch das Ausrufezeichen vor dem Return negiert die Ausgabe, somit ist eine Zahl TRUE und keine FALSE
 */
function isNum(val) {
    return !isNaN(val);
}

/*
 * Funktion: getColumns()
 * Autor: Bernardo de Oliveira
 * Argumente:
 *  data: (Object) Definiert die assoziativen Daten
 *  level: (Integer) Definiert wie weit gesucht werden soll (Rekursion)
 *  start: (Integer) Definiert die Ebene in welcher beginnt wird
 *
 * Holt die Objekt-Schlüssel aus der angegebenen Ebene
 * Speichert die Schlüssel, welche die grösste Länge haben (am meisten Spalten)
 * Gibt diese zurück
 */
function getColumns(data, level = 0, start = 0) {
    let columns = [];

    for (let value of Object.values(data)) {
        if (typeof value === 'object' && start < level) {
            let tempColumns = getColumns(value, level, start + 1);

            if (tempColumns.length > columns.length) columns = tempColumns;
        }

        if (start >= level) return Object.keys(data);
    }

    return columns;
}

/*
 * Funktion: getCurrentPartTime()
 * Autor: Bernardo de Oliveira
 *
 * Gibt die Position des jetzigen Songteiles zurück
 */
function getCurrentPartTime() {
    try {
        return playlist[playIndex]["player"].playlist.sources[partlist[playIndex][partIndex]["gid"]].getPosition() / 1000;
    } catch (e) {
        return 0;
    }
}

/*
 * Funktion: getPartLength()
 * Autor: Bernardo de Oliveira
 * Argumente:
 *  index: (Integer) Definiert den Teil, von welchem die Länge zurückgegeben werden soll
 *
 * Berechnet sich die Länge vom Teil den man benötigt
 */
function getPartLength(index) {
    return Number((playlist[playIndex]["player"].playlist.sources[index].getLength() / 1000).toFixed());
}

/*
 * Funktion: getPartLengthCallback()
 * Autor: Bernardo de Oliveira
 * Argumente:
 *  index: (Integer) Definiert den Teil, von welchem die Länge zurückgegeben werden soll
 *  callback: (Function) Definiert eine Funktion welche anschliessen ausgeführt wird
 *
 * Berechnet sich die Länge vom Teil den man benötigt
 * Dafür da, wenn neue Lieder hinzugefügt sind, dann sind sie nicht sofort verfügbar
 *
 * Sobald die Länge herausgefunden wurde, wird der Callback mit der Länge ausgeführt
 */
function getPartLengthCallback(index, callback) {
    let length = 0;

    let interval = setInterval(function () {
        if (typeof playlist[playIndex]["player"].playlist.sources[index] !== 'undefined') {
            length = Number((playlist[playIndex]["player"].playlist.sources[index].getLength() / 1000).toFixed());

            if (length) {
                clearInterval(interval);
                callback(length);
            }
        }
    }, 50);
}

/*
 * Funktion: getPartIndexByTime()
 * Autor: Bernardo de Oliveira
 * Argumente:
 *  time: (Integer) Definiert die Zeit, welche der Teil beinhalten soll
 *
 * Sucht den Teil welcher die Zeit beinhaltet
 * Wenn die Startzeit kleiner als time und die Endzeit grösser als time ist
 * Wird dieser Teil zurückgegeben, sonst null
 */
function getPartIndexByTime(time) {
    for (let [index, part] of Object.entries(partlist[playIndex])) {
        if (part["from"] <= time && part["till"] >= time)
            return [part["from"], part["till"], Number(index)];
    }

    return [null, null, null];
}

/*
 * Funktion: getPartIndexByStartTime()
 * Autor: Bernardo de Oliveira
 * Argumente:
 *  time: (Integer) Definiert die Startzeit von einem Teil
 *
 * Sucht ein Teil, welcher mit der gewünschten Zeit beginnt
 * Gibt diesen zurück, sonst null
 */
function getPartIndexByStartTime(time) {
    for (let [index, part] of Object.entries(partlist[playIndex])) {
        if (part["from"] === time)
            return [part["from"], part["till"], Number(index)];
    }

    return [null, null, null];
}

/*
 * Funktion: findMissingLengthByCurrentPart()
 * Autor: Bernardo de Oliveira
 *
 * Berechnet wie viel Sekunden es zum nächsten Teil sind
 * Falls kein nächster Teil verfügbar ist oder es länger geht als der jetzige Teil selbst
 * Wird null zurückgegeben, sonst die Zeit in Sekunden
 */
function findMissingLengthByCurrentPart() {
    let currentLength = getPartLength(partIndex);
    let currentEnding = partlist[playIndex][partIndex]["till"];

    for (let part of Object.values(partlist[playIndex])) {
        let missingLength = part["from"] - currentEnding - 1;

        if (missingLength > 0 && missingLength <= currentLength)
            return missingLength;
    }
    return null;
}