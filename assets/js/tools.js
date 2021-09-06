let currentHover = null,
    currentTime = 0,
    secondsInterval = null,
    playIndex = 0,
    playlist = {};

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
                    switch (eventName) {
                        case "click":
                            if (!event.target.closest(selector).onclick) {
                                event.target.closest(selector).onclick = handler;
                                handler.apply(event.target.closest(selector), arguments);
                            }
                            break;
                        case "play":
                            if (!event.target.closest(selector).onplay) {
                                event.target.closest(selector).onplay = handler;
                                handler.apply(event.target.closest(selector), arguments);
                            }
                            break;
                        case "timeupdate":
                            if (!event.target.closest(selector).ontimeupdate) {
                                event.target.closest(selector).ontimeupdate = handler;
                                handler.apply(event.target.closest(selector), arguments);
                            }
                            break;
                        default:
                            handler.apply(event.target.closest(selector), arguments);
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
 * Funktion: getCookie()
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

// TODO: Comment
function ucFirst(string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
}

// TODO: Comment
function play() {
    let player = document.getElementById("player");

    let song = playlist[playIndex];
    let gapless = song["player"];
    let split = song["length"].split(":"), length = Number(split[0]) * 60 + Number(split[1]);

    player.querySelector("#name").innerText = song["name"];
    player.querySelector("#artist").innerText = song["artist"];
    player.querySelector("#timeline").max = length;

    playPauseButton(true);
    gapless.play();

    player.style.display = "initial";

    secondsInterval = setInterval(function () {
        let timeline = document.getElementById("timeline");

        timeline.value = getCurrentPartTime(2) + currentTime;
    }, 1000);
}

// TODO: Comment
function nextSongIndex() {
    let found = false;

    for (let key in playlist) {
        key = Number(key);
        let value = playlist[key];

        if (found)
            return key;

        if (key == playIndex) {
            found = true;
        }
    }
}

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

function getCurrentPartTime() {
    let partIndex = playlist[playIndex]["player"].trk.trackNumber - 1;
    let position = 0;

    try {
        position = playlist[playIndex]["player"].sources[partIndex].getPosition();
    } catch (ignored) {}

    return position / 1000;
}

function getPartTime(minus) {
    let partIndex = playlist[playIndex]["player"].totalTracks() - minus;

    return playlist[playIndex]["player"].sources[partIndex].getLength() / 1000;
}

function clearSong(index) {
    playlist[index]["player"].stop();
    playlist[index]["player"].removeAllTracks();
}