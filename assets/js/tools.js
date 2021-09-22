let currentHover = null,
    secondsInterval = null,
    currentTime = 0,
    playIndex = 0,
    playlist = {},
    shuffle = false;

let pageURL = window.location.protocol + "//" + window.location.host + new URL(window.location).pathname;
let page, prevPage, mouseX = 0, mouseY = 0;
const mobileWidth = 1150;

let theme = getCookie("theme");
if (!theme)
    theme = "light";

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
 *  eventNames: (String) Eventname z.B. click
 *  selector: (String) Den Elementselector z.B. die ID oder Klasse usw.
 *  handler: (Objekt) Die Funktion welche ausgeführt werden soll
 *
 * Ist das Äquivalent zu .on(eventNames, selector, handler) in jQuery
 */
const bindEvent = (eventNames, selectors, handler) => {
    eventNames.split(', ').forEach((eventName) => {
        document.addEventListener(eventName, function (event) {
            selectors.split(', ').forEach((selector) => {
                if (event.target.matches(selector + ', ' + selector + ' *')) {
                    let element = event.target.closest(selector);

                    switch (eventName) {
                        case "click":
                            if (!element.onclick) {
                                element.onclick = handler;
                                handler.apply(element, arguments);
                            }
                            break;
                        case "play":
                            if (!element.onplay) {
                                element.onplay = handler;
                                handler.apply(element, arguments);
                            }
                            break;
                        case "timeupdate":
                            if (!element.ontimeupdate) {
                                element.ontimeupdate = handler;
                                handler.apply(element, arguments);
                            }
                            break;
                        default:
                            handler.apply(element, arguments);
                            break;
                    }
                }
            });
        }, false);
    });
};

document.addEventListener("mouseover", function (e) {
    currentHover = e.target;
});

/*
 * Funktion: prev()
 * Autor: Bernardo de Oliveira
 * Argumente:
 *  element: (Objekt) Das Element welches geprüft werden soll
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
 * Funktion: shuffleObject()
 * Autor: Bernardo de Oliveira
 * Argumente:
 *  object: (Objekt) Das Element welches durchgemischt werden soll
 *
 * Mischt ein Objekt durch (shuffle)
 */
function shuffleObject(object) {
    let length = Object.keys(object).length;
    for (let i = 0; i < length - 1; i++) {
        let j = i + Math.floor(Math.random() * (length - i));

        let temp = object[j];
        object[j] = object[i];
        object[i] = temp;
    }
    return object;
}

/*
 * Funktion: isElementVisible()
 * Autor: Bernardo de Oliveira
 * Argumente:
 *  el: (Objekt) Das zu überprüfende Objekt
 *  holder: (Objekt) Das Element in welchem sich das zu überprüfende Element befinden
 *
 * Überprüft ob ein Element sichtbar ist
 */
function isElementVisible(el, holder = undefined) {
    holder = holder || document.body;
    const elRect = el.getBoundingClientRect();
    const holderRect = holder.getBoundingClientRect();

    let visibleBottom = holderRect.bottom - elRect.top >= elRect.height;
    let visibleTop = elRect.top - holderRect.top >= 0;

    return !(!visibleTop || !visibleBottom);
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
    return string.charAt(0).toUpperCase() + string.slice(1);
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
 * Funktion: removeControls()
 * Autor: Bernardo de Oliveira
 *
 * Versteckt beim Scrollen die Liedoptionen
 */
function removeControls (elementID) {
    let controls = document.getElementById(elementID);

    if (typeof controls !== 'undefined' && controls.style.display !== "none")
        controls.style.display = "none";
}

// TODO: Comment
function generateTable(data, categories = true, scroll = false) {
    let listView = document.createElement("table");

    let columns = Object.keys(data[0]);
    columns.shift();
    columns.pop();

    listView.classList.add("listView");

    let row = document.createElement("tr");
    for (let j = 0; j < columns.length; j++) {
        let th = document.createElement("th");
        th.innerText = ucFirst(columns[j]);
        row.appendChild(th);
    }

    let thead = document.createElement("thead");
    thead.appendChild(row);

    listView.appendChild(thead);

    let tbody = document.createElement("tbody"), category;

    if (scroll) tbody.onscroll = () => {removeControls("controlsPlaylist")};

    for (let j = 0; j < Object.keys(data).length; j++) {
        let song = data[j];

        if (category !== song["category"] && categories) {
            category = song["category"];

            let row = document.createElement("tr");

            row.innerHTML = "<td colspan='4'>" + category + "</td>";
            tbody.appendChild(row);
        }

        let row = document.createElement("tr");
        row.setAttribute("data-id", song["id"]);
        row.innerHTML = "<td><img src='" + song["cover"] + "' alt='Cover'/></td>" +
            "<td>" + song["name"] + "</td>" +
            "<td>" + song["artist"] + "</td>" +
            "<td>" + song["length"] + "</td>";

        tbody.appendChild(row);
    }

    listView.appendChild(tbody);
    return listView;
}

/*
 * Funktion: play()
 * Autor: Bernardo de Oliveira
 *
 * Fügt die neuen Liedinformationen in den Player ein
 * Beginnt die Wiedergabe
 * Erstellt eine Schleife, welche jede Sekunde sich wiederholt und den Fortschritt ins Tooltip einfügt
 */
function play() {
    let player = document.getElementById("player"),
        cover = document.getElementById("playlistView").querySelector("#playingCover").querySelector("img");

    let song = playlist[playIndex];
    let gapless = song["player"];
    let split = song["length"].split(":"), length = Number(split[0]) * 60 + Number(split[1]);
    let songLength = document.getElementById("tooltip").querySelector("#length");

    cover.src = song["cover"];
    songLength.innerText = song["length"];
    player.querySelector("#name").innerText = song["name"];
    player.querySelector("#artist").innerText = song["artist"];
    player.querySelector("#timeline").max = length;

    gapless.play();

    playPauseButton(true);
    player.style.display = "initial";

    secondsInterval = setInterval(function () {
        let timeline = document.getElementById("timeline");

        timeline.value = getPartTime(1) + currentTime;
    }, 1000);
}

/*
 * Funktion: nextSongIndex()
 * Autor: Bernardo de Oliveira
 *
 * Holt sich die Array ID des nächsten Liedes
 */
function nextSongIndex() {
    let found = false;

    for (let key in playlist) {
        key = Number(key);

        if (found)
            return key;

        if (key === playIndex)
            found = true;
    }
}

/*
 * Funktion: previousSongIndex()
 * Autor: Bernardo de Oliveira
 *
 * Holt sich die Array ID des vorherigen Liedes
 */
function previousSongIndex() {
    let found = false, previous;

    for (let key in playlist) {
        key = Number(key);

        if (found)
            return previous;

        if (key === playIndex)
            found = true;
        else
            previous = key;
    }

    return previous;
}

/*
 * Funktion: playPauseButton()
 * Autor: Bernardo de Oliveira
 * Argumente:
 *  play: (Boolean) Definiert ob gerade abgespielt wird
 *
 * Ändert das Icon von "abspielen/pausieren"
 */
function playPauseButton(play = false) {
    let player = document.getElementById("player");
    let playButton = player.querySelector(".fa-play");
    let pauseButton = player.querySelector(".fa-pause");

    if (playButton !== null && play) {
        playButton.classList.remove("fa-play");
        playButton.classList.add("fa-pause");
    } else if (pauseButton !== null && !play) {
        pauseButton.classList.remove("fa-pause");
        pauseButton.classList.add("fa-play");
    }
}

/*
 * Funktion: getPartLength()
 * Autor: Bernardo de Oliveira
 * Argumente:
 *  minus: (Integer) Definiert wie viele Songteile zurück
 *
 * Gibt die Länge eines Songteiles zurück
 */
function getPartLength(minus) {
    let partIndex = playlist[playIndex]["player"].trk.trackNumber - minus;

    return playlist[playIndex]["player"].sources[partIndex].getLength() / 1000;
}

/*
 * Funktion: getPartTime()
 * Autor: Bernardo de Oliveira
 * Argumente:
 *  minus: (Integer) Definiert wie viele Songteile zurück
 *
 * Gibt die Position eines Songteiles zurück
 */
function getPartTime(minus) {
    let partIndex = playlist[playIndex]["player"].trk.trackNumber - minus;

    return playlist[playIndex]["player"].sources[partIndex].getPosition() / 1000;
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
    playlist[index]["player"].stop();
    playlist[index]["player"].removeAllTracks();
}

/*
 * Funktion: nextSong()
 * Autor: Bernardo de Oliveira
 *
 * Überprüft ob weitere Lieder in der Wiedergabenliste verfügbar sind
 * Falls dies der Fall sein sollte, wird der Playindex um eine ID inkrementiert
 *
 * Die Wiedergabe wird gestartet
 */
function nextSong() {
    playlist[playIndex]["player"].stop();

    let nextIndex = nextSongIndex();

    if (typeof playlist[nextIndex] !== "undefined")
        playIndex = nextIndex;

    currentTime = 0;

    clearInterval(secondsInterval);
    playPauseButton(false);
    play();
}

/*
 * Funktion: previousSong()
 * Autor: Bernardo de Oliveira
 *
 * Überprüft ob weitere Lieder in der Wiedergabenliste verfügbar sind
 * Falls dies der Fall sein sollte, wird der Playindex um eine ID dekrementiert
 *
 * Die Wiedergabe wird gestartet
 */
function previousSong() {
    playlist[playIndex]["player"].stop();

    let previousIndex = previousSongIndex();

    if (typeof playlist[previousIndex] !== "undefined")
        playIndex = previousIndex;

    currentTime = 0;

    clearInterval(secondsInterval);
    playPauseButton(false);
    play();
}

/*
 * Funktion: pauseSong()
 * Autor: Bernardo de Oliveira
 *
 * Pausiert die Wiedergabe
 */
function pauseSong() {
    playPauseButton(false);

    playlist[playIndex]["player"].pause();
    clearInterval(secondsInterval);
}

/*
 * Funktion: playSong()
 * Autor: Bernardo de Oliveira
 *
 * Beginnt die Wiedergabe
 */
function playSong() {
    play();
}

/*
 * Funktion: onTimelinePress()
 * Autor: Bernardo de Oliveira
 *
 * Sobald die Timeline angedrückt wird, wird das tooltip mit dem jetzigen Fortschritt des Liedes angezeigt
 * Die Wiedergabe wird pausiert
 */
function onTimelinePress() {
    let tooltip = document.getElementById("tooltip");
    tooltip.style.display = "initial";

    clearInterval(secondsInterval);
    playPauseButton(false);
    playlist[playIndex]["player"].pause();
}

/*
 * Funktion: onTimelineMove()
 * Autor: Bernardo de Oliveira
 * Argumente:
 *  rangeEvent: (Event) Das ausgelöste Ereignis
 *
 * Das Tooltip wird an die letzte bekannte Position der Maus verschoben
 * Im Tooltip wird der Fortschritt des Liedes aktualisiert
 */
function onTimelineMove(rangeEvent) {
    let tooltip = document.getElementById("tooltip");
    let measurementTooltip = tooltip.getBoundingClientRect();
    let measurementRange = rangeEvent.target.getBoundingClientRect();
    let leftPos = mouseX - (measurementTooltip["width"] / 2);

    if (leftPos < 0)
        leftPos = 0;
    else if ((leftPos + measurementTooltip["width"]) > getWidth())
        leftPos = getWidth() - measurementTooltip["width"];

    tooltip.style.top = (measurementRange["top"] - measurementTooltip["height"] - 10) + "px";
    tooltip.style.left = leftPos + "px";

    let currentTimestamp = tooltip.querySelector("#current");
    currentTimestamp.innerText = getMinutesAndSeconds(rangeEvent.target.value);
}

/*
 * Funktion: onTimelineRelease()
 * Autor: Bernardo de Oliveira
 *
 * Sobald die Timeline wieder losgelassen wird, wird das tooltip mit dem jetzigen Fortschritt des Liedes versteckt
 * Die Wiedergabe beginnt
 */
function onTimelineRelease() {
    let tooltip = document.getElementById("tooltip");
    tooltip.style.display = "none";

    play();
}