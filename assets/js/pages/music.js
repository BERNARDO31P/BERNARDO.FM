let httpGetM = await import(window.location.protocol + "//" + window.location.host + "/assets/js/httpGet.js");
let tryParseJSONM = await import(window.location.protocol + "//" + window.location.host + "/assets/js/tryParseJSON.js");

if (typeof window["music"] !== 'undefined') throw new Error("Dieses Skript wurde bereits geladen.");

window["music"] = () => {
    let objects = document.querySelectorAll("[data-url]"), search = document.querySelector("#search");
    let view = getCookie("view");

    for (let i = 0; i < objects.length; i++) {
        let object = objects[i];
        let data = tryParseJSONM.tryParseJSON(httpGetM.httpGet(object.getAttribute("data-url") + "?search=" + search.value));

        if (view === "") {
            if (getWidth() < 1150) view = "list";
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

                let table = document.createElement("table");
                let columns = Object.keys(data[0]);
                columns.shift();

                table.classList.add("listView");

                let thead = document.createElement("thead");
                for (let j = 0; j < columns.length; j++) {
                    let th = document.createElement("th");
                    th.innerText = ucFirst(columns[j]);
                    thead.appendChild(th);
                }

                table.appendChild(thead);

                let tbody = document.createElement("tbody");
                for (let j = 0; j < Object.keys(data).length; j++) {
                    let song = data[j];

                    let row = document.createElement("tr");
                    row.setAttribute("data-id", song["id"]);
                    row.innerHTML = "<td><img src='" + song["cover"] + "' alt='Cover'></td>" +
                        "<td>" + song["name"] + "</td>" +
                        "<td>" + song["artist"] + "</td>" +
                        "<td>" + song["length"] + "</td>";

                    tbody.appendChild(row);
                }

                table.appendChild(tbody);

                object.parentNode.insertBefore(table, object);
            } else {
                document.getElementsByClassName("fa-grip-horizontal")[0].classList.add("active");
                // TODO: Icon view
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

    bindEvent("mouseover", "tr", function () {
        let controls = document.getElementsByClassName("controls")[0];
        let pos = this.getBoundingClientRect();

        if (getWidth() < 1250) controls.style.left = pos.width - 80 + "px";
        else controls.style.left = pos.width + "px";

        controls.style.top = pos.top + 2 + "px";
        controls.style.display = "initial";
        controls.setAttribute("data-id", this.getAttribute("data-id"));
    });

    bindEvent("mouseout", "#content", function (e) {
        if (!e.target.classList.contains(".controls") && e.target.closest(".controls") === null && e.target.closest("tr") === null) {
            let controls = document.getElementsByClassName("controls")[0];

            if (typeof controls !== 'undefined') controls.style.display = "none";
        }
    });

    bindEvent("click", "#content .listAdd", function () {
        addSongToPlaylist(this);
    });

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

    window.addEventListener("scroll", function () {
        let controls = document.getElementsByClassName("controls")[0];

        if (typeof controls !== 'undefined' && controls.style.display !== "none")
            controls.style.display = "none";
    });
}

// TODO: Comment
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
            clearInterval(secondsInterval);

            playPauseButton(false);
            play();
        }
    }
}

// TODO: Comment
function addSongToPlaylist(element) {
    let controls = element.closest(".controls");
    let songID = controls.getAttribute("data-id");
    let data = tryParseJSONM.tryParseJSON(httpGetM.httpGet(window.location.protocol + "//" + window.location.host + "/system/player.php?id=" + songID));

    let gapless = new Gapless5();
    gapless.addTrack(data["location"]);
    addEvents(gapless);

    let index = Object.keys(playlist).length;

    playlist[index] = {};
    playlist[index]["id"] = data["id"];
    playlist[index]["name"] = data["name"];
    playlist[index]["artist"] = data["artist"];
    playlist[index]["length"] = data["length"];
    playlist[index]["cover"] = data["cover"];
    playlist[index]["player"] = gapless;
}

// TODO: Comment
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

            let data = tryParseJSONM.tryParseJSON(httpGetM.httpGet(window.location.protocol + "//" + window.location.host + "/system/player.php?id=" + songID + "&time=" + nextTime));
            playlist[playIndex]["player"].addTrack(data["location"]);
        }
    }, 2000);
}
