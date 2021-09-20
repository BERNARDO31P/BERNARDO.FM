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

bindEvent("click", "[data-page]", function (e) {
    let navigation = document.querySelector("#navigation");
    if (navigation.classList.contains("show"))
        navigation.classList.remove("show");

    page = e.target.dataset.page;
    prevPage = undefined;
    window.location.href = "#!page=" + page;
});

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

bindEvent("mousedown", "#timeline", function () {
    let tooltip = document.getElementById("tooltip");
    tooltip.style.display = "initial";

    clearInterval(secondsInterval);
    playPauseButton(false);
    playlist[playIndex]["player"].pause();
});

bindEvent("input", "#timeline", function () {
    let tooltip = document.getElementById("tooltip");
    let measurementTooltip = tooltip.getBoundingClientRect();
    let measurementRange = this.getBoundingClientRect();
    let leftPos = mouseX - (measurementTooltip["width"] / 2);

    if (leftPos < 0)
        leftPos = 0;
    else if ((leftPos + measurementTooltip["width"]) > getWidth())
        leftPos = getWidth() - measurementTooltip["width"];

    tooltip.style.top = (measurementRange["top"] - measurementTooltip["height"] - 10) + "px";
    tooltip.style.left = leftPos + "px";

    let currentTimestamp = tooltip.querySelector("#current");
    currentTimestamp.innerText = getMinutesAndSeconds(this.value);
});

bindEvent("mouseup", "#timeline", function () {
    let tooltip = document.getElementById("tooltip");
    tooltip.style.display = "none";

    play();
});

bindEvent("input", "#search", function () {
    if (page !== "music") prevPage = getPage();

    if (this.value || typeof prevPage === 'undefined') page = "music";
    else page = prevPage;

    window.location.href = "#!page=" + page;
});

bindEvent("click", "#view .fa-list", function () {
    setCookie("view", "list");
    window.location.href = "#!page=" + page;
});

bindEvent("click", "#view .fa-grip-horizontal", function () {
    setCookie("view", "grip");
    window.location.href = "#!page=" + page;
});

page = getPage();
window.location.href = "#!page=" + page;
