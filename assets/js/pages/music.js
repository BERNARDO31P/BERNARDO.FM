if (typeof window["music"] !== 'undefined') throw new Error("Dieses Skript wurde bereits geladen.");

let MSAPI = new Audio();
document.getElementById("player").appendChild(MSAPI);

let count = 0, resizeTimeout = null, errorTimeout = null, errorTimeout2 = null, width = getWidth(), error = false, hadError = false;

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
    playlist = [];
    partlist[playIndex] = {0: 0};

    clearInterval(secondsInterval);
    secondsInterval = null;

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

    partIndex = 0;

    if (typeof playlist[playIndex]["player"] === 'undefined')
        downloadPart(0, playIndex, partIndex);

    clearInterval(secondsInterval);
    secondsInterval = null;

    playPauseButton("load");
    play(true);
});

// TODO: Comment
bindEvent("touchend", "#timeline", (e) => onTimelineRelease(e.target.value));
bindEvent("mouseup", "#timeline", (e) => onTimelineRelease(e.target.value));

bindEvent("click", "#player .fa-step-forward", () => nextSong());
bindEvent("click", "#player .fa-step-backward", () => previousSong());

// TODO: Comment
bindEvent("click", ".songList .loadMore", function () {
    let table = this.previousElementSibling, category = table.previousElementSibling;
    let loadMore = Boolean(Number(table.getAttribute("data-load")));

    if (loadMore) {
        let search = document.querySelector("#search input");
        let tbody = table.querySelector("tbody");
        let catPage = Number(table.getAttribute("data-page")) + 1;
        let catCategory = category.textContent;

        let theadColumns = table.querySelectorAll("thead tr:first-of-type th");

        let columns = [];
        for (let theadColumn of theadColumns) {
            columns.push(theadColumn.textContent.toLowerCase());
        }

        let data;
        if (search.value !== "") {
            data = tryParseJSON(httpGet(table.getAttribute("data-url") + "/" + search.value + "/" + catCategory + "/" + catPage + "/" + count));
        } else {
            data = tryParseJSON(httpGet(table.getAttribute("data-url") + "/" + catCategory + "/" + catPage + "/" + count));
        }

        if (Object.keys(data).length < count) {
            table.setAttribute("data-load", String(0));
            this.remove();
        }
        table.setAttribute("data-page", String(catPage));

        let cover = "";
        if (typeof data["cover"] !== 'undefined') {
            cover = data["cover"];
            data = removeFromObject(data, "cover", false);
        }

        generateTableBody(data, columns, tbody, cover);
    }
});

// TODO: Comment
bindEvent("click", ".scrollForward", function () {
    let element = this, categoryView = element.nextElementSibling;

    element.previousElementSibling.style.display = "flex";
    categoryView.scrollBy({left: 400, top: 0, behavior: 'smooth'});

    setTimeout(function () {
        let scrolled = Math.round(100 * categoryView.scrollLeft / (categoryView.scrollWidth - categoryView.clientWidth));
        if (scrolled === 100) element.style.display = "none";
    }, 500);
});

// TODO: Comment
bindEvent("click", ".scrollBack", function () {
    let element = this, categoryView = element.nextElementSibling.nextElementSibling;

    element.nextElementSibling.style.display = "flex";
    categoryView.scrollBy({left: -400, top: 0, behavior: 'smooth'});

    setTimeout(function () {
        let scrolled = Math.round(100 * categoryView.scrollLeft / (categoryView.scrollWidth - categoryView.clientWidth));
        if (scrolled === 0) element.style.display = "none";
    }, 500);
});

/*
 * Funktion: Anonym
 * Autor: Bernardo de Oliveira
 *
 * Versteckt beim Scrollen die Liedoptionen
 */
window.addEventListener("scroll", () => {
    removeControls("controlsContent");
});

/*
 * Funktion: Anonym
 * Autor: Bernardo de Oliveira
 *
 * Bei einer Veränderung der Grösse wird die Seite neu generiert
 * Dazu da damit genug viele Lieder angezeigt werden
 */
window.addEventListener("resize", function () {
    let newWidth = getWidth();
    if (width !== newWidth) {
        width = newWidth;
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(function () {
            if (getPage() === "music") loadPage();
        }, 200);
    }
});

// TODO: Comment
MSAPI.addEventListener("ended", function () {
    playlist[playIndex]["player"].stop();
    playlist[playIndex]["player"].onfinishedall();
});

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
        if (view === "") view = "grid";

        let data = {};
        count = Math.round(getWidth() / 160) + 2;

        if (search.value !== "") {
            data = tryParseJSON(httpGet(object.getAttribute("data-url") + "/" + search.value + "/" + count));

            let div = document.createElement("div");
            div.classList.add("searchterm");

            let h3 = document.createElement("h3");
            h3.textContent = "Search results for '" + search.value + "'";

            div.appendChild(h3);

            object.parentNode.insertBefore(div, object);
        } else {
            data = tryParseJSON(httpGet(object.getAttribute("data-url") + "/" + count));
        }


        if (Object.keys(data).length > 0) {
            let cover = "";
            if (typeof data["cover"] !== 'undefined') {
                cover = data["cover"];
                data = removeFromObject(data, "cover", false);
            }

            if (view === "list") {
                document.getElementsByClassName("fa-list")[0].classList.add("active");

                let listView = document.createElement("div");
                listView.classList.add("songList");

                for (let category in data) {
                    let songs = data[category], title = document.createElement("h2");

                    title.textContent = category;
                    listView.appendChild(title);

                    let table = generateListView(songs, cover);
                    table.setAttribute("data-page", "1");
                    table.setAttribute("data-url", object.getAttribute("data-url"));

                    if (songs.length === count)
                        table.setAttribute("data-load", String(1));

                    listView.appendChild(table);

                    if (songs.length === count) {
                        let loadMore = document.createElement("a");
                        loadMore.classList.add("loadMore");
                        loadMore.textContent = "Load more..";

                        listView.appendChild(loadMore);
                    }
                }
                object.parentNode.insertBefore(listView, object);
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

                    div.setAttribute("data-page", "1");
                    div.setAttribute("data-url", object.getAttribute("data-url"));

                    if (songs.length === count)
                        div.setAttribute("data-load", String(1));

                    div.addEventListener("scroll", (e) => {
                        let element = e.target;
                        let loadMore = Boolean(Number(element.getAttribute("data-load")));
                        let scrolled = Math.round(100 * element.scrollLeft / (element.scrollWidth - element.clientWidth));

                        if (scrolled >= 60 && loadMore) {
                            let search = document.querySelector("#search input");
                            let catPage = Number(element.getAttribute("data-page")) + 1;
                            let catCategory = element.parentElement.previousElementSibling.textContent;

                            let data;
                            if (search.value !== "") {
                                data = tryParseJSON(httpGet(element.getAttribute("data-url") + "/" + search.value + "/" + catCategory + "/" + catPage + "/" + count));
                            } else {
                                data = tryParseJSON(httpGet(element.getAttribute("data-url") + "/" + catCategory + "/" + catPage + "/" + count));
                            }

                            let cover = "";
                            if (typeof data["cover"] !== 'undefined') {
                                cover = data["cover"];
                                data = removeFromObject(data, "cover", false);
                            }

                            if (Object.keys(data).length > 0) {
                                element.setAttribute("data-page", String(catPage));
                                generateBlockView(data, element.querySelector(".songCategory"), cover);
                            } else {
                                element.setAttribute("data-load", String(0));
                            }
                        }

                        if (!isTouchScreen()) {
                            let scrollBack = div.parentElement.querySelector(".scrollBack");
                            if (scrolled === 0) scrollBack.style.display = "none";
                            else scrollBack.style.display = "flex";

                            let scrollForward = div.parentElement.querySelector(".scrollForward");
                            if (scrolled === 100) scrollForward.style.display = "none";
                            else scrollForward.style.display = "flex";
                        }

                        removeControls("controlsContent");
                    });

                    generateBlockView(songs, categoryView, cover);

                    let parent = document.createElement("div");

                    div.appendChild(categoryView);

                    if (!isTouchScreen()) {
                        let scrollBack = document.createElement("div");
                        scrollBack.classList.add("scrollBack");
                        scrollBack.innerHTML = "<i class='fas fa-arrow-left'></i>";
                        parent.appendChild(scrollBack);

                        let scrollForward = document.createElement("div");
                        scrollForward.classList.add("scrollForward");
                        scrollForward.innerHTML = "<i class='fas fa-arrow-right'></i>";
                        parent.appendChild(scrollForward);

                        if (Object.keys(songs).length > count - 3) {
                            scrollForward.style.display = "flex";
                        }
                    }

                    parent.appendChild(div);
                    gridView.appendChild(parent);
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
    player.onerror = (track) => {
        let gapless = playlist[playIndex]["player"];

        clearTimeout(errorTimeout);
        clearTimeout(errorTimeout2);

        error = true;
        errorTimeout = setTimeout(function () {
            downloading = false;
            gapless.removeTrack(track);

            prepareNextPart();
            errorTimeout2 = setTimeout(function () {
                hadError = true;
                error = false;
            }, 1000);
        }, 2000);
    }

    player.onplay = () => {
        playPauseButton("play");
        if (MSAPI.paused) MSAPI.play();

        hadError = false;

        setTimeout(function () {
            prepareNextPart();
        })
    }

    player.onfinishedtrack = () => {
        let timeline = document.getElementById("timeline");

        let waited = false;
        let interval = setInterval(function () {
            if (error) {
                pauseSong();
                playPauseButton("load");
                clearInterval(secondsInterval);
                secondsInterval = null;

                hadError = true;
            } else {
                if (!downloading) {
                    clearInterval(interval);

                    if (typeof partlist[playIndex][nextPartIndex] !== "undefined" && partlist[playIndex][partIndex]["till"] + 1 < Number(timeline.max)) {
                        partIndex = nextPartIndex;

                        if (waited || hadError) play();
                    }
                } else {
                    pauseSong();
                    playPauseButton("load");
                    clearInterval(secondsInterval);
                    secondsInterval = null;

                    waited = true;
                }
            }
        }, 50);
    }

    player.onfinishedall = () => {
        partIndex = 0;
        resetSong(playIndex);

        clearInterval(secondsInterval);
        secondsInterval = null;

        let nextIndex = nextSongIndex();
        if (typeof playlist[nextIndex] !== 'undefined')
            playIndex = nextIndex;
        else {
            pauseSong();
            return;
        }

        playPauseButton("load");

        let interval = setInterval(function () {
            if (error) {
                clearInterval(interval);
                pauseSong();
                playPauseButton("load");
            } else {
                if (!downloading) {
                    clearInterval(interval);

                    if (typeof playlist[playIndex]["player"] === "undefined")
                        downloadPart(0, playIndex, partIndex);

                    play(true);
                }
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
 * Funktion: prepareNextPart()
 * Autor: Bernardo de Oliveira
 *
 * Überprüft, ob das Lied fertig ist
 * Überprüft, ob ein nächstes Lied in der Wiedergabenliste verfügbar ist
 *
 * Lädt den nächsten Teil herunter oder pausiert die weitere Wiedergabe
 */
function prepareNextPart() {
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

            if (!nextSong) {
                playlist[playIndex]["player"].queueTrack(nextPartIndex);
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
        let gapless = new Gapless5({logLevel: LogLevel.Debug});
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

    let columns = Object.keys(removeFromObject(data[0], ["id", "category", "player", "coverPos", "info"]));
    listView.appendChild(generateTableHead(columns));
    listView.appendChild(generateTableBody(data, columns));

    return listView;
}

// TODO: Comment
function generateBlockView(songs, categoryView, cover) {
    for (let arrayID in songs) {
        let song = songs[arrayID];

        let card = document.createElement("div");
        card.setAttribute("data-id", song["id"]);

        if (typeof song["playlist"] === 'undefined') {
            card.classList.add("songCard");
            card.innerHTML = "<div class=\"darker\"></div>" +
                "<div class=\"cover\" style=\"background-image: url('" + cover + "'); background-position-x: -" + song["coverPos"] / 200 * 160 + "px\"></div>" +
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
}

/*
 * Funktion: generateListView()
 * Autor: Bernardo de Oliveira
 * Argumente:
 *  data: (Object) Die Daten, welche verarbeitet werden sollen
 *
 * Generiert eine Tabelle aus den Daten (Table body) und Schlüssel (Table head)
 */
function generateListView(data, cover) {
    let table = document.createElement("table");
    table.classList.add("responsive-table");

    let columns = getColumns(data, 1);
    columns = removeFromObject(columns, ["id", "category", "player", "coverPos", "info"]);

    if (columns.includes("playlist")) {
        columns.unshift("cover");
        columns.push("artists");

        columns = removeFromObject(columns, ["playlist"]);
    }

    table.appendChild(generateTableHead(columns));

    let tbody = document.createElement("tbody");
    tbody.onscroll = () => {
        removeControls("controlsQueue");
    };

    generateTableBody(data, columns, tbody, cover);

    table.appendChild(tbody);
    return table;
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

    clearTimeout(timelineTimeout);
    if (typeof index === "undefined") {
        timelineTimeout = setTimeout(function () {
            index = Object.keys(partlist[playIndex]).length;
            downloadPart(Number(value), playIndex, index);

            let interval = setInterval(function () {
                if (!downloading) {
                    clearInterval(interval);

                    let startFrom = (value - partlist[playIndex][index]["from"]) * 1000;

                    gapless.gotoTrack(partlist[playIndex][index]["gid"]);
                    partIndex = index;
                    MSAPI.currentTime = value;

                    gapless.playlist.sources[partlist[playIndex][partIndex]["gid"]].setPosition(startFrom, false);
                    play();
                }
            }, 50);
        }, 2000);
    } else {
        let interval = setInterval(function () {
            if (typeof partlist[playIndex][index] !== 'undefined') {
                clearInterval(interval);

                let startFrom = (value - partlist[playIndex][index]["from"]) * 1000;

                gapless.gotoTrack(partlist[playIndex][index]["gid"]);
                partIndex = index;
                MSAPI.currentTime = value;

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