let httpGetM = await import(pageURL + "assets/js/httpGet.js");
let tryParseJSONM = await import(pageURL + "assets/js/tryParseJSON.js");

if (typeof window["music"] !== 'undefined') throw new Error("Dieses Skript wurde bereits geladen.");

window["music"] = () => {
    let objects = document.querySelectorAll("[data-url]"), search = document.querySelector("#search");
    let view = getCookie("view");

    for (let i = 0; i < objects.length; i++) {
        let object = objects[i];
        let data = tryParseJSONM.tryParseJSON(httpGetM.httpGet(object.getAttribute("data-url") + "?search=" + search.value));

        if (view === "") {
            if (getWidth() < mobileWidth) view = "list";
            else view = "grid";
        }

        if (search.value !== "") {
            let div = document.createElement("div");
            div.classList.add("searchterm");

            let h3 = document.createElement("h3");
            h3.innerText = "Search results for '" + search.value + "'";

            div.appendChild(h3);

            object.parentNode.insertBefore(div, object);
        }

        if (data.length > 0) {
            if (view === "list") {
                document.getElementsByClassName("fa-list")[0].classList.add("active");
                object.parentNode.insertBefore(generateTable(data), object);
            } else {
                document.getElementsByClassName("fa-grip-horizontal")[0].classList.add("active");

                let columns = Object.keys(data[0]);
                columns = columns.slice(1, 5);

                let gridView = document.createElement("div");
                gridView.classList.add("songGrid");

                let parsed = {};
                for (let j = 0; j < Object.keys(data).length; j++) {
                    let song = data[j];

                    let card = document.createElement("div");
                    card.setAttribute("data-id", song["id"]);

                    if (typeof song["playlist"] === 'undefined') {
                        card.classList.add("songCard");
                        card.innerHTML = "<img src='/system/img/" + song["cover"] + "' alt='Cover'/>" +
                            "<span class='name'>" + song["name"] + "</span>" +
                            "<span class='artist'>" + song["artist"] + "</span>" +
                            "<span class='length'>" + song["length"] + "</span>";
                    } else {
                        card.classList.add("playlistCard");
                        song["playlist"] = song["playlist"].sort((a, b) => 0.5 - Math.random());

                        let artists = "";
                        for (let i = 0; i < 4; i++) {
                            let songID = song["playlist"][i];
                            let data = tryParseJSONM.tryParseJSON(httpGetM.httpGet(pageURL + "system/player.php?id=" + songID));
                            card.innerHTML += "<img src='/system/img/" + data["cover"] + "' alt='Cover'/>";

                            artists += data["artist"] + ", ";
                        }

                        card.innerHTML += "<span class='name'>" + song["name"] + "</span>" +
                            "<span class='artist'>" + artists + "</span>";
                    }

                    if (typeof parsed[song["category"]] === 'undefined') parsed[song["category"]] = [];

                    let key = Object.keys(parsed[song["category"]] ?? []).length;
                    parsed[song["category"]].push(card);

                }

                for (let category in parsed) {
                    let cards = parsed[category], title = document.createElement("h2");

                    title.innerText = category;
                    gridView.appendChild(title);

                    let div = document.createElement("div"), categoryView = document.createElement("div");
                    categoryView.classList.add("songCategory");

                    div.addEventListener("scroll", () => {
                        removeControls("controlsContent");
                    });

                    cards = cards.sort((a, b) => 0.5 - Math.random());

                    for (let arrayID in cards) {
                        let card = cards[arrayID];
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
            span.innerText = "We couldn't find any song with that search term";

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
        let controls = document.getElementById("controlsContent");
        controls.style.display = "none";


        let height = Number(getComputedStyle(controls).height.replace("px", ""));
        let pos = this.getBoundingClientRect();

        controls.style.left = pos.right - 100 + "px";
        controls.style.top = pos.top + (pos.height - height) / 2 + "px";
        controls.setAttribute("data-id", this.getAttribute("data-id"));

        setTimeout(() => {
            controls.style.display = "initial"
        }, 50);
    });

    bindEvent("mouseover", ".songCard", function () {
        showControlsCard(this)
    });
    bindEvent("mouseover", ".playlistCard", function () {
        showControlsCard(this)
    });
    bindEvent("click", ".songCard", function () {
        showControlsCard(this)
    });
    bindEvent("click", ".playlistCard", function () {
        showControlsCard(this)
    });

    /*
     * Funktion: Anonym
     * Autor: Bernardo de Oliveira
     *
     * Versteckt die Liedoptionen
     */
    bindEvent("mouseout", "#content", function (e) {
        if (e.target.id !== "controlsContent"
            && e.target.closest("#controlsContent") === null
            && e.target.closest("#content tr[data-id]") === null
            && e.target.closest(".songCard") === null
            && e.target.closest(".playlistCard") === null) {

            let controls = document.getElementById("controlsContent");
            if (controls) controls.style.display = "none";
        }
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
        for (let i = 0; i < playlist.length; i++) {
            clearSong(i);
        }

        playIndex = 0;
        partIndex = 0;
        currentTime = 0;
        playlist = [];
        partlist[playIndex] = {0: 0};

        clearInterval(secondsInterval);
        addSongToPlaylist(this);
        downloadPart(0);
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
        let body = document.getElementsByTagName("body")[0];

        if (this.getAttribute("data-angle") === "up") {
            hidePlaylist(body, queueView, this);
        } else {
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
            queue.appendChild(generateTable(playlist, false, true));

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

        document.getElementById("controlsContent").style.display = "none";
        document.getElementById("controlsQueue").style.display = "none";
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
    /*player.onplay = function () {
        let currentPart = playlist[playIndex]["player"].trk.trackNumber;
        let partCount = playlist[playIndex]["player"].totalTracks();

        if (currentPart === partCount)
            downloadNextPart();
    }*/

    player.onplay = () => downloadNextPart();

    player.onfinishedtrack = function () {
        let timeline = document.getElementById("timeline");
        let gapless = playlist[playIndex]["player"];
        let index = Math.ceil(timeline.value / 20);

        clearInterval(secondsInterval);
        resetSong(playIndex);

        if (typeof partlist[playIndex][index] !== "undefined") {
            let partLength = getCurrentPartLength();
            if (!partLength) partLength = 20;

            if (Number(timeline.max) - currentTime > 0) currentTime += partLength;

            gapless.gotoTrack(partlist[playIndex][index]);
            gapless.sources[partlist[playIndex][index]].setPosition(0);
            partIndex = index;

            play();
        } else {
            let nextIndex = nextSongIndex();

            playlist[playIndex]["player"].stop();
            clearInterval(secondsInterval);
            playPauseButton(false);

            currentTime = 0;
            partIndex = 0;

            if (typeof playlist[nextIndex] !== 'undefined') {
                playIndex = nextIndex;
                playlist[playIndex]["player"].gotoTrack(partIndex);

                setTimeout(() => {
                    playlist[playIndex]["player"].sources[partIndex].setPosition(0);
                    play(true);
                }, 1000);
            }
        }
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
    let controls = element.closest("#controlsContent");
    let songID = controls.getAttribute("data-id");
    let data = tryParseJSONM.tryParseJSON(httpGetM.httpGet(pageURL + "system/player.php?id=" + songID));

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
    setTimeout(function () {
        let timeline = document.getElementById("timeline");
        let partLength = getCurrentPartLength();

        if (!partLength) partLength = 20;

        let nextTime = currentTime + partLength, nextSong = false, nextIndex;

        if (!(Number(timeline.max) - nextTime > 1)) {
            nextSong = true;
            nextIndex = nextSongIndex();
        }

        let currentPart = playlist[playIndex]["player"].trk.trackNumber;
        let partCount = playlist[playIndex]["player"].totalTracks();

        if (!nextSong && currentPart === partCount) {
            let songID = playlist[playIndex]["id"];
            let data = tryParseJSONM.tryParseJSON(httpGetM.httpGet(pageURL + "system/player.php?id=" + songID + "&time=" + nextTime));

            let indexPart = partIndex + 1;
            let index = playlist[playIndex]["player"].sources.length;

            playlist[playIndex]["player"].addTrack(data["location"]);

            if (typeof partlist[playIndex] === 'undefined') partlist[playIndex] = {};
            partlist[playIndex][indexPart] = index;

        } else if (typeof partlist[nextIndex] === 'undefined' && typeof playlist[nextIndex] !== 'undefined') {
            let songID = playlist[nextIndex]["id"];
            let data = tryParseJSONM.tryParseJSON(httpGetM.httpGet(pageURL + "system/player.php?id=" + songID + "&time=0"));

            let gapless = new Gapless5();
            gapless.addTrack(data["location"]);
            addEvents(gapless);

            playlist[nextIndex]["player"] = gapless;
            partlist[nextIndex] = {0: 0};
        }
    }, 2000);
}

/*
 * Funktion: downloadPart()
 * Autor: Bernardo de Oliveira
 * Argumente:
 *  time: (Integer) Definiert die Zeit, ab wann der nächste Teil beginnt
 *
 * Lädt ein Teilstück von einem Lied herunter, ab einer bestimmten Zeit
 */
function downloadPart(time) {
    let songID = playlist[playIndex]["id"];
    let data = tryParseJSONM.tryParseJSON(httpGetM.httpGet(pageURL + "system/player.php?id=" + songID + "&time=" + time));

    if (typeof playlist[playIndex]["player"] === 'undefined') {
        let gapless = new Gapless5();
        addEvents(gapless);

        playlist[playIndex]["player"] = gapless;
    }
    playlist[playIndex]["player"].addTrack(data["location"]);
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
    columns = columns.slice(1, 5);

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

        if (typeof song["playlist"] === 'undefined') {
            row.innerHTML = "<td><img src='/system/img/" + song["cover"] + "' alt='Cover'/></td>" +
                "<td>" + song["name"] + "</td>" +
                "<td>" + song["artist"] + "</td>" +
                "<td>" + song["length"] + "</td>";
        } else {
            song["playlist"] = song["playlist"].sort((a, b) => 0.5 - Math.random());

            let artists = "", cover = document.createElement("div");
            cover.classList.add("cover");
            for (let i = 0; i < 4; i++) {
                let songID = song["playlist"][i];
                let data = tryParseJSONM.tryParseJSON(httpGetM.httpGet(pageURL + "system/player.php?id=" + songID));
                cover.innerHTML += "<img src='/system/img/" + data["cover"] + "' alt='Cover'/>";

                artists += data["artist"] + ", ";
            }
            let td = document.createElement("td");
            td.appendChild(cover)
            row.appendChild(td);

            row.innerHTML += "<td>" + song["name"] + "</td>" +
                "<td>" + artists.substring(0, 50) + "..</td>" +
                "<td></td>";
        }

        tbody.appendChild(row);
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
    let controls = document.getElementById("controlsContent");
    let pos = card.getBoundingClientRect();
    let top = Math.round((pos.top + pos.height - 36) * 1000) / 1000 + "px",
        left = Math.round((pos.left - 2) * 1000) / 1000 + "px";

    controls.style.display = "initial";
    if (controls.style.top !== top || controls.style.left !== left) {
        controls.style.display = "none";

        controls.style.top = top;
        controls.style.left = left;

        controls.setAttribute("data-id", card.getAttribute("data-id"));

        setTimeout(() => {
            controls.style.display = "initial";
        }, 50);
    }
}

/*
 * Funktion: onTimelineRelease()
 * Autor: Bernardo de Oliveira
 *
 * Sobald die Timeline wieder losgelassen wird, wird das tooltip mit dem jetzigen Fortschritt des Liedes versteckt
 * Die Wiedergabe beginnt
 */
function onTimelineRelease(rangeEvent) {
    let tooltip = document.getElementById("tooltip");
    let gapless = playlist[playIndex]["player"];
    tooltip.style.display = "none";

    clearInterval(secondsInterval);
    resetSong(playIndex);

    let index = Math.floor(rangeEvent.target.value / 20);
    currentTime = index * 20;

    if (typeof gapless.sources[partlist[playIndex][index]] === "undefined") {
        downloadPart(currentTime);
        partlist[playIndex][index] = gapless.sources.length - 1;
    }

    let startFrom = (rangeEvent.target.value % 20) * 1000;
    gapless.gotoTrack(partlist[playIndex][index]);
    partIndex = index;

    setTimeout(() => {
        gapless.sources[partlist[playIndex][partIndex]].setPosition(startFrom, false);
        play();
    }, 1000);
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

        if (typeof playlist[nextIndex]["player"] === 'undefined') {
            downloadPart(0);
            partlist[playIndex] = {0: 0};
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
    playPauseButton(false);

    let previousIndex = previousSongIndex();
    if (typeof playlist[previousIndex] !== 'undefined') {
        playIndex = previousIndex;

        if (typeof playlist[previousIndex]["player"] === 'undefined') {
            downloadPart(0);
            partlist[playIndex] = {0: 0};
        }

        play(true);
    }
}