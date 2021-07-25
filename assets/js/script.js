import {httpGet} from "./httpGet.js";
import {htmlToElement, dataIncludeReplace} from "./includeHTML.js";

let page, body = $("body");
let scripts = document.getElementsByTagName("script");

/*
 * Funktion: dataIncludeReplace()
 * Autor: Bernardo de Oliveira
 *
 * Lädt eine den Inhalt einer externen Seite und fügt diesen in den internen Inhalt ein
 * Ändert den Titel der Webseite
 * Wird durch ein Event aufgerufen
 */
function loadPage() {
    let content = document.querySelector("#content"), title = document.querySelector("title");
    let data = htmlToElement(httpGet("./pages/" + page + ".html"));

    dataIncludeReplace(data);

    content.innerHTML = data.body.innerHTML;

    let subpage = (data.querySelector("title")) ? data.querySelector("title").innerText : "error";
    title.innerText = title.innerText.split(" - ")[0] + " - " + subpage;

    let scripts = data.getElementsByTagName("script");
    for (let i = 0; i < scripts.length; i++) {
        let script = "data:application/javascript;charset=utf-8," + encodeURIComponent(httpGet(scripts[i].src));
        import(script);
    }
}
window.addEventListener('popstate', loadPage);

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

body.on("click", "[data-page]", (e) => {
    page = e.target.dataset.page;
    window.location.href = "#!page=" + page;
});

body.on("DOMSubtreeModified", "#navbarPre", function () {
    page = getPage();
    window.location.href = "#!page=" + page;
});

body.on("click", "#navigation a", function () {
    let navigation = document.querySelector("#navigation");

    if (navigation.classList.contains("show"))
        navigation.classList.remove("show");
});

body.on("click", "#navbar-toggler", function () {
    let navigation = document.querySelector("#navigation");

    if (navigation.classList.contains("show"))
        navigation.classList.remove("show");
    else
        navigation.classList.add("show");
});