let httpGetM = await import(window.location.protocol + "//" + window.location.host + "/assets/js/httpGet.js");
let includeHTMLM = await import(window.location.protocol + "//" + window.location.host + "/assets/js/includeHTML.js");

/*
 * Funktion: dataIncludeReplace()
 * Autor: Bernardo de Oliveira
 *
 * Lädt eine den Inhalt einer externen SeiLeider konnten wir keine Songs findente und fügt diesen in den internen Inhalt ein
 * Ändert den Titel der Webseite
 * Wird durch ein Event aufgerufen
 */
function loadPage() {
    let content = document.querySelector("#content"), title = document.querySelector("title");
    let data = includeHTMLM.htmlToElement(httpGetM.httpGet("./pages/" + page + ".html"));

    includeHTMLM.dataIncludeReplace(data);

    content.innerHTML = data.body.innerHTML;

    let subpage = (data.querySelector("title")) ? data.querySelector("title").innerText : "error";
    title.innerText = title.innerText.split(" - ")[0] + " - " + subpage;

    let scripts = data.getElementsByTagName("script");
    for (let i = 0; i < scripts.length; i++) {
        let script = URL.createObjectURL(new Blob([httpGetM.httpGet(scripts[i].src)], {
            type: 'application/javascript'
        }));
        import(script);
    }

    let i = 0;
    let pageLoad = setInterval(function () {
        if (typeof window[page] !== 'undefined') {
            clearInterval(pageLoad);
            window[page]();
        } else if (i > 3) {
            clearInterval(pageLoad);
            console.log("Function not implemented.");
        }
        i++;
    }, 100);
}
window.addEventListener('popstate', loadPage);

/*
 * Funktion: getPage()
 * Autor: Bernardo de Oliveira
 *
 * Holt die derzeitige Seite aus der URL
 * wenn keine definitiert ist, wird die Startseite zurückgegeben
 */
function getPage() {
    let hash = window.location.hash;
    let match = hash.match("page=[^&]*");

    if (match)
        return match[0].split("=")[1];

    return "home";
}

/*
 * Funktion: Anonym
 * Autor: Bernardo de Oliveira
 *
 * Wenn der Benutzer sich nicht ganz oben befindet, wird ein Schatten zur Navigation hinzugefügt
 */
window.addEventListener("scroll", () => {
    let navbar = document.querySelector("#navbar");

    if (window.scrollY === 0) {
        navbar.classList.remove("shadow");
    } else {
        navbar.classList.add("shadow");
    }
});

/*
 * Funktion: Anonym
 * Autor: Bernardo de Oliveira
 *
 * Sobald eine neue Unterseite angedrückt wird, wird diese in die URL eingefügt
 */
bindEvent("click", "[data-page]", function (e) {
    let navigation = document.querySelector("#navigation");
    if (navigation.classList.contains("show"))
        navigation.classList.remove("show");

    page = e.target.dataset.page;
    prevPage = undefined;
    window.location.href = "#!page=" + page;
});

/*
 * Funktion: Anonym
 * Autor: Bernardo de Oliveira
 *
 * Öffnet die Navigation oder schliesst sie
 */
bindEvent("click", "#navbar-toggler", function () {
    let navigation = document.querySelector("#navigation");

    if (navigation.classList.contains("show"))
        navigation.classList.remove("show");
    else
        navigation.classList.add("show");
});

bindEvent("click", "#player .fa-pause", () => pauseSong());

bindEvent("click", "#player .fa-play", () => playSong());

bindEvent("click", "#player .fa-forward", () => nextSong());

bindEvent("click", "#player .fa-backward", () => previousSong());

bindEvent("touchstart", "#timeline", () => onTimelinePress());

bindEvent("touchend", "#timeline", () => onTimelineRelease());

bindEvent("mousedown", "#timeline", () => onTimelinePress());

bindEvent("input", "#timeline", (e) => onTimelineMove(e));

bindEvent("mouseup", "#timeline", () => onTimelineRelease());

/*
 * Funktion: Anonym
 * Autor: Bernardo de Oliveira
 *
 * Ändert die Unterseite zu "music" und speichert sich die vorherige Seite
 */
bindEvent("input", "#search", function () {
    if (page !== "music") prevPage = getPage();

    if (this.value || typeof prevPage === 'undefined') page = "music";
    else page = prevPage;

    window.location.href = "#!page=" + page;
});

/*
 * Funktion: Anonym
 * Autor: Bernardo de Oliveira
 *
 * Ändert die Ansicht auf Listenansicht
 */
bindEvent("click", "#view .fa-list", function () {
    setCookie("view", "list");
    window.location.href = "#!page=" + page;
});

/*
 * Funktion: Anonym
 * Autor: Bernardo de Oliveira
 *
 * Ändert die Ansicht auf Gitteransicht
 */
bindEvent("click", "#view .fa-grip-horizontal", function () {
    setCookie("view", "grip");
    window.location.href = "#!page=" + page;
});

page = getPage();
window.location.href = "#!page=" + page;
