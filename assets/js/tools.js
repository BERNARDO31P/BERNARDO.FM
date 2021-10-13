let currentHover = null,
    secondsInterval = null,
    currentTime = 0,
    playIndex = 0,
    partIndex = 0,
    playlist = [],
    partlist = {},
    volume = 0.5,
    previousVolume = null,
    repeatMode = 0;

let sliderTimeout = null;

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
                        case "mouseout":
                            if (!element.onmouseout) {
                                element.onmouseout = handler;
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
    let player = document.getElementById("player");
    let playerStyle = window.getComputedStyle(player);
    let content = document.getElementById("content");

    let notifications = document.getElementsByClassName("notification");
    for (let i = 0; i < notifications.length; i++) {
        let notification = notifications[i];
        let notificationStyle = window.getComputedStyle(notification);
        let notificationPosition = notification.getBoundingClientRect();

        let bottom = Number(notificationStyle.bottom.replace("px", ""));
        notification.style.bottom = bottom + notificationPosition.height + 5 + "px";
    }

    let notification = document.createElement("div");
    notification.classList.add("notification");

    notification.innerText = message;
    notification.style.left = content.getBoundingClientRect().left + 10 + "px";


    content.parentNode.appendChild(notification);

    notification.animateCallback([
        {opacity: 0},
        {opacity: 1}
    ], {
        duration: 100,
        fill: "forwards"
    }, function () {
        setTimeout(function () {
            notification.animateCallback([
                {opacity: 1},
                {opacity: 0}
            ], {
                duration: 100,
                fill: "forwards"
            }, function () {
                notification.remove();
            });
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
                setTimeout(function () {
                    let position = window.getComputedStyle(notification);

                    notification.animateCallback([
                        {bottom: position.bottom},
                        {bottom: '10px'}
                    ], {
                        duration: 100
                    }, function () {
                        notification.style.bottom = "10px";
                    });
                }, time);
            });
        } else {
            notification.style.bottom = "110px";
        }
    }
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

    let visibleBottom = holderRect.bottom - elRect.top >= elRect.height - 2;
    let visibleTop = elRect.top - holderRect.top >= 0;

    return !(!visibleTop || !visibleBottom);
}

/*
 * Funktion: isTouchScreen()
 * Autor: Daniel Lavedonio de Lima (https://stackoverflow.com/questions/36408960/check-if-click-was-triggered-by-touch-or-click)
 *
 * Überprüft ob der Benutzer irgendwo momentan mit der Maus ist, wenn nicht ist es ein Touchgerät
 */
function isTouchScreen() {
    return window.matchMedia('(hover: none)').matches;
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
 * Argumente:
 *  elementID: (String) Defineirt das Objekt
 *
 * Versteckt beim Scrollen die Liedoptionen
 */
function removeControls(elementID) {
    let controls = document.getElementById(elementID);

    if (typeof controls !== 'undefined' && controls.style.display !== "none")
        controls.style.display = "none";
}

/*
 * Funktion: setVolumeIcon()
 * Autor: Bernardo de Oliveira
 * Argumente:
 *  volumeIcon: (Objekt) Definiert das Lautstärke Symbol
 *  volumeSlider: (Objekt) Definiert den Lautstärkeregler
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
    }, 2000);
}

/*
 * Funktion: hidePlaylist()
 * Autor: Bernardo de Oliveira
 * Argumente:
 *  body: (Objekt) Definiert das Body-Objekt
 *  playlistView: (Objekt) Definiert die Playlist
 *  angleIcon: (Objekt) Definiert das Icon von der Playlist
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
        {height: 'calc(100% - 200px)'},
        {height: '0%'}
    ], {
        duration: 300,
        fill: "forwards",
    }, function () {
        queueView.classList.remove("show");
    });

    angleIcon.setAttribute("data-angle", "down");
}

/*
 * Funktion: generateTable()
 * Autor: Bernardo de Oliveira
 * Argumente:
 *  data: (Object) Die Daten, welche verarbeitet werden sollen
 *  categories: (Boolean) Definiert ob die Categorien angezeigt werden sollen
 *  scroll: (Boolean) Definiert ob die Scroll-Events angewendet werden sollen
 *
 * Generiert eine Tabelle aus den Daten (Table body) und Schlüssel (Table head)
 */
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

    if (scroll) tbody.onscroll = () => {
        removeControls("controlsQueue");
    };

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
        row.innerHTML = "<td><img src='/system/img/" + song["cover"] + "' alt='Cover'/></td>" +
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
function play(diffSong = false) {
    let player = document.getElementById("player"),
        cover = document.getElementById("queueView").querySelector("#playingCover").querySelector("img");

    let song = playlist[playIndex];
    let gapless = song["player"];

    if (diffSong) {
        let split = song["length"].split(":"), length = Number(split[0]) * 60 + Number(split[1]);
        let songLength = document.getElementById("tooltip").querySelector("#length");

        cover.src = "/system/img/" + song["cover"];
        songLength.innerText = song["length"];
        player.querySelector("#name").innerText = song["name"];
        player.querySelector("#artist").innerText = song["artist"];
        player.querySelector("#timeline").max = length;
    }

    gapless.setGain(volume * 65535);
    gapless.play();

    playPauseButton(true);
    player.style.display = "initial";

    secondsInterval = setInterval(function () {
        let timeline = document.getElementById("timeline");

        timeline.value = getCurrentPartTime() + currentTime;
    }, 1000);
}

/*
 * Funktion: nextSongIndex()
 * Autor: Bernardo de Oliveira
 *
 * Holt sich die Array ID des nächsten Liedes
 */
function nextSongIndex() {
    let nextIndex = playIndex + 1;
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
    let previousIndex = playIndex - 1;
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
 * Funktion: getCurrentPartLength()
 * Autor: Bernardo de Oliveira
 *
 * Gibt die Länge des jetzigen Songteiles zurück
 */
function getCurrentPartLength() {
    try {
        return playlist[playIndex]["player"].sources[partlist[playIndex][partIndex]].getLength() / 1000;
    } catch (e) {
        return 20;
    }
}

/*
 * Funktion: getCurrentPartTime()
 * Autor: Bernardo de Oliveira
 *
 * Gibt die Position des jetzigen Songteiles zurück
 */
function getCurrentPartTime() {
    try {
        return playlist[playIndex]["player"].sources[partlist[playIndex][partIndex]].getPosition() / 1000;
    } catch (e) {
        return 0;
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
    playlist[index]["player"].stop();
    playlist[index]["player"].removeAllTracks();
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
    playlist[index]["player"].stop();
    playlist[index]["player"].gotoTrack(0);

    for (let key in partlist[index]) {
        let value = partlist[index][key];
        playlist[index]["player"].sources[value].setPosition(0);
    }
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
    resetSong(playIndex);

    currentTime = 0;
    partIndex = 0;

    clearInterval(secondsInterval);
    playPauseButton(false);

    let nextIndex = nextSongIndex();
    if (typeof playlist[nextIndex] !== 'undefined') {
        playIndex = nextIndex;
        play(true);
    }
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
    resetSong(playIndex);

    currentTime = 0;
    partIndex = 0;

    clearInterval(secondsInterval);
    playPauseButton(false);

    let previousIndex = previousSongIndex();
    if (typeof playlist[previousIndex] !== 'undefined') {
        playIndex = previousIndex;
        play(true);
    }
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