if (typeof window["music"] !== 'undefined') throw new Error("Dieses Skript wurde bereits geladen.");

setPositionState(0, 0);

let count = 0, resizeTimeout = null;

document.addEventListener("click", hideContext);

/*
 * Funktion: Anonym
 * Autor: Bernardo de Oliveira
 *
 * Ändert die Ansicht zwischen Gitter und Liste
 */
bindEvent("click", "#view [data-prefix='fas']:not(.active)", function () {
    setCookie("view", this.dataset.view, getExpireTime(30));
    loadPage();
});

/*
 * Funktion: Anonym
 * Autor: Bernardo de Oliveira
 *
 * Fügt ein Lied zur Wiedergabenliste hinzu
 */
bindEvent("click", "#content .listAdd", function () {
    addSongToPlaylist(this);

    if (playlist.length === 1) {
        downloadPart(0, playIndex, partIndex).then(() => {
            play(true);
        });
    }

    showNotification("Song added to queue", 3000);
});

// TODO: Comment
function playAction(card) {
    clearSongs();

    addSongToPlaylist(card);
    playPauseButton("load");

    downloadPart(0, playIndex, partIndex).then(() => {
        let player = playlist[playIndex]["player"];

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

        play(true);
    });
}

/*
 * Funktion: Diverse Funktionen
 * Autor: Bernardo de Oliveira
 *
 * Diverse Funktionen welche durch Benutzereingaben ausgelöst werden
 */
bindEvent("click", ".card .darker, .songList tr[data-id]", function () {
    playAction(this.closest(".card") ?? this);
});
bindEvent("contextmenu", ".card .darker, .songList tr[data-id]", function (e) {
    e.preventDefault();
    if (!isTouchScreen()) showContext(e, this.closest(".card") ?? this);
});
bindEvent("touchstart", ".card .darker, .songList tr[data-id]", function (e) {
    if (isTouchScreen()) {
        touchTimeout = setTimeout(() => {
            showContext(e, this.closest(".card") ?? this);
        }, 500);
    }
});
bindEvent("touchend", ".card .darker, .songList tr[data-id]", function () {
    if (isTouchScreen()) clearTimeout(touchTimeout);
});

function hideContext() {
    const contextMenu = document.getElementById("contextMenu");

    contextMenu.style.display = "none";
    contextMenu.innerHTML = "";
}

function showContext(e, card) {
    hideContext();

    const contextMenu = document.getElementById("contextMenu");
    if (!isTouchScreen()) {
        const computedStyle = window.getComputedStyle(contextMenu);
        const contextPadding = Number(computedStyle.padding.replace("px", "")) * 2;
        const contextWidth = Number(computedStyle.width.replace("px", "")) + contextPadding;
        const coords = [e.clientX, e.clientY];

        if (width - e.clientX > contextWidth) {
            contextMenu.style.left = coords[0] - 10 + "px";
            contextMenu.style.top = coords[1] - 10 + "px";
        } else {
            contextMenu.style.left = width - contextWidth + 10 + "px";
            contextMenu.style.top = coords[1] - 10 + "px";
        }
    }

    const data = tryParseJSON(httpGet(pageURL + "system/song/" + card.dataset.id));
    const songName = document.createElement("div");
    songName.classList.add("songName");
    songName.textContent = data["name"];

    const songArtist = document.createElement("div");
    songArtist.classList.add("songArtist");
    songArtist.textContent = data["artist"] ?? "Album/Playlist";

    const row = document.createElement("div");
    row.classList.add("row");
    row.append(songName, songArtist);

    const cover = document.createElement("div");
    cover.classList.add("cover");
    if (typeof data["cover"] !== "undefined") {
        cover.style.backgroundImage = "url('" + data["cover"] + "?size=64" + "')";
    } else {
        const coverElement = card.querySelector(".cover");
        cover.style.backgroundImage = coverElement.style.backgroundImage;
        cover.style.backgroundSize = "64px";
    }

    const songInfo = document.createElement("div");
    songInfo.classList.add("songInfo");
    songInfo.append(cover, row);

    contextMenu.appendChild(songInfo);
    const divider = document.createElement("div");
    divider.classList.add("divider");

    contextMenu.appendChild(divider);

    const menuItems = [
        {
            "name": "Add to queue",
            "icon": () => {
                const addDiv = document.createElement('div');
                addDiv.classList.add("icon", "listAdd");
                addDiv.title = 'Add this song to the queue';

                const listIcon = createIconElement('fas fa-list');
                const plusIcon = createIconElement('fas fa-plus');

                addDiv.append(listIcon, plusIcon);
                return addDiv;
            },
            "action": () => {
                addSongToPlaylist(card);
                showNotification("Song added to queue", 3000);
            }
        },
        {
            "name": "Play as next",
            "icon": () => {
                const addDiv = document.createElement('div');
                addDiv.classList.add("icon", "listAdd");
                addDiv.title = 'Add this song to the queue';

                const listIcon = createIconElement('fas fa-list');
                const plusIcon = createIconElement('fas fa-play');

                addDiv.append(listIcon, plusIcon);
                return addDiv;
            },
            "action": () => {
                addSongToPlaylist(card, 0, true);
                showNotification("Song will be played next", 3000);
            }
        },
        {
            "name": "Share",
            "icon": () => {
                const addDiv = document.createElement('div');
                addDiv.classList.add("icon", "listAdd");
                addDiv.title = 'Share this song';

                const listIcon = createIconElement('fas fa-share');

                addDiv.append(listIcon);
                return addDiv;
            },
            "action": () => {
                const url = pageURL + "#!page=music&s=" + card.dataset.id;
                const title = "Share " + data["name"] + " by " + data["artist"];
                const text = "Check out this song on BERNARDO.FM!";

                navigator.share({title: title, text: text, url: url});
            }
        }
    ];

    const menu = document.createElement("div");
    menu.classList.add("menu");

    for (let menuItem of menuItems) {
        const item = document.createElement("div");
        item.classList.add("item");

        const text = document.createElement("span");
        text.textContent = menuItem["name"];

        item.append(menuItem["icon"](), text);
        item.addEventListener("click", () => {
            menuItem["action"]();
            contextMenu.style.display = "none";
        });

        menu.appendChild(item);
    }

    contextMenu.appendChild(menu);
    contextMenu.style.display = "block";
}

/*
 * Funktion: Anonym
 * Autor: Bernardo de Oliveira
 *
 * Lädt neue Lieder nach
 */
bindEvent("click", ".songList .loadMore", function () {
    let table = prev(this), category = prev(table);
    let search = document.querySelector("#search input");
    let tbody = table.querySelector("tbody");
    let catPage = Number(table.dataset.page) + 1;
    let catCategory = category.textContent;

    let theadColumns = table.querySelectorAll("thead tr:first-of-type th");

    let columns = [];
    for (let theadColumn of theadColumns) {
        columns.push(theadColumn.textContent.toLowerCase());
    }

    let data;
    if (search.value !== "") {
        data = tryParseJSON(httpGet(table.dataset.url + "/" + search.value + "/" + catCategory + "/" + catPage + "/" + count));
    } else {
        data = tryParseJSON(httpGet(table.dataset.url + "/" + catCategory + "/" + catPage + "/" + count));
    }

    if (Object.keys(data).length < count)
        this.remove();

    table.setAttribute("data-page", String(catPage));

    let cover = "";
    if (typeof data["cover"] !== 'undefined') {
        cover = data["cover"];
        data = removeFromObject(data, "cover", false);
    }

    generateTableBody(data, columns, tbody, cover);
});

/*
 * Funktion: Anonym
 * Autor: Bernardo de Oliveira
 *
 * Scrollt am PC vorwärts binnen der Musikkategorie
 * Löscht den Knopf, wenn das Ende erreicht wird
 */
bindEvent("click", ".scrollForward", function () {
    let element = this, categoryView = element.nextElementSibling;
    let parentDiv = element.parentElement;


    prev(element).style.display = "flex";
    categoryView.scrollBy({left: parentDiv.getBoundingClientRect().width - 200, top: 0, behavior: 'smooth'});

    setTimeout(function () {
        let scrolled = Math.round(100 * categoryView.scrollLeft / (categoryView.scrollWidth - categoryView.clientWidth));
        if (scrolled === 100) element.style.display = "none";
    }, 500);
});

/*
 * Funktion: Anonym
 * Autor: Bernardo de Oliveira
 *
 * Scrollt am PC rückwärts binnen der Musikkategorie
 * Löscht den Knopf, wenn das Ende erreicht wird
 */
bindEvent("click", ".scrollBack", function () {
    let element = this, categoryView = element.nextElementSibling.nextElementSibling;
    let parentDiv = element.parentElement;

    element.nextElementSibling.style.display = "flex";
    categoryView.scrollBy({left: -(parentDiv.getBoundingClientRect().width - 200), top: 0, behavior: 'smooth'});

    setTimeout(function () {
        let scrolled = Math.round(100 * categoryView.scrollLeft / (categoryView.scrollWidth - categoryView.clientWidth));
        if (scrolled === 0) element.style.display = "none";
    }, 500);
});

/*
 * Funktion: Anonym
 * Autor: Bernardo de Oliveira
 *
 * Bei einer Veränderung der Grösse wird die Seite neu generiert
 * Dazu da damit genug viele Lieder angezeigt werden
 */
window.addEventListener("resize", function () {
    // TODO: Update logic to only download the other songs if needed
    let newWidth = getWidth();
    if (width !== newWidth) {
        width = newWidth;
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(function () {
            if (getGetParameter(location.href, "page") === "music") loadPage();
        }, 200);
    }
});

/*
 * Funktion: music
 * Autor: Bernardo de Oliveira
 *
 * Lädt die Musik Seite und rendert alle notwendigen Dinge
 */
window["music"] = async () => {    /*
     * Author: Bernardo de Oliveira
     *
     * Die Lautstärke wird in einem Cookie gespeichert
     * Hier wird dieser ausgelesen und gesetzt
     * Nur wenn der Ton nicht auf Stumm war
     */
    if (getCookie("muted") !== "true") {
        let vol = getCookie("volume");
        if (vol === "") vol = 0.5;
        volume = Number(vol);
    }

    /*
     * Author: Bernardo de Oliveira
     *
     * Setzt den je nach Lautstärke das richtige Icon und den richtigen Wert (UI)
     */
    let volumeSlider = document.getElementsByClassName("volume")[0].querySelector(".volumeSlider");
    let volumeIcon = prev(volumeSlider.closest(".volumeBackground"));
    volumeSlider.value = volume * 100;
    setVolumeIcon(volumeIcon, volumeSlider);

    /*
     * Author: Bernardo de Oliveira
     *
     * Geht alle Elemente mit einem data-url Attribut durch und lädt die Informationen herunter
     * Zum Link wird noch eine Suche hinzugefügt, wenn vorhanden
     *
     * Je nach Ansicht wird diese generiert
     */
    let objects = document.querySelectorAll("[data-url]"), search = document.querySelector("#search input");
    for (let object of objects) {
        let data = {};
        count = Math.round(getWidth() / 160) + 2;

        if (search.value !== "") {
            data = tryParseJSON(httpGet(object.dataset.url + "/" + search.value + "/" + count));

            let div = document.createElement("div");
            div.classList.add("searchterm");

            let h3 = document.createElement("h3");
            h3.textContent = "Search results for '" + search.value + "'";

            div.appendChild(h3);

            object.parentNode.insertBefore(div, object);
        } else {
            data = tryParseJSON(httpGet(object.dataset.url + "/" + count));
        }


        if (data && Object.keys(data).length > 0) {
            let cover = "";
            if (typeof data["cover"] !== 'undefined') {
                cover = data["cover"];
                data = removeFromObject(data, "cover", false);
            }

            let view = getCookie("view");
            if (!view) view = "grid";
            if (view === "list") {
                document.getElementsByClassName("fa-list")[0].classList.add("active");

                let listView = document.createElement("div");
                listView.classList.add("songList");

                for (let category in data) {
                    let songs = data[category], title = document.createElement("h2");

                    title.textContent = category;
                    listView.appendChild(title);

                    let table = await generateListView(songs, cover);
                    table.setAttribute("data-page", "1");
                    table.setAttribute("data-url", object.dataset.url);

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
                    div.setAttribute("data-url", object.dataset.url);

                    if (songs.length === count)
                        div.setAttribute("data-load", String(1));

                    /*
                     * Funktion: handler()
                     * Author: Bernardo de Oliveira
                     * Argumente:
                     *  e: (Event) Das jetzige Event
                     *
                     * Lädt neue Lieder nach, sobald mehr 60% gescrollt wurde
                     * Wenn kein Touchgerät, dann werden die Knöpfe je nach Scroll-Position angepasst
                     */
                    div.addEventListener("scroll", async function handler(e) {
                        let element = e.target;
                        let scrolled = Math.round(100 * element.scrollLeft / (element.scrollWidth - element.clientWidth));

                        if (scrolled >= 60) {
                            let search = document.querySelector("#search input");
                            let catPage = Number(element.dataset.page) + 1;
                            let catCategory = prev(element.parentElement).textContent;

                            let data;
                            if (search.value !== "") {
                                data = tryParseJSON(httpGet(element.dataset.url + "/" + search.value + "/" + catCategory + "/" + catPage + "/" + count));
                            } else {
                                data = tryParseJSON(httpGet(element.dataset.url + "/" + catCategory + "/" + catPage + "/" + count));
                            }

                            let cover = "";
                            if (typeof data["cover"] !== 'undefined') {
                                cover = data["cover"];
                                data = removeFromObject(data, "cover", false);
                            }

                            if (Object.keys(data).length > 0) {
                                element.setAttribute("data-page", String(catPage));
                                await generateBlockView(data, element.querySelector(".songCategory"), cover);
                            } else {
                                element.removeEventListener("scroll", handler);
                            }
                        }
                    });

                    div.addEventListener("scroll", function (e) {
                        let element = e.target;
                        let scrolled = Math.round(100 * element.scrollLeft / (element.scrollWidth - element.clientWidth));

                        if (!isTouchScreen()) {
                            let scrollBack = div.parentElement.querySelector(".scrollBack");
                            if (scrolled === 0) scrollBack.style.display = "none";
                            else scrollBack.style.display = "flex";

                            let scrollForward = div.parentElement.querySelector(".scrollForward");
                            if (scrolled === 100) scrollForward.style.display = "none";
                            else scrollForward.style.display = "flex";
                        }
                    });

                    await generateBlockView(songs, categoryView, cover);

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

    /*
     * Funktion: Keine
     * Author: Bernardo de Oliveira
     *
     * Dafür da, damit man ein Lied teilen kann und dieses sofort anfängt zu spielen
     */
    if (hasGetParameter(location.href, "s")) {
        let songID = getGetParameter(location.href, "s");
        let time = 0;

        if (hasGetParameter(location.href, "t")) {
            time = Number(getGetParameter(location.href, "t"));
        }

        addSongToPlaylist(null, songID);
        if (typeof playlist[playIndex] !== 'undefined' && playlist[playIndex]) {
            playPauseButton("load");
            downloadPart(time, playIndex, partIndex).then(() => {
                play(true, true);
            });
        }
    }
}

/*
 * Funktion: addSongToPlaylist()
 * Autor: Bernardo de Oliveira
 * Argumente:
 *  element: (Object) Das Element, welches überprüft werden soll
 *
 * Liest die ID vom Lied aus den Objekt-Eigenschaften aus
 * Lädt die Informationen vom Lied herunter und fügt diese zur Wiedergabenliste hinzu
 */
function addSongToPlaylist(element, id = 0, next = false) {
    let songID = id;
    if (element) songID = element.dataset.id;

    let data = tryParseJSON(httpGet(pageURL + "system/song/" + songID));

    if (typeof data[0] === "undefined") data = [data];
    else deleteMultiple(data, ["cover", "name", "artist"]);

    const songs = Object.values(data);

    if (!next) {
        playlist = [...playlist, ...songs];
    } else {
        playlist = [
            ...playlist.slice(0, playIndex + 1),
            ...songs,
            ...playlist.slice(playIndex + 1)
        ]
    }

    changedQueue = true;
}

/*
 * Funktion: generateBlockView()
 * Autor: Bernardo de Oliveira
 * Argumente:
 *  songs: (Object) Definiert die Songs in der Kategorie
 *  categoryView: (Object) Definiert die Musikkategorie
 *  cover: (String) Definiert das Sprites Cover, falls vorhanden
 *
 * Generiert aus den Daten -> Cards 
 * Generiert auch Playlist Cards
 */
async function generateBlockView(songs, categoryView, cover) {
    const fragment = document.createDocumentFragment();

    for (let arrayID in songs) {
        let song = songs[arrayID];
        let card;

        if (typeof song["playlist"] === "undefined") {
            card = document.createElement('div');
            card.classList.add("songCard", "card");
            card.dataset.id = song.id;

            const darker = document.createElement('div');
            darker.className = 'darker';

            const coverDiv = document.createElement('div');
            coverDiv.className = 'cover';
            coverDiv.style.backgroundImage = `url(${cover})`;
            coverDiv.style.backgroundPositionX = `-${song['coverPos'] / 200 * 160}px`;

            const nameSpan = document.createElement('span');
            nameSpan.className = 'name';
            nameSpan.dataset.title = song.name;
            nameSpan.textContent = song.name;

            const artistSpan = document.createElement('span');
            artistSpan.className = 'artist';
            artistSpan.dataset.title = song.artist;
            artistSpan.textContent = song.artist;

            const lengthSpan = document.createElement('span');
            lengthSpan.className = 'length';
            lengthSpan.textContent = song.length;

            card.append(darker, coverDiv, nameSpan, artistSpan, lengthSpan);
        } else {
            let info = await generatePlaylistInfo(song);

            card = document.createElement('div');
            card.classList.add("playlistCard", "card");
            card.dataset.id = song.id;

            const darkerDiv = document.createElement('div');
            darkerDiv.className = 'darker';

            const coverDiv = document.createElement('div');
            coverDiv.className = 'cover';
            coverDiv.style.backgroundImage = `url('${info.cover}')`;

            const nameSpan = document.createElement('span');
            nameSpan.className = 'name';
            nameSpan.dataset.title = song.name;
            nameSpan.textContent = song.name;

            const artistSpan = document.createElement('span');
            artistSpan.className = 'artist';
            artistSpan.dataset.title = info.artists;
            artistSpan.textContent = info.artists;

            card.append(darkerDiv, coverDiv, nameSpan, artistSpan);
        }

        fragment.appendChild(card);
    }

    categoryView.appendChild(fragment);
}

/*
 * Funktion: generateListView()
 * Autor: Bernardo de Oliveira
 * Argumente:
 *  data: (Object) Die Daten, welche verarbeitet werden sollen
 *  cover: (String) Definiert das Sprites Cover, falls vorhanden
 *
 * Generiert eine Tabelle aus den Daten (Table body) und Schlüssel (Table head)
 */
async function generateListView(data, cover) {
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
    table.appendChild(await generateTableBody(data, columns, null, cover));
    return table;
}