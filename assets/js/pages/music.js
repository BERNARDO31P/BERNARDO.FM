if (typeof window["music"] !== 'undefined') throw new Error("Dieses Skript wurde bereits geladen.");

let MSAPI = new Audio();
document.getElementsByTagName("body")[0].appendChild(MSAPI);

// TODO: Comment
MSAPI.addEventListener("pause", function () {
    let player = new Gapless5({});
    if (typeof playlist[playIndex]["player"] !== 'undefined')
        player = playlist[playIndex]["player"];

    if (player.isPlaying()) pauseSong();
});

// TODO: Comment
MSAPI.addEventListener("play", function () {
    let player = new Gapless5({});
    if (typeof playlist[playIndex]["player"] !== 'undefined')
        player = playlist[playIndex]["player"];

    if (!player.isPlaying()) play();
});

window["music"] = () => {
    let objects = document.querySelectorAll("[data-url]"), search = document.querySelector("#search input");
    let view = getCookie("view");

    /*
     * Author: Bernardo de Oliveira
     *
     * Die Lautstärke wird in einem Cookie gespeichert
     * Hier wird dieser ausgelesen und gesetzt
     */
    let vol = getCookie("volume");
    if (vol === "") vol = 0.5;
    volume = Number(vol);

    let volumeSlider = document.getElementsByClassName("volume")[0].querySelector(".volumeSlider");
    let volumeIcon = prev(volumeSlider.closest(".volumeBackground"));
    volumeSlider.value = volume * 100;
    setVolumeIcon(volumeIcon, volumeSlider);

    for (let object of objects) {
        let url = object.getAttribute("data-url") + "/" + search.value;
        let data = tryParseJSON(httpGet(url));

        if (view === "") view = "grid";

        if (search.value !== "") {
            let div = document.createElement("div");
            div.classList.add("searchterm");

            let h3 = document.createElement("h3");
            h3.textContent = "Search results for '" + search.value + "'";

            div.appendChild(h3);

            object.parentNode.insertBefore(div, object);
        }


        if (Object.keys(data).length > 0) {
            if (view === "list") {
                document.getElementsByClassName("fa-list")[0].classList.add("active");
                object.parentNode.insertBefore(generateListView(data), object);
            } else {
                document.getElementsByClassName("fa-grip-horizontal")[0].classList.add("active");

                let gridView = document.createElement("div");
                gridView.classList.add("songGrid");

                for (let category in data) {
                    let songs = data[category], title = document.createElement("h2");

                    title.textContent = category;
                    gridView.appendChild(title);

                    let div = document.createElement("div"), categoryView = document.createElement("div");
                    categoryView.classList.add("songCategory");

                    div.addEventListener("scroll", () => {
                        removeControls("controlsContent");
                    });

                    for (let arrayID in songs) {
                        let song = songs[arrayID];

                        let card = document.createElement("div");
                        card.setAttribute("data-id", song["id"]);

                        if (typeof song["playlist"] === 'undefined') {
                            card.classList.add("songCard");
                            card.innerHTML = "<img src='" + song["cover"]["url"] + "' alt='Cover'/>" +
                                "<span data-title=\"" + song["name"] + "\" class='name'>" + song["name"] + "</span>" +
                                "<span data-title=\"" + song["artist"] + "\" class='artist'>" + song["artist"] + "</span>" +
                                "<span class='length'>" + song["length"] + "</span>";
                        } else {
                            card.classList.add("playlistCard");

                            let info = generatePlaylistCover(song);

                            card.innerHTML += info["cover"].innerHTML;
                            card.innerHTML += "<span data-title=\"" + song["name"] + "\" class='name'>" + song["name"] + "</span>" +
                                "<span data-title=\"" + info["artists"] + "\" class='artist'>" + info["artists"] + "</span>";
                        }

                        categoryView.appendChild(card);
                    }

                    div.appendChild(categoryView);
                    gridView.appendChild(div);
                }

                object.parentNode.insertBefore(gridView, object);
            }
        } else {
            let div = document.createElement("div");
            div.classList.add("info");

            let span = document.createElement("span");
            span.textContent = "We couldn't find any song with that search term";

            div.appendChild(span);

            object.parentNode.insertBefore(div, object);
        }

        object.remove();
    }

    /*
     * Funktion: Anonym
     * Autor: Bernardo de Oliveira
     *
     * Zeigt die Optionen von einem Lied (Abspielen, zur Wiedergabeliste hinzufügen usw)
     */
    bindEvent("mouseover", "#content tr[data-id]", function () {
        let controls = this.querySelector(".controlsContent");
        if (!controls) {
            removeControls("controlsContent");
            if (!this.classList.contains("playlist"))
                controls = createControls("controlsContent", ["play", "add"]);
            else
                controls = createControls("controlsContent", ["play"]);

            let pos = this.getBoundingClientRect();

            controls.style.top = "3px";
            controls.style.right = "0";
            controls.style.height = pos.height - 6 + "px";
            controls.style.lineHeight = pos.height - 6 + "px";
            controls.setAttribute("data-id", this.getAttribute("data-id"));

            setTimeout(() => {
                this.querySelector("td:last-of-type").appendChild(controls);
                controls.classList.add("show");
            }, 0);
        } else clearTimeout(controlsTimeout);
    });

    /*
     * Funktion: Anonym
     * Autor: Bernardo de Oliveira
     *
     * Entfernt die Liedoptionen
     */
    bindEvent("mouseout", "#content tr[data-id]", function () {
        let row = this;
        controlsTimeout = setTimeout(function () {
            if (row !== currentHover) {
                let controls = row.querySelector(".controlsContent");
                if (controls) controls.remove();
            }
        }, 0);
    });

    bindEvent("mouseout", ".songCard", function () {
        removeControlsCard(this);
    });

    bindEvent("mouseout", ".playlistCard", function () {
        removeControlsCard(this);
    });

    bindEvent("mouseover", ".songCard", function () {
        showControlsCard(this);
    });
    bindEvent("mouseover", ".playlistCard", function () {
        showControlsCard(this);
    });
    bindEvent("click", ".songCard", function () {
        showControlsCard(this);
    });
    bindEvent("click", ".playlistCard", function () {
        showControlsCard(this);
    });

    /*
     * Funktion: Anonym
     * Autor: Bernardo de Oliveira
     *
     * Fügt ein Lied zur Wiedergabenliste hinzu
     */
    bindEvent("click", "#content .listAdd", function () {
        addSongToPlaylist(this);
        showNotification("Song added to queue", 3000);
    });

    /*
     * Funktion: Anonym
     * Autor: Bernardo de Oliveira
     *
     * Setzt die Wiedergabenliste zurück und spielt das Lied ab
     */
    bindEvent("click", "#content .fa-play", function () {
        clearSongs();

        playIndex = 0;
        partIndex = 0;
        currentTime = 0;
        playlist = [];
        partlist[playIndex] = {0: 0};

        clearInterval(secondsInterval);
        secondsInterval = null;

        addSongToPlaylist(this);
        playPauseButton("load");
        downloadPart(currentTime, playIndex, partIndex);
        play(true);
    });

    /*
     * Funktion: Anonym
     * Autor: Bernardo de Oliveira
     *
     * Findet heraus welches Lied abgespielt werden soll
     * Spielt das Lied ab
     */
    bindEvent("click", "#queueView .fa-play", function () {
        clearSong(playIndex);

        let id = Number(this.closest(".controlsQueue").getAttribute("data-id"));

        for (let [key, value] of Object.entries(playlist)) {
            if (value["id"] === id) playIndex = key;
        }

        currentTime = 0;
        partIndex = 0;

        if (typeof playlist[playIndex]["player"] === 'undefined')
            downloadPart(currentTime, playIndex, partIndex);

        clearInterval(secondsInterval);
        secondsInterval = null;

        playPauseButton("load");
        play(true);
    });

    bindEvent("touchend", "#timeline", (e) => onTimelineRelease(e.target.value));
    bindEvent("mouseup", "#timeline", (e) => onTimelineRelease(e.target.value));

    bindEvent("click", "#player .fa-step-forward", () => nextSong());
    bindEvent("click", "#player .fa-step-backward", () => previousSong());

    /*
     * Funktion: Anonym
     * Autor: Bernardo de Oliveira
     *
     * Versteckt beim Scrollen die Liedoptionen
     */
    window.addEventListener("scroll", () => {
        removeControls("controlsContent");
    });
}

/*
 * Funktion: addEvents()
 * Autor: Bernardo de Oliveira
 * Argumente:
 *  player: (Objekt) Der Player, welchem die Events zugewiesen werden
 *
 * Fügt Events zum Player hinzu
 *
 * onplay: Sobald die Wiedergabe beginnt, soll der nächste Teil im Hintergrund heruntergeladen werden
 * onnext: Sobald der nächste Teil des Liedes beginnt, soll der nächste Teil im Hintergrund heruntergeladen werden
 * onfinishedall: Sobald das Lied abgeschlossen ist, wird das nächste Lied wiedergeben
 */
function addEvents(player) {
    player.onerror = () => {
        setTimeout(function () {
            downloadNextPart();
        }, 1000);
    }

    player.onplay = () => {
        playPauseButton("play");
        if (MSAPI.paused) MSAPI.play();

        downloadNextPart();
    }

    player.onfinishedtrack = () => {
        let timeline = document.getElementById("timeline");
        let gapless = playlist[playIndex]["player"];

        let interval = setInterval(function () {
            if (!downloading) {
                clearInterval(interval);

                if (typeof partlist[playIndex][nextPartIndex] !== "undefined" && partlist[playIndex][partIndex]["till"] + 1 < Number(timeline.max)) {
                    let gidOld = partlist[playIndex][partIndex]["gid"];

                    currentTime += getPartLength(gidOld);
                    partIndex = nextPartIndex;

                    let gidNew = partlist[playIndex][partIndex]["gid"];
                    gapless.gotoTrack(gidNew);
                    gapless.playlist.sources[gidNew].setPosition(0);

                    play();
                } else {
                    let nextIndex = nextSongIndex();

                    playPauseButton("load");
                    resetSong(playIndex);
                    clearInterval(secondsInterval);
                    secondsInterval = null;

                    currentTime = 0;
                    partIndex = 0;

                    if (typeof playlist[nextIndex] !== 'undefined') {
                        playIndex = nextIndex;

                        if (typeof playlist[playIndex]["player"] === "undefined")
                            downloadPart(currentTime, playIndex, partIndex);

                        playlist[playIndex]["player"].gotoTrack(partIndex);

                        play(true);
                    } else {
                        pauseSong();
                    }
                }
            } else {
                pauseSong();
                playPauseButton("load");
            }
        }, 50);
    }
}

/*
 * Funktion: addSongToPlaylist()
 * Autor: Bernardo de Oliveira
 * Argumente:
 *  element: (Objekt) Das Element, welches überprüft werden soll
 *
 * Liesst die Lied ID aus den Objekt-Eigenschaften aus
 * Lädt die Liedinformationen herunter und fügt diese zur Wiedergabenliste hinzu
 */
function addSongToPlaylist(element) {
    let controls = element.closest(".controlsContent");
    let songID = controls.getAttribute("data-id");
    let data = tryParseJSON(httpGet(pageURL + "system/song/" + songID));

    if (typeof data.length !== 'number') {
        let id = playlist.length;
        playlist[id] = data;
    } else playlist = data;
}

/*
 * Funktion: downloadNextPart()
 * Autor: Bernardo de Oliveira
 *
 * Überprüft, ob das Lied fertig ist
 * Überprüft, ob ein nächstes Lied in der Wiedergabenliste verfügbar ist
 *
 * Lädt den nächsten Teil herunter oder pausiert die weitere Wiedergabe
 */
function downloadNextPart() {
    let timeline = document.getElementById("timeline"), nextTime;

    let interval = setInterval(function () {
        if (!downloading && typeof partlist[playIndex][partIndex] !== 'undefined') {
            clearInterval(interval);

            nextTime = partlist[playIndex][partIndex]["till"] + 1;

            let nextSong = false, nextIndex;

            if (!(Number(timeline.max) - nextTime > 1)) {
                nextSong = true;
                nextIndex = nextSongIndex();
            }

            let partInfo = getPartIndexByStartTime(nextTime);

            if (partInfo[2]) nextPartIndex = partInfo[2];
            else nextPartIndex = Object.keys(partlist[playIndex]).length

            if (!nextSong && typeof partInfo[2] === 'undefined') {
                downloadPart(nextTime, playIndex, nextPartIndex);
            } else if (typeof partlist[nextIndex] === 'undefined' && typeof playlist[nextIndex] !== 'undefined') {
                partlist[nextIndex] = {};
                downloadPart(0, nextIndex, 0);
            }
        }
    }, 50);
}

/*
 * Funktion: downloadPart()
 * Autor: Bernardo de Oliveira
 * Argumente:
 *  time: (Integer) Definiert die Zeit, ab wann der nächste Teil beginnt
 *  sIndex: (Integer) Definiert den Index des Songs (auch playIndex)
 *  pIndex: (Interger) Definiert den Index des Teils (auch partIndex)
 *
 * Lädt ein Teilstück von einem Lied herunter, ab einer bestimmten Zeit
 * Fügt die Informationen zur partlist hinzu
 */
function downloadPart(time, sIndex, pIndex) {
    let songID = playlist[sIndex]["id"];

    downloading = true;

    if (typeof playlist[sIndex]["player"] === 'undefined') {
        let gapless = new Gapless5({singleMode: true});
        addEvents(gapless);

        playlist[sIndex]["player"] = gapless;
    }

    playlist[sIndex]["player"].addTrack(pageURL + "system/song/" + songID + "/" + time);

    if (typeof partlist[sIndex] === 'undefined') partlist[sIndex] = {};

    getPartLengthCallback(pIndex, function (length) {
        partlist[sIndex][pIndex] = {
            "gid": playlist[sIndex]["player"].totalTracks() - 1,
            "from": time,
            "till": time + length - 1
        };
        downloading = false;
    });
}

/*
 * Funktion: generateQueue()
 * Autor: Bernardo de Oliveira
 * Argumente:
 *  data: (Object) Die Daten, welche verarbeitet werden sollen
 *
 * Generiert die Wiedergabeliste
 */
function generateQueue(data) {
    let listView = document.createElement("table");
    listView.classList.add("responsive-table");

    let columns = Object.keys(removeFromObject(data[0], ["id", "category", "player"]));
    listView.appendChild(generateTableHead(columns));
    listView.appendChild(generateTableBody(data, columns));

    return listView;
}

/*
 * Funktion: generateListView()
 * Autor: Bernardo de Oliveira
 * Argumente:
 *  data: (Object) Die Daten, welche verarbeitet werden sollen
 *
 * Generiert eine Tabelle aus den Daten (Table body) und Schlüssel (Table head)
 */
function generateListView(data, categories = true) {
    let listView = document.createElement("table");
    listView.classList.add("responsive-table");

    let columns = [];
    if (categories) {
        columns = getColumns(data, 2);
    } else {
        columns = getColumns(data, 1);
    }

    columns = removeFromObject(columns, ["id", "category", "player"]);

    listView.appendChild(generateTableHead(columns));

    let tbody = document.createElement("tbody");
    tbody.onscroll = () => {
        removeControls("controlsQueue");
    };

    if (categories) {
        for (let [category, songs] of Object.entries(data)) {
            let row = document.createElement("tr");
            row.innerHTML = "<td colspan='4'>" + category + "</td>";

            tbody.appendChild(row);
            generateTableBody(songs, columns, tbody);
        }
    } else {
        generateTableBody(data, columns, tbody);
    }

    listView.appendChild(tbody);
    return listView;
}

/*
 * Funktion: showControlsCard()
 * Autor: Bernardo de Oliveira
 *
 * Zeigt die Optionen von einem Lied (Abspielen, zur Wiedergabeliste hinzufügen usw)
 */
function showControlsCard(card) {
    let controls = card.querySelector(".controlsContent");
    if (!controls) {
        removeControls("controlsContent");
        if (card.classList.contains("songCard"))
            controls = createControls("controlsContent", ["play", "add"]);
        else
            controls = createControls("controlsContent", ["play"]);

        controls.setAttribute("data-id", card.getAttribute("data-id"));
        controls.style.bottom = "0";
        controls.style.left = "0";

        setTimeout(function () {
            card.appendChild(controls);
            controls.classList.add("show");
        }, 0);
    } else clearTimeout(controlsTimeout);
}

/*
 * Funktion: removeControlsCard()
 * Autor: Bernardo de Oliveira
 * Argumente:
 *  card: (Objekt) Definiert das Objekt welches verlassen wurde
 *
 * Entfernt die Liedoptionen
 */
function removeControlsCard(card) {
    controlsTimeout = setTimeout(function () {
        if (card !== currentHover) {
            touched = false;
            let controls = card.querySelector(".controlsContent");
            if (controls) controls.remove();
        }
    }, 0);
}

/*
 * Funktion: onTimelineRelease()
 * Autor: Bernardo de Oliveira
 *
 * Sobald die Timeline wieder losgelassen wird, wird die Zeit information mit dem jetzigen Fortschritt des Liedes versteckt
 * Die Wiedergabe beginnt
 */
function onTimelineRelease(value) {

    let timeInfo = document.getElementById("timeInfo");
    let gapless = playlist[playIndex]["player"];
    timeInfo.style.display = "none";

    playPauseButton("load");
    resetSong(playIndex);

    let partInfo = getPartIndexByTime(value);
    let index = partInfo[2];
    currentTime = partInfo[0];

    clearTimeout(timelineTimeout);
    if (typeof index === "undefined") {
        timelineTimeout = setTimeout(function () {
            index = Object.keys(partlist[playIndex]).length;
            downloadPart(Number(value), playIndex, index);

            let interval = setInterval(function () {
                if (!downloading) {
                    clearInterval(interval);

                    gapless.gotoTrack(partlist[playIndex][index]["gid"]);
                    partIndex = index;
                    MSAPI.currentTime = value;
                    currentTime = Number(value);

                    play();
                }
            }, 50);
        }, 2000);
    } else {
        let interval = setInterval(function () {
            if (typeof partlist[playIndex][index] !== 'undefined') {
                clearInterval(interval);

                let startFrom = (value - currentTime) * 1000;

                gapless.gotoTrack(partlist[playIndex][index]["gid"]);
                partIndex = index;
                MSAPI.currentTime = value;
                currentTime = Number(value);

                gapless.playlist.sources[partlist[playIndex][partIndex]["gid"]].setPosition(startFrom, false);
                play();
            }
        }, 50);
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

    playPauseButton("load");
    clearInterval(secondsInterval);
    secondsInterval = null;

    let nextIndex = nextSongIndex();
    if (typeof playlist[nextIndex] !== 'undefined') {
        playIndex = nextIndex;

        if (typeof playlist[nextIndex]["player"] === 'undefined') {
            partlist[nextIndex] = {};
            downloadPart(0, playIndex, partIndex);
        }

        play(true);
    } else {
        pauseSong();

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

    playPauseButton("load");
    clearInterval(secondsInterval);
    secondsInterval = null;

    let previousIndex = previousSongIndex();
    if (typeof playlist[previousIndex] !== 'undefined') {
        playIndex = previousIndex;

        if (typeof playlist[previousIndex]["player"] === 'undefined') {
            partlist[previousIndex] = {};
            downloadPart(0, playIndex, partIndex);
        }

        play(true);
    }
}