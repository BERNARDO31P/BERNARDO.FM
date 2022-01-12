if (typeof window["music"] !== 'undefined') throw new Error("Dieses Skript wurde bereits geladen.");

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
        let data = tryParseJSON(httpGet(object.getAttribute("data-url") + "?search=" + search.value));

        if (view === "") view = "grid";

        if (search.value !== "") {
            let div = document.createElement("div");
            div.classList.add("searchterm");

            let h3 = document.createElement("h3");
            h3.textContent = "Search results for '" + search.value + "'";

            div.appendChild(h3);

            object.parentNode.insertBefore(div, object);
        }

        if (data.length > 0) {
            let parsed = {};

            for (let song of data) {
                if (typeof parsed[song["category"]] === 'undefined') parsed[song["category"]] = [];
                parsed[song["category"]].push(song);
            }

            if (view === "list") {
                document.getElementsByClassName("fa-list")[0].classList.add("active");
                object.parentNode.insertBefore(generateListView(parsed), object);
            } else {
                document.getElementsByClassName("fa-grip-horizontal")[0].classList.add("active");

                let gridView = document.createElement("div");
                gridView.classList.add("songGrid");

                for (let category in parsed) {
                    let songs = parsed[category], title = document.createElement("h2");

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
        addSongToPlaylist(this);
        playPauseButton("load");
        downloadPart(0, playIndex, partIndex);
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

        if (typeof playlist[playIndex]["player"] === 'undefined') {
            downloadPart(0);
            partlist[playIndex] = {0: 0};
        }

        clearInterval(secondsInterval);
        playPauseButton("load");
        downloadPart(0, playIndex, partIndex);
        play(true);
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
        let queueView = document.getElementById("queueView");
        let navbar = document.getElementById("navbar");
        let body = document.getElementsByTagName("body")[0];

        if (this.getAttribute("data-angle") === "up") {
            hidePlaylist(body, queueView, this);

            if (window.scrollY !== 0) navbar.classList.add("shadow");
        } else {
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
            queue.innerHTML = "";
            queue.appendChild(generateQueue(playlist));

            queueView.classList.add("show");
            queueView.animate([
                {height: '0%'},
                {height: 'calc(100% - 200px)'}
            ], {
                duration: 300,
                fill: "forwards"
            });

            this.setAttribute("data-angle", "up");
        }

        removeControls("controlsContent");
        removeControls("controlsQueue");
    });

    bindEvent("touchend", "#timeline", (e) => onTimelineRelease(e));
    bindEvent("mouseup", "#timeline", (e) => onTimelineRelease(e));

    bindEvent("click", "#player .fa-forward", () => nextSong());
    bindEvent("click", "#player .fa-backward", () => previousSong());

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
    player.onplayrequest = () => {
        downloadNextPart();
    }

    player.onplay = () => {
        playPauseButton("play");
    }

    player.onfinishedtrack = () => {
        let timeline = document.getElementById("timeline");
        let gapless = playlist[playIndex]["player"];

        clearInterval(secondsInterval);

        let interval = setInterval(function () {
            if (!downloading) {
                clearInterval(interval);

                if (typeof partlist[playIndex][nextPartIndex] !== "undefined" && partlist[playIndex][partIndex]["till"] + 1 < Number(timeline.max)) {
                    currentTime += getPartLength(partIndex);
                    partIndex = nextPartIndex;

                    let gid = partlist[playIndex][partIndex]["gid"];
                    gapless.gotoTrack(gid);
                    gapless.playlist.sources[gid].setPosition(0);

                    play();
                } else {
                    let nextIndex = nextSongIndex();

                    resetSong(playIndex);
                    clearInterval(secondsInterval);
                    playPauseButton("pause");

                    currentTime = 0;
                    partIndex = 0;

                    if (typeof playlist[nextIndex] !== 'undefined') {
                        playIndex = nextIndex;
                        playlist[playIndex]["player"].gotoTrack(partIndex);

                        setTimeout(() => {
                            play(true);
                        }, 1000);
                    }
                }
            }
        }, 1);
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
    let data = tryParseJSON(httpGet(pageURL + "system/player.php?id=" + songID));

    if (typeof data.length !== 'number') {
        let id = playlist.length;
        playlist[id] = data;
    } else playlist = data;
}

/*
 * Funktion: downloadNextPart()
 * Autor: Bernardo de Oliveira
 *
 * Überprüft ob das Lied fertig ist
 * Überprüft ob ein nächstes Lied in der Witoolsedergabenliste verfügbar ist
 *
 * Lädt den nächsten Teil herunter oder pausiert die weitere Wiedergabes
 */
function downloadNextPart() {
    let timeline = document.getElementById("timeline"), nextTime;

    let interval = setInterval(function () {
        nextTime = partlist[playIndex][partIndex]["till"] + 1;
        if (nextTime) {
            clearInterval(interval);

            let nextSong = false, nextIndex;

            if (!(Number(timeline.max) - nextTime > 1)) {
                nextSong = true;
                nextIndex = nextSongIndex();
            }

            let partInfo = getPartIndexByStartTime(nextTime);
            nextPartIndex = partInfo[2] ?? partIndex + 1;
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

    if (typeof playlist[sIndex]["player"] === 'undefined') {
        let gapless = new Gapless5({singleMode: true});
        addEvents(gapless);

        playlist[sIndex]["player"] = gapless;
    }

    downloading = true;
    playlist[sIndex]["player"].addTrack(pageURL + "system/player.php?id=" + songID + "&time=" + time);

    getPartLengthCallback(pIndex, function (length) {
        downloading = false;
        partlist[sIndex][pIndex] = {
            "gid": playlist[sIndex]["player"].totalTracks() - 1,
            "from": time,
            "till": time + length - 1
        };
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
function onTimelineRelease(rangeEvent) {

    let timeInfo = document.getElementById("timeInfo");
    let gapless = playlist[playIndex]["player"];
    timeInfo.style.display = "none";

    playPauseButton("load");
    clearInterval(secondsInterval);
    resetSong(playIndex);

    clearTimeout(timelineTimeout);
    timelineTimeout = setTimeout(function () {
        let partInfo = getPartIndexByTime(rangeEvent.target.value);
        let index = partInfo[2];
        currentTime = partInfo[0];

        if (typeof index === "undefined") {
            index = Object.keys(partlist[playIndex]).length;
            downloadPart(Number(rangeEvent.target.value), playIndex, index);

            currentTime = Number(rangeEvent.target.value);
        }

        let interval = setInterval(function () {
            if (typeof partlist[playIndex][index] !== 'undefined') {
                clearInterval(interval);

                let startFrom = (rangeEvent.target.value - currentTime) * 1000;
                gapless.gotoTrack(partlist[playIndex][index]["gid"]);
                partIndex = index;

                gapless.playlist.sources[partlist[playIndex][partIndex]["gid"]].setPosition(startFrom, false);
                play();
            }
        }, 50);
    }, 2000);
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
    playPauseButton("pause");

    let nextIndex = nextSongIndex();
    if (typeof playlist[nextIndex] !== 'undefined') {
        playIndex = nextIndex;

        if (typeof playlist[nextIndex]["player"] === 'undefined') {
            partlist[nextIndex] = {};
            downloadPart(0, playIndex, partIndex);
        }

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
    playPauseButton("pause");

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