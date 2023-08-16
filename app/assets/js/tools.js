const audioContext = new (window.AudioContext || window.webkitAudioContext)();

let currentHover = null, playIndex = 0, nextPlayIndex = 0, partIndex = 0, nextPartIndex = 0, playlist = [],
    partlist = {}, volume = 0, previousVolume = null, repeatMode = 0,
    touched = null, contextTimeout = null, touchTimeout = null, touchedElement = null, currentButton = null,
    changedQueue = false, width = getWidth(), height = getHeight() + 100;

const defaultDelay = 500;

let backgroundProcesses = [];
let sliderTimeout = null, searchTimeout = null;
let pageURL = window.location.protocol + '//' + window.location.host + new URL(window.location).pathname;
let page, prevPage, mouseX = 0, mouseY = 0;
let seekValue = 0;

let clickEvent = new Event('click', {
    bubbles: true,
    cancelable: true,
});

/*
 * Autor: Bernardo de Oliveira
 *
 * Das Design wird in einem Cookie gespeichert
 * Hier wird dieser ausgelesen und das Design angewendet
 */
let theme = getCookie('theme');
if (!theme) theme = 'light';
document.getElementsByTagName("html")[0].setAttribute("data-theme", theme);

// TODO: Comment
HTMLElement.prototype.animateCallback = function (keyframes, options, callback) {
    let animation = this.animate(keyframes, options);

    animation.onfinish = function () {
        callback();
    }
}

// TODO: Comment
function deleteMultiple(object, toDelete) {
    for (const id of toDelete) {
        delete object[id];
    }
}

/*
 * Funktion: onkeydown()
 * Autor: Bernardo de Oliveira
 *
 * Zuweisung von verschiedenen Tasten
 * Somit kann man z.B. die Wiedergabe mit der Leertaste starten/stoppen
 */
document.onkeydown = function (e) {
    let keys = ["K", "Space", "M", "ArrowLeft", "ArrowRight", "J", "L", "R", "S", "ArrowUp", "ArrowDown"];
    let key = e.code.replace("Key", "");

    if (!(document.activeElement instanceof HTMLInputElement)) {
        if (keys.includes(key)) {
            e.preventDefault();

            const playerHTML = document.getElementById("player");
            const song = playlist[playIndex];

            if (typeof song === "undefined") return;

            const player = song["player"];
            switch (key) {
                case "R":
                    let repeatButton = playerHTML.querySelector(".repeat");
                    repeatButton.dispatchEvent(clickEvent);

                    break;
                case "S":
                    let shuffleButton = playerHTML.querySelector(".fa-random");
                    shuffleButton.dispatchEvent(clickEvent);

                    break;
                case "K":
                case "Space":
                    if (player.isPlaying())
                        pauseSong();
                    else
                        play();
                    break;
                case "M":
                    muteAudio();
                    break;
                case "ArrowLeft":
                    onTimelineRelease(player.getCurrentTime() - 5);
                    break;
                case "ArrowRight":
                    onTimelineRelease(player.getCurrentTime() + 5);
                    break;
                case "J":
                    onTimelineRelease(player.getCurrentTime() - 10);
                    break;
                case "L":
                    onTimelineRelease(player.getCurrentTime() + 10);
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
    if (typeof eventNames !== 'string' || typeof selectors !== 'string' || typeof handler !== 'function') {
        throw new Error('Invalid arguments: eventNames and selectors must be strings, and handler must be a function.');
    }

    const eventNameArray = eventNames.split(',').map(eventName => eventName.trim());
    const selectorArray = selectors.split(',').map(selector => selector.trim());

    eventNameArray.some(eventName => {
        document.addEventListener(eventName, function (event) {
            selectorArray.some(selector => {
                if (event.target.matches(selector + ', ' + selector + ' *')) {
                    const element = event.target.closest(selector);
                    handler.bind(this);
                    handler.call(element, event);

                    event.stopImmediatePropagation();
                    return true;
                }
            });
        }, false);
    });
};

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

    if (!className || prev.classList.contains(className)) return prev;
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
        xmlHttp.withCredentials = new URL("/", url).host === location.host;
    } catch (e) {
        xmlHttp.withCredentials = true;
    }

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
 * Funktion: clearURL()
 * Autor: Bernardo de Oliveira
 *
 * Löscht alle Parameter aus der URL
 */
function clearURL() {
    location.replace(removeGetParameter(location.href, "s"));
    location.replace(removeGetParameter(location.href, "t"));
    location.replace(removeGetParameter(location.href, "p"));
}

/*
 * Funktion: updatePlaying()
 * Autor: Bernardo de Oliveira
 *
 * Sucht das Lied, welches momentan abgespielt wird
 * Fügt eine Animation hinzu
 *
 * Scrollt zum Lied, welches momentan abgespielt wird
 */
function updatePlaying() {
    const queueView = document.getElementById("queueView");

    const song = playlist[playIndex];
    let row = null;

    const table = queueView.querySelector(".responsive-table");
    if (table) row = table.rows[playIndex + 1];


    if (row && typeof song["player"] !== "undefined") {
        let animation = queueView.querySelector(".lds-facebook");
        const animationRow = animation ? animation.closest("tr") : null;

        if (animationRow !== row) {
            if (animation) animation.remove();

            animation = createElementFromHTML("<div class=\"lds-facebook\"><div></div><div></div><div></div></div>");
            row.querySelector("td").appendChild(animation);
        }

        const divs = row.querySelector(".lds-facebook").querySelectorAll("div");
        if (song["player"].isPlaying()) for (const div of divs) div.style.animationPlayState = "running";
        else for (const div of divs) div.style.animationPlayState = "paused";

        const queue = queueView.querySelector("#queue");
        const imageStyle = window.getComputedStyle(row.querySelector(".cover"));

        const queueBounding = queue.getBoundingClientRect(), rowBounding = row.getBoundingClientRect();
        const top = rowBounding.height + queueBounding.top;

        const marginTop = Number(imageStyle.marginTop.replace("px", ""));
        const scroll = rowBounding.top - top - (marginTop * 2);

        queue.scrollBy(0, scroll);
        queueView.querySelector("#info").scrollTo(0, 0);
    }

    const angleUp = document.getElementsByClassName("fa-angle-up")[0];

    if (angleUp.getAttribute("data-angle") === "up")
        location.replace(setGetParameter(location.href, "s", playlist[playIndex]["id"]));
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
 * Funktion: showConfirmation()
 * Autor: Bernardo de Oliveira
 * Argumente:
 *  title: (String) Definiert den Titel der Benachrichtigung
 *  message: (String) Definiert die Nachricht in der Benachrichtigung
 *
 * Zeigt eine Bestätigungsanfrage welche akzeptiert oder abgelehnt werden kann
 * Gibt die Antwort zurück
 */
function showConfirmation(title, message, acceptCallback = () => {
}, cancelCallback = () => {
}) {
    let body = document.getElementsByTagName("body")[0];
    let transparent = document.getElementById('transparent');
    let confirmation = document.getElementById("confirmation");
    let titleElement = confirmation.querySelector(".title");
    let messageElement = confirmation.querySelector(".message");

    let okButton = confirmation.querySelector(".ok");
    let cancelButton = confirmation.querySelector(".cancel");

    titleElement.textContent = title;
    messageElement.textContent = message;
    transparent.style.display = "block";
    body.style.overflow = "hidden";

    function accept() {
        okButton.removeEventListener("click", accept);
        cancelButton.removeEventListener("click", cancel);

        hideConfirmation();

        acceptCallback();
    }

    function cancel() {
        okButton.removeEventListener("click", accept);
        cancelButton.removeEventListener("click", cancel);

        hideConfirmation();

        cancelCallback();
    }

    okButton.addEventListener("click", accept);
    cancelButton.addEventListener("click", cancel);
}

// TODO: Comment
function hideConfirmation() {
    let body = document.getElementsByTagName("body")[0];
    let transparent = document.getElementById('transparent');

    transparent.style.display = "none";
    body.style.overflow = "initial";
}

// TODO: Comment
function createElementFromHTML(htmlString) {
    const div = document.createElement('div');
    div.innerHTML = htmlString.trim();

    return div.firstChild;
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

    notification.animateCallback([{opacity: 0}, {opacity: 1}], {
        duration: 100, fill: "forwards"
    }, function () {
        timeoutOpacity = setTimeout(() => {
            removeOpacityNotification(notification);
        }, time);
    });

    if (playerStyle.display !== "none") {
        if (getWidth() > 500) {
            notification.animateCallback([{bottom: '10px'}, {bottom: '110px'}], {
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
    notification.animateCallback([{opacity: 1}, {opacity: 0}], {
        duration: 100, fill: "forwards"
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

    notification.animateCallback([{bottom: position.bottom}, {bottom: '10px'}], {
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
    return 'ontouchstart' in window
        || navigator.maxTouchPoints;
}

/*
 * Funktion: getWidth()
 * Autor: Bernardo de Oliveira
 *
 * Gibt die Browser Breite zurück
 */
function getWidth() {
    return Math.max(document.body.scrollWidth, document.documentElement.scrollWidth, document.body.offsetWidth, document.documentElement.offsetWidth, document.documentElement.clientWidth);
}

/*
 * Funktion: getHeight()
 * Autor: Bernardo de Oliveira
 *
 * Gibt die Browser Höhe zurück
 */
function getHeight() {
    return Math.max(document.body.scrollHeight, document.documentElement.scrollHeight, document.body.offsetHeight, document.documentElement.offsetHeight, document.documentElement.clientHeight);
}

/*
 * Funktion: hasGetParameter()
 * Autor: Bernardo de Oliveira
 * Argumente:
 *  url: (String) Definiert die zu überprüfende URL-Adresse
 *  parameter: (String) Definiert den zu überprüfenden Parameter
 *
 * Überprüft ob der Parameter in der URL vorhanden ist
 */
function hasGetParameter(url, parameter) {
    let parameters = url.split('#!')[1];
    let includes = false;

    if (parameters) {
        let parameterArr = parameters.split('&');

        parameterArr.forEach(function (singlePair) {
            let pair = singlePair.split("=");
            if (pair[0] === parameter) {
                includes = true;
            }
        });
    }
    return includes;
}

/*
* Funktion: getGetParameters()
* Autor: Bernardo de Oliveira
* Argumente:
*  url: (String) Definiert die zu bearbeitende URL-Adresse
*
* Sucht alle GET Parameter und gibt diese als Objekt zurück
*/
function getGetParameters(url) {
    let parameters = url.split('#!')[1], parameterArr = [], output = {};
    if (parameters) {
        parameterArr = parameters.split('&');

        if (parameterArr.length) {
            Object.values(parameterArr).forEach(parameterPair => {
                let pair = parameterPair.split('=');
                output[pair[0]] = pair[1];
            });
        }
    }

    return output;
}

function getGetParameter(url, parameter) {
    let parameters = getGetParameters(url);

    return parameters[parameter] ?? null;
}

/*
 * Funktion: setGetParameter()
 * Autor: Bernardo de Oliveira
 * Argumente:
 *  url: (String) Definiert die zu bearbeitende URL-Adresse
 *  parameter: (String) Definiert den zu setztenden GET Parameter
 *  value: (String) Definiert den Wert von diesem Parameter
 *
 * Setzt ein GET Parameter mit einem Wert
 * Entspricht dem HTTP-GET Standard
 */
function setGetParameter(url, parameter, value) {
    if (hasGetParameter(url, parameter))
        url = removeGetParameter(url, parameter);

    if (!url.includes("#!"))
        url += "#!";

    if (!url.endsWith("!") && !url.endsWith("&"))
        url += "&";

    if (value) {
        return url + parameter + "=" + value;
    } else {
        if (url.endsWith("&") || url.endsWith("!")) {
            return url.slice(0, -1);
        } else {
            return url;
        }
    }
}

/*
 * Funktion: removeGetParameters()
 * Autor: Bernardo de Oliveira
 * Argumente:
 *  url: (String) Definiert die zu bearbeitende URL-Adresse
 *
 * Entfernt alle GET Parameter
 */
function removeGetParameters(url) {
    return url.split('#!')[0];
}

/*
 * Funktion: removeGetParameter()
 * Autor: Bernardo de Oliveira
 * Argumente:
 *  url: (String) Definiert die zu bearbeitende Adresse
 *  parameter: (String) Definiert den zu entfernenden Parameter
 *
 * Entfernt alle Parameter
 * Sucht alle Parameter, welche nicht gesucht werden
 * Fügt diese zur URL wieder hinzu
 */
function removeGetParameter(url, parameter) {
    let cleanUrl = removeGetParameters(url) + "#!";
    let parameters = url.split('#!')[1] ?? "";
    let parameterArr = parameters.split('&') ?? {};
    let parameterNum = parameterArr.length, count = 1;

    if (parameters) {
        parameterArr.forEach(function (singlePair) {
            let pair = singlePair.split("=");
            if (pair[0] !== parameter) {
                cleanUrl += pair[0] + "=" + pair[1];
                if (parameterNum !== count && !cleanUrl.endsWith("&"))
                    cleanUrl += "&";
            }
            count++;
        });
    }

    if (cleanUrl.endsWith("&"))
        cleanUrl = cleanUrl.slice(0, -1);

    if (cleanUrl.endsWith("!"))
        cleanUrl = cleanUrl.slice(0, -2);

    return cleanUrl;
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
    document.cookie = `${name}=${value}; Expires=${expiresAt}; Path=/; SameSite=Lax`;
}

/*
 * Funktion: getExpireTime()
 * Autor: Bernardo de Oliveira
 * Argumente:
 *  days: (Integer) Definiert die Anzahl Tage
 *
 * Gibt das Ablaufdatum zurück (Cookie) als UTC String
 */
function getExpireTime(days) {
    const now = new Date();
    const time = now.getTime();
    const expireTime = time + 1000 * (86400 * days);
    now.setTime(expireTime);

    return now.toUTCString();
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
function getReadableTime(time) {
    const date = new Date(0);
    date.setSeconds(time);
    return date.toISOString().substring(11, 19);
}

/*
 * Funktion: createIconElement()
 * Autor: Bernardo de Oliveira
 * Argumente:
 *  classes: (String) Definiert die Klassen, welche dem Objekt zugewiesen werden
 *  title: (String) Definiert den Titel des Objekts
 *
 * Erstellt ein Icon Element
 */
function createIconElement(classes, title = "") {
    const icon = document.createElement('i');
    icon.className = classes;
    icon.title = title;
    return icon;
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

    if (volumeSlider.value >= 50)
        volumeIcon.classList.add("fa-volume-up");
    else if (volumeSlider.value >= 1)
        volumeIcon.classList.add("fa-volume-down");
    else
        volumeIcon.classList.add("fa-volume-off");
}

/*
 * Funktion: hideVolumeSlider()
 * Autor: Bernardo de Oliveira
 *
 * Versteckt den Lautstärkeregler
 */
function hideVolumeSlider(timeout = 2000) {
    clearTimeout(sliderTimeout);
    sliderTimeout = setTimeout(function () {
        document.getElementsByClassName("volumeBackground")[0].classList.remove("show");
        touched = false;
    }, timeout);
}

/*
 * Funktion: hidePlaylist()
 * Autor: Bernardo de Oliveira
 * Argumente:
 *
 * Versteckt die Playlist-Ansicht
 */
function hidePlaylist() {
    const queueView = document.getElementById("queueView"),
        body = document.getElementsByTagName("body")[0],
        angleIcon = document.getElementsByClassName("fa-angle-up")[0];

    if (angleIcon.getAttribute("data-angle") !== "down") {
        angleIcon.setAttribute("data-angle", "down");

        body.style.overflowY = "initial";

        angleIcon.animate([{transform: 'rotate(-180deg)'}, {transform: 'rotate(0deg)'}], {
            duration: 200, fill: "forwards"
        });

        queueView.animateCallback([{top: '60px'}, {top: '100%'}], {
            duration: 300, fill: "forwards",
        }, function () {
            queueView.classList.remove("show");
        });
    }
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
    setCookie("volume", volume, getExpireTime(8));
    setCookie("muted", false, getExpireTime(8));

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
function muteAudio() {
    if (!isTouchScreen() || touched === true) {
        let volumeSlider = document.getElementById("player").querySelector(".volumeSlider"),
            volumeIcon = prev(volumeSlider.closest(".volumeBackground"));

        if (previousVolume) {
            volumeSlider.value = previousVolume * 100;
            setVolumeIcon(volumeIcon, volumeSlider);
            volume = previousVolume;
            previousVolume = null;
            setCookie("muted", false, getExpireTime(8));
        } else {
            volumeIcon.classList.remove("fa-volume-*");
            volumeIcon.classList.add("fa-volume-mute");
            previousVolume = volume;
            volumeSlider.value = volume = 0;
            setCookie("muted", true, getExpireTime(8));
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

    if (getWidth() <= 345) width = getWidth() - 155 + "px";
    else if (getWidth() <= 500) width = getWidth() - 225 + "px";
    else if (getWidth() <= 1150) width = getWidth() - 290 + "px";

    input.style.width = width;
    input.classList.add("show");

    input.focus();
    document.getElementById("menu").classList.remove("show");
}

/*
 * Funktion: getLengthByString()
 * Autor: Bernardo de Oliveira
 * Argumente:
 *  stringTime: (String) Die Zeit als Text [hh:mm:ss]
 *
 * Nimmt die Textzeit und teilt diese beim Doppelpunkt auf
 * Gibt die Zeit in Sekunden zurück
 */
function getLengthByString(stringTime) {
    let split = stringTime.split(":"), length = 0;

    switch (split.length) {
        case 1:
            length = Number(split[0]);
            break;
        case 2:
            length = Number(split[0]) * 60 + Number(split[1]);
            break;
        case 3:
            length = Number(split[0]) * 60 * 60 + Number(split[1]) * 60 + Number(split[2]);
            break;
    }

    return length;
}

// TODO: Comment
function updateSongData() {
    let song = playlist[playIndex];
    let length = getLengthByString(song["length"]);

    let songLength = document.querySelector("#timeInfo #length");
    let queueView = document.getElementById("queueView");
    let cover = queueView.querySelector("#playingCover .cover");
    let size = Math.round(width / 100 * 90);

    let heightCalc;
    if (height + 100 < width) heightCalc = height / 2 + 100;
    else heightCalc = height / 2 - 200;

    size = (size < 1024 && heightCalc > size) ? size : Math.round(heightCalc);

    cover.style.backgroundImage = "url('" + song["cover"] + "?size=" + size + "')";
    cover.style.width = size + "px";
    cover.style.height = size + "px";

    songLength.textContent = song["length"];

    let playerHTML = document.getElementById("player");
    playerHTML.querySelector("#timeline").max = length;
    playerHTML.querySelector("#name").innerHTML = "<div class='truncate'>" + "<div class='content' title='" + song["name"] + "'>" + song["name"] + "</div>" + "<div class='spacer'>" + song["name"] + "</div>" + "<span>&nbsp;</span>" + "</div>";
    playerHTML.querySelector("#artist").innerHTML = "<div class='truncate'>" + "<div class='content' title='" + song["artist"] + "'>" + song["artist"] + "</div>" + "<div class='spacer'>" + song["artist"] + "</div>" + "<span>&nbsp;</span>" + "</div>";
    playerHTML.style.display = "initial";

    let data = tryParseJSON(httpGet(pageURL + "system/info/" + song["id"]));
    let infoBox = queueView.querySelector("#info");

    if (Object.keys(data).length) {
        infoBox.innerHTML = "";
        for (let info of Object.values(data)) {
            infoBox.innerHTML += `<h3>${info["name"]}</h3><p>${info["description"]}</p>`;
        }
    } else {
        infoBox.innerHTML = "<h3>No description found.</h3>";
    }

    updatePlaying();
}

/*
 * Funktion: play()
 * Autor: Bernardo de Oliveira
 *
 * Fügt die neuen Informationen vom Lied in den Player ein und in die MediaSession API ein
 * Beginnt die Wiedergabe
 */
function play(diffSong = false, pageLoad = false) {
    const player = playlist[playIndex]["player"];

    if (diffSong) {
        let song = playlist[playIndex];
        let title = document.querySelector("title");
        title.textContent = song["name"] + " - " + title.textContent.split(" - ")[1];

        if (!document.hidden) updateSongData();

        player.setMetadata(song["name"], song["artist"], song["cover"]);
        player.setActionHandlers({
            "play": () => play(),
            "pause": () => pauseSong(),
            "previoustrack": () => previousSong(),
            "nexttrack": () => nextSong(),
            "stop": () => pauseSong(),
            "seekbackward": () => {
                seekValue -= 10;

                let currentTime = playlist[playIndex]["player"].getCurrentTime();
                let seekTime = Math.round(currentTime) + seekValue;

                onTimelineRelease(seekTime);
            },
            "seekforward": () => {
                seekValue += 10;

                let currentTime = playlist[playIndex]["player"].getCurrentTime();
                let seekTime = Math.round(currentTime) + seekValue;

                onTimelineRelease(seekTime);
            },
            "seekto": (details) => {
                if ('seekTime' in details) {
                    let time = Math.round(details.seekTime);
                    onTimelineRelease(time);
                }
            }
        });

        player.setVolume(volume);
        player.reset();
    }

    if (!player.isPlaying()) {
        player.initialize().then(() => {
            hideConfirmation();
            player.playNext(partIndex);

            if (!document.hidden) {
                let animation = document.getElementsByClassName("lds-facebook")[0];
                if (animation) {
                    let divs = animation.querySelectorAll("div");
                    for (let div of divs) {
                        if (div.style.animationPlayState === "paused") {
                            div.style.animationPlayState = "running";
                        }
                    }
                }

                if (pageLoad) {
                    let angleUp = document.getElementsByClassName("fa-angle-up")[0];
                    angleUp.dispatchEvent(clickEvent);
                }
            }
        }).catch((e) => {
            if (e.toString().includes("AbortError")) return;
            showConfirmation("Confirmation", "An error occurred while trying to automatically start the playback. Confirm to play the song.", () => play(diffSong, pageLoad), pauseSong);
        });
    }
}

/*
 * Funktion: nextSongIndex()
 * Autor: Bernardo de Oliveira
 *
 * Holt sich die Array-ID des nächsten Liedes
 */
function nextSongIndex() {
    const nextIndex = Number(playIndex) + 1;
    switch (repeatMode) {
        case 0:
            if (typeof playlist[nextIndex] === 'undefined') return playIndex;
            break;
        case 1:
            if (typeof playlist[nextIndex] === 'undefined') return 0;
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
 * Holt sich die Array-ID des vorherigen Liedes
 */
function previousSongIndex() {
    const previousIndex = Number(playIndex) - 1;
    switch (repeatMode) {
        case 0:
        case 1:
            if (typeof playlist[previousIndex] === 'undefined') return 0;
            break;
        case 2:
            return playIndex;
    }

    if (typeof playlist[playlist] !== 'undefined') {
        if (playlist[playIndex]["player"].getCurrentTime() > 10) return playIndex;
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
    if (currentButton !== option) {
        const button = document.getElementById("player").querySelector("#dynamicButton");
        button.innerHTML = "";

        if (option === "play") {
            button.appendChild(createIconElement('fas fa-pause'));
        } else if (option === "pause") {
            button.appendChild(createIconElement('fas fa-play'));
        } else if (option === "load") {
            const ldsRing = document.createElement("div");
            ldsRing.classList.add("lds-ring");

            ldsRing.append(...Array.from({length: 4}, () => document.createElement('div')));
            button.appendChild(ldsRing);
        }
        currentButton = option;
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
        if (typeof playlist[index]["player"] !== 'undefined') {
            playlist[index]["player"].stop();
            playlist[index]["player"].clear();
        }
    }

    playIndex = 0;
    partIndex = 0;
    nextPlayIndex = 0;
    nextPartIndex = 0;

    playlist = [];
    partlist = {};
}

/*
 * Funktion: pauseSong()
 * Autor: Bernardo de Oliveira
 *
 * Pausiert die Wiedergabe
 */
function pauseSong() {
    playlist[playIndex]["player"].pause();
    playPauseButton("pause");

    if (!document.hidden) {
        let animation = document.getElementsByClassName("lds-facebook")[0];
        if (animation) {
            let divs = animation.querySelectorAll("div");
            for (let div of divs) {
                if (div.style.animationPlayState === "running") {
                    div.style.animationPlayState = "paused";
                }
            }
        }
    }
}

function stopSongs() {
    for (const index of Object.keys(playlist)) {
        if (typeof playlist[index]["player"] !== 'undefined')
            playlist[index]["player"].stop();
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
    const timeInfo = document.getElementById("timeInfo");
    timeInfo.style.display = "initial";

    playlist[playIndex]["player"].removeTimeUpdate();
}

// TODO: Comment
function onElement(element, event) {
    let clientX, clientY;
    if (event.type === "touchend") {
        clientX = event.changedTouches[0].clientX;
        clientY = event.changedTouches[0].clientY;
    } else {
        clientX = event.clientX;
        clientY = event.clientY;
    }

    return clientX >= element.left &&
        clientX <= element.right &&
        clientY >= element.top &&
        clientY <= element.bottom;
}

/*
 * Funktion: onTimelineRelease()
 * Autor: Bernardo de Oliveira
 * Argumente:
 *  value: (Integer) Definiert die Zeit, zu welcher gesprungen wurde
 *
 * Berechnet den Part, welcher die Zeit beinhaltet
 * Falls kein Part verfügbar ist, wird dieser heruntergeladen
 *
 * Falls verfügbar, wird die Position in diesem Part berechnet und gesetzt
 *
 * Die Wiedergabe beginnt
 */
function onTimelineRelease(value, rangeEvent = null) {
    const player = playlist[playIndex]["player"];
    const timeline = document.getElementById("timeline");

    value = Math.round(Number(value));

    if (!document.hidden)
        document.getElementById("timeInfo").style.display = "none";

    if (rangeEvent !== null) {
        const rect = timeline.getBoundingClientRect();

        if (!onElement(rect, rangeEvent)) {
            player.addTimeUpdate();
            return;
        }
    } else timeline.value = value;

    pauseSong();
    player.setMediaSessionPosition(value);

    let songID = playlist[playIndex]["id"];
    let partInfo = getPartIndexByTime(value);

    seekValue = 0;
    nextPartIndex = partInfo[2];

    if (nextPartIndex === null) {
        playPauseButton("load");

        nextPartIndex = Object.keys(partlist[songID]).length;
        downloadPart(value, playIndex, nextPartIndex);
    } else {
        if (player.isPlaying()) return;
        player.setOffset(value - Number(partlist[songID][nextPartIndex]["from"]));

        partIndex = nextPartIndex;
        play();
    }
}

// TODO: Comment
function partIsPlayable(sIndex, pIndex) {
    const song = playlist[sIndex];
    return !((typeof song["player"] === 'undefined'
        || typeof partlist[song["id"]] === "undefined"
        || typeof partlist[song["id"]][pIndex] === "undefined"
        || typeof partlist[song["id"]][pIndex]["from"] === "undefined"));
}

/*
 * Funktion: nextSong()
 * Autor: Bernardo de Oliveira
 *
 * Überprüft, ob der nächste Index in der Playlist verfügbar ist
 * Die Wiedergabe wird gestartet
 */
function nextSong(bypass = false) {
    if (!bypass) {
        pauseSong();
        stopSongs();
    }
    playPauseButton("load");

    const nextIndex = nextSongIndex();
    if (typeof playlist[nextIndex] !== 'undefined') {
        playIndex = nextIndex;
        partIndex = 0;
        nextPartIndex = 0;

        updateSongData();

        if (!partIsPlayable(nextIndex, partIndex))
            downloadPart(0, playIndex, partIndex);
        else play(true);
    }
}

/*
 * Funktion: previousSong()
 * Autor: Bernardo de Oliveira
 *
 * Überprüft, ob der vorherige Index in der Playlist verfügbar ist
 * Die Wiedergabe wird gestartet
 */
function previousSong(bypass = false) {
    if (!bypass) {
        pauseSong();
        stopSongs();
    }
    playPauseButton("load");

    const previousIndex = previousSongIndex();
    if (typeof playlist[previousIndex] !== 'undefined') {
        playIndex = previousIndex;
        partIndex = 0;
        nextPartIndex = 0;

        updateSongData();

        if (!partIsPlayable(previousIndex, partIndex))
            downloadPart(0, playIndex, partIndex);
        else play(true);
    }
}

/*
 * Funktion: prepareNextPart()
 * Autor: Bernardo de Oliveira
 * Argumente:
 *  callback: (Function) Definiert eine Funktion welche anschliessen ausgeführt wird
 *
 * Überprüft, ob es einen nächsten Teil gibt
 * Sonst lädt es den ersten Teil des nächsten Liedes
 *
 * Falls weitere Teile verfügbar sind
 * Wird überprüft, ob diese bereits heruntergeladen wurden
 *
 * Falls nicht, wird überprüft, ob irgendwo später im Lied bereits Teile heruntergeladen wurden
 * Falls nicht, wird einfach der nächste Teil heruntergeladen
 *
 * Falls die länge zum nächsten Teil unter der Länge des jetzigen Teils ist, wird dieser heruntergeladen
 * Beispiel:
 *  - Teil 60 - 70 Sekunden wurde heruntergeladen
 *  - Teil 75 - 85 Sekunden wurde heruntergeladen
 *  - Jetzt fehlt ein 5 Sekunden langer Teil, dieser wird heruntergeladen (anstatt 10 Sekunden)
 */
function prepareNextPart() {
    const currentSong = playlist[playIndex], songID = currentSong["id"];
    const currentPart = partlist[songID][partIndex];

    let nextTime;
    if (typeof currentPart !== "undefined" && currentPart["till"])
        nextTime = Math.round(currentPart["till"]);
    else return;

    let songEnded = false, nextSong = false;
    if (!(currentSong["player"].getDuration() - nextTime > 1)) {
        songEnded = true;
        nextPlayIndex = nextSongIndex();

        if (typeof playlist[nextPlayIndex] !== 'undefined') {
            nextSong = true;
            nextPartIndex = 0;
            nextTime = 0;
        }
    }

    if (!nextSong && !songEnded) {
        nextPlayIndex = playIndex;

        const player = playlist[nextPlayIndex]["player"];
        let partInfo = getPartIndexByStartTime(nextTime);

        if (partInfo[2]) {
            nextPartIndex = partInfo[2];
            player.queueTrack(nextPartIndex);
        } else {
            nextPartIndex = Object.keys(partlist[songID]).length;

            let missingLength = findMissingLengthByCurrentPart(nextTime);
            downloadPart(nextTime, nextPlayIndex, nextPartIndex, missingLength);
        }
    } else if (nextSong && !partIsPlayable(nextPlayIndex, nextPartIndex))
        downloadPart(0, nextPlayIndex, nextPartIndex);
}

/*
 * Funktion: downloadPart()
 * Autor: Bernardo de Oliveira
 * Argumente:
 *  time: (Integer) Definiert die Zeit, ab wann der nächste Teil beginnt
 *  sIndex: (Integer) Definiert den Index des Songs (auch playIndex)
 *  pIndex: (Integer) Definiert den Index des Teils (auch partIndex)
 *  till: (Integer) Definiert die Zeit, bis wann der nächste Teil gehen soll
 *
 * Lädt ein Teilstück von einem Lied herunter, ab einer bestimmten Zeit
 * Fügt die Informationen zur partlist hinzu
 *
 * Optional kann man auch bis zu einer bestimmten Zeit herunterladen
 */
function downloadPart(time, sIndex, pIndex, till = null) {
    const song = playlist[sIndex];
    const songID = song["id"];
    let player = song["player"];

    if (typeof player === 'undefined') {
        let length = getLengthByString(song["length"]);
        player = song["player"] = new MultiTrackPlayer(length);

        addEvents(player);
    }

    if (typeof partlist[songID] === 'undefined') partlist[songID] = {};

    partlist[songID][pIndex] = {};

    player.addTrack(pageURL + "system/song/" + songID + "/" + time + ((till) ? ("/" + till) : ""), () => {
        if (typeof partlist[songID] !== "undefined" && typeof partlist[songID][pIndex] !== "undefined") {
            const length = player.getPartLength(pIndex);

            partlist[songID][pIndex] = {
                "from": time,
                "till": time + length
            };
        }
    });
}

/*
 * Funktion: addEvents()
 * Autor: Bernardo de Oliveira
 * Argumente:
 *  player: (Object) Der Player, welchem die Events zugewiesen werden
 *
 * Fügt Events zum Player hinzu
 */
function addEvents(player) {
    /*
     * Funktion: onplay()
     * Autor: Bernardo de Oliveira
     *
     * Sobald die Wiedergabe beginnt, soll der nächste Teil im Hintergrund heruntergeladen werden
     */
    player.addEventListener("play", () => {
        playPauseButton("play");

        partIndex = nextPartIndex;

        prepareNextPart();
    });

    player.addEventListener("end", () => {
        pauseSong();

        function trackEvent(retry = false) {
            if (playIndex !== nextPlayIndex || repeatMode !== 0) {
                player.stop();

                playIndex = nextPlayIndex;
                partIndex = 0;
                nextPartIndex = 0;

                play(true);
                return;
            }

            if (!player.isDecoding()) {
                if (!retry && !player.hadError()) {
                    prepareNextPart();
                    trackEvent(true);
                }
            } else playPauseButton("load");
        }

        trackEvent();
    });

    player.addEventListener("processed", (e) => {
        if (e.detail.set) {
            nextPartIndex = e.detail.index

            if (player.isPlaying()) player.queueTrack(nextPartIndex);
            else {
                partIndex = nextPartIndex;
                play(e.detail.initialPlay);
            }
        }
    });

    player.addEventListener("downloadError", () => {
        delete partlist[playlist[playIndex]["id"]][nextPartIndex];

        nextPartIndex = partIndex;

        if (!player.isPlaying())
            playPauseButton("load");

        setTimeout(() => {
            prepareNextPart();
        }, 2000);
    });

    player.addEventListener("pause", () => {
        nextPartIndex = partIndex;

        if (player.isDecoding()) playPauseButton("load");
        else playPauseButton("pause");
    });

    player.addEventListener("timeupdate", (e) => {
        if (!document.hidden) {
            const timeline = document.getElementById("timeline");
            timeline.value = e.detail.index;
        }
    });
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

    playlist[playIndex]["player"].removeTimeUpdate();

    if (leftPos < 0) leftPos = 0; else if ((leftPos + measurementTimeInfo["width"]) > getWidth()) leftPos = getWidth() - measurementTimeInfo["width"];

    timeInfo.style.top = (measurementRange["top"] - measurementTimeInfo["height"] - 10) + "px";
    timeInfo.style.left = leftPos + "px";

    let currentTime = timeInfo.querySelector("#current");
    currentTime.textContent = getReadableTime(rangeEvent.target.value);
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
async function generatePlaylistInfo(song) {
    let info = {"cover": null, "artists": ""};

    let data = tryParseJSON(httpGet(pageURL + "system/song/" + song["id"]));
    const count = data["count"];
    deleteMultiple(data, ["cover", "name", "count"])

    if (!song["cover"]) {
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");
        context.canvas.width = 160;
        context.canvas.height = 160;

        for (let i = 0, j = 0; i < 4; i++) {
            if (i % 2 === 0 && i !== 0) j++;

            const image = new Image();
            image.src = data[i]["cover"].toString() + "?size=80";

            await new Promise((resolve) => {
                image.onload = () => {
                    context.drawImage(image, (i % 2) * 80, (j % 2) * 80, 80, 80);
                    resolve();
                };
            });
        }

        info["cover"] = context.canvas.toDataURL("image/png");
    } else {
        info["cover"] = "system/img/" + song["cover"] + "?size=200";
    }

    let artistCount = 0;
    for (let i = 0; i < count; i++) {
        if (artistCount >= 4) break;
        const artists = data[i]["artist"].split(/[,&]+/).map(artist => artist.trim());
        for (let artist of artists) {
            if (artistCount >= 4) break;
            if (info["artists"].includes(artist)) continue;
            info["artists"] += artist + ", ";
            artistCount++;
        }
    }

    info["artists"] = info["artists"].substring(0, info["artists"].length - 2)
    if (artistCount > 4)
        info["artists"] += " and more..";

    return info;
}

// TODO: Comment
function getTextWidth(text, font, size) {
    const tempElement = document.createElement("span");
    tempElement.innerHTML = text;
    tempElement.style.font = font;
    tempElement.style.fontSize = size;
    tempElement.style.visibility = "hidden";
    tempElement.style.whiteSpace = "nowrap";

    document.body.appendChild(tempElement);

    const textWidth = tempElement.offsetWidth;

    document.body.removeChild(tempElement);

    return textWidth;
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
    const fragment = document.createDocumentFragment();
    const thead = document.createElement("thead");
    const tr = document.createElement("tr");

    for (const column of columns) {
        const th = document.createElement("th");
        th.textContent = column;
        tr.appendChild(th);
    }

    thead.appendChild(tr);
    fragment.appendChild(thead);

    return fragment;
}

/*
 * Funktion: generateTableBody()
 * Autor: Bernardo de Oliveira
 * Argumente:
 *  content: (String) Der Inhalt der Zelle
 *
 * Generiert eine Zelle mit dem Inhalt
 * Je nach Inhalt wird die Zelle zusätzlich grün oder rot
 * */
function createCell(content) {
    const cell = document.createElement('td');
    const div = document.createElement('div');
    div.className = 'truncate';

    const contentDiv = document.createElement('div');
    contentDiv.className = `content ${(() => {
        switch (content) {
            case 'ACCEPT':
                return 'green';
            case 'DROP':
                return 'red';
            default:
                return '';
        }
    })()}`;
    contentDiv.dataset.title = content;
    contentDiv.textContent = content;

    const spacer = document.createElement('div');
    spacer.className = 'spacer';
    spacer.textContent = content;

    const span = document.createElement('span');
    span.innerHTML = '&nbsp';

    div.append(contentDiv, spacer, span);
    cell.appendChild(div);

    return cell;
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
async function generateTableBody(data, columns, tbody = null, cover = null) {
    if (!tbody) tbody = document.createElement('tbody');

    const fragment = document.createDocumentFragment();
    const lowerColumns = columns.map(column => column.toLowerCase());
    const rows = Object.values(data);

    for (const row of rows) {
        const tr = document.createElement('tr');
        if (row.id) tr.dataset.id = row.id;

        if (!row['playlist']) {
            if (cover) {
                const td = document.createElement('td');
                const div = document.createElement('div');

                div.className = 'cover';
                div.style.backgroundImage = `url('${cover}')`;
                div.style.backgroundPositionX = `-${row['coverPos'] / 200 * 35}px`;

                td.appendChild(div);
                tr.appendChild(td);
            } else if (row.cover) {
                const td = document.createElement('td');
                const div = document.createElement('div');

                div.className = 'cover';
                div.style.backgroundImage = `url('${row.cover + "?size=35"}')`;

                td.appendChild(div);
                tr.appendChild(td);
            }

            lowerColumns.forEach(column => {
                if (column !== 'cover') {
                    const content = row[column] !== undefined ? row[column] : '';
                    const cell = createCell(content, column);
                    tr.appendChild(cell);
                }
            });
        } else {
            const info = await generatePlaylistInfo(row);

            const coverDiv = document.createElement('div');
            coverDiv.className = 'cover';
            coverDiv.style.backgroundImage = `url('${info.cover}')`;

            const coverTd = document.createElement('td');
            coverTd.appendChild(coverDiv);

            const nameTd = createCell(row.name);
            const artistTd = createCell(info.artists);
            artistTd.colSpan = 2;

            tr.append(coverTd, nameTd, artistTd);
        }

        fragment.appendChild(tr);
    }

    tbody.appendChild(fragment);
    return tbody;
}

// TODO: Comment
function setPositionState(length, position) {
    if ('mediaSession' in navigator) {
        navigator.mediaSession.setPositionState({
            duration: length,
            playbackRate: 1,
            position: position
        });
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
function removeFromObject(object, toRemove = null, recursive = true) {
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
                    if (!isNum(key)) cleaned[key] = value; else {
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
 * Funktion: generateNumericalOrder()
 * Autor: Bernardo de Oliveira
 * Argumente:
 *  object: (Object): Das zu bearbeitende Objekt
 *
 * Erstellt ein neues Array ohne Lücken
 * Generiert den Index neu (zählt um eins hoch)
 */
function generateNumericalOrder(object) {
    let cleaned = [];

    for (let value of Object.values(object)) {
        cleaned.push(value);
    }

    return cleaned;
}

/*
 * Funktion: isNum()
 * Autor: Bernardo de Oliveira
 * Argumente:
 *  val: (String) Definiert die Zeichenkette welche überprüft werden soll
 *
 * isNaN überprüft, ob eine Zeichenkette keine Zahl ist
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
 * Funktion: getPartLength()
 * Autor: Bernardo de Oliveira
 * Argumente:
 *  index: (Integer) Definiert den Teil, von welchem die Länge zurückgegeben werden soll
 *
 * Berechnet sich die Länge vom Teil den man benötigt
 */
function getPartLength(index) {
    return playlist[playIndex]["player"].getPartLength(index);
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
    let songID = playlist[playIndex]["id"];
    for (let [index, part] of Object.entries(partlist[songID])) {
        if (part["from"] <= time && part["till"] >= time) return [part["from"], part["till"], Number(index)];
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
    let songID = playlist[playIndex]["id"];
    for (let [index, part] of Object.entries(partlist[songID])) {
        if (part["from"] === time) return [part["from"], part["till"], Number(index)];
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
function findMissingLengthByCurrentPart(time) {
    let currentLength = getPartLength(partIndex);
    let songID = playlist[playIndex]["id"];

    for (let part of Object.values(partlist[songID])) {
        if (part["from"] - time > 1 && part["from"] - time <= currentLength)
            return part["from"] - time;
    }
    return null;
}