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
                columns.shift();
                columns.pop();

                let gridView = document.createElement("div");
                gridView.classList.add("songGrid");

                let category, categoryView;
                for (let j = 0; j < Object.keys(data).length; j++) {
                    let song = data[j];

                    if (category !== song["category"]) {
                        if (typeof categoryView !== 'undefined') gridView.appendChild(categoryView);

                        categoryView = document.createElement("div");
                        categoryView.classList.add("songCategory");

                        category = song["category"];

                        let title = document.createElement("h2");

                        title.innerText = category;
                        gridView.appendChild(title);
                    }

                    let songCard = document.createElement("div");
                    songCard.classList.add("songCard");
                    songCard.setAttribute("data-id", song["id"]);

                    songCard.innerHTML = "<img src='" + song["cover"] + "' alt='Cover'/>" +
                        "<span class='name'>" + song["name"] + "</span>" +
                        "<span class='artist'>" + song["artist"] + "</span>" +
                        "<span class='length'>" + song["length"] + "</span>";

                    categoryView.appendChild(songCard);
                }

                gridView.appendChild(categoryView);
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
        let pos = this.getBoundingClientRect();

        controls.style.left = pos.right - 100 + "px";
        controls.style.top = pos.top + (pos.height - 38) / 2 + "px";
        controls.style.display = "initial";
        controls.setAttribute("data-id", this.getAttribute("data-id"));
    });

    /*
     * Funktion: Anonym
     * Autor: Bernardo de Oliveira
     *
     * Zeigt die Optionen von einem Lied (Abspielen, zur Wiedergabeliste hinzufügen usw)
     */
    bindEvent("mouseover", ".songCard", function () {
        let controls = document.getElementById("controlsContent");
        let pos = this.getBoundingClientRect();

        controls.style.top = pos.top + pos.height - 38 + "px";
        controls.style.left = pos.left + "px";
        controls.style.display = "initial";
        controls.setAttribute("data-id", this.getAttribute("data-id"));
    });

    /*
     * Funktion: Anonym
     * Autor: Bernardo de Oliveira
     *
     * Versteckt die Liedoptionen
     */
    bindEvent("mouseout", "#content", function (e) {
        if (!e.target.classList.contains("#controlsContent")
            && e.target.closest("#controlsContent") === null
            && e.target.closest("#content tr[data-id]") === null
            && e.target.closest(".songCard") === null) {

            let controls = document.getElementById("controlsContent");
            controls.style.display = "none";
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
    });

    /*
     * Funktion: Anonym
     * Autor: Bernardo de Oliveira
     *
     * Setzt die Wiedergabenliste zurück und spielt das Lied ab
     */
    bindEvent("click", "#content .fa-play", function () {
        for (let i = 0; i < Object.keys(playlist).length; i++) {
            clearSong(i);
        }

        playIndex = 0;
        currentTime = 0;
        playlist = {};

        clearInterval(secondsInterval);
        addSongToPlaylist(this);
        play();
    });

    /*
     * Funktion: Anonym
     * Autor: Bernardo de Oliveira
     *
     * Versteckt beim Scrollen die Liedoptionen
     */
    window.addEventListener("scroll", function () {
        let controls = document.getElementsByClassName("controls")[0];

        if (typeof controls !== 'undefined' && controls.style.display !== "none")
            controls.style.display = "none";
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
    player.onplay = function () {
        let currentPart = playlist[playIndex]["player"].trk.trackNumber;
        let partCount = playlist[playIndex]["player"].totalTracks();

        if (currentPart === partCount)
            downloadNextPart();
    }

    player.onnext = function () {
        let partTime = getPartLength(2);
        let timeline = document.getElementById("timeline");

        if (Number(timeline.max) - currentTime > 0)
            currentTime += partTime;

        let currentPart = playlist[playIndex]["player"].trk.trackNumber;
        let partCount = playlist[playIndex]["player"].totalTracks();

        if (currentPart === partCount)
            downloadNextPart();
    }

    player.onfinishedall = function () {
        let nextIndex = nextSongIndex();

        if (typeof playlist[nextIndex] !== 'undefined') {
            playIndex = nextIndex;
            clearInterval(secondsInterval);

            playPauseButton(false);
            play();
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

    let gapless = new Gapless5();
    gapless.addTrack(data["location"]);
    addEvents(gapless);

    let index = Object.keys(playlist).length;

    playlist[index] = {};
    playlist[index]["id"] = data["id"];
    playlist[index]["cover"] = data["cover"];
    playlist[index]["name"] = data["name"];
    playlist[index]["artist"] = data["artist"];
    playlist[index]["length"] = data["length"];
    playlist[index]["player"] = gapless;
}

/*
 * Funktion: downloadNextPart()
 * Autor: Bernardo de Oliveira
 *
 * Überprüft ob das Lied fertig ist
 * Überprüft ob ein nächstes Lied in der Wiedergabenliste verfügbar ist
 *
 * Lädt den nächsten Teil herunter oder pausiert die weitere Wiedergabe
 */
function downloadNextPart() {
    let timeline = document.getElementById("timeline");
    let stop = false;

    setTimeout(function () {
        let nextTime = currentTime + getPartLength(1);

        if (!(Number(timeline.max) - nextTime > 0)) {
            const nextIndex = nextSongIndex();

            if (typeof nextIndex !== 'undefined' && typeof playlist[nextIndex] !== 'undefined') {
                playIndex = nextIndex;
            } else {
                stop = true;
            }
        }

        if (!stop) {
            let songID = playlist[playIndex]["id"];

            let data = tryParseJSONM.tryParseJSON(httpGetM.httpGet(pageURL + "system/player.php?id=" + songID + "&time=" + nextTime));
            playlist[playIndex]["player"].addTrack(data["location"]);
        }
    }, 2000);
}
