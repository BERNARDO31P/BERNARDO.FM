let httpGetM = await import(window.location.protocol + "//" + window.location.host + "/assets/js/httpGet.js");
let includeHTMLM = await import(window.location.protocol + "//" + window.location.host + "/assets/js/includeHTML.js");
let tryParseJSONM = await import(window.location.protocol + "//" + window.location.host + "/assets/js/tryParseJSON.js");

let page;

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

    setTimeout(function () {
        try {
            window[page]();
        } catch (e) {
            console.log("Function not implemented.");
        }
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
    window.location.href = "#!page=" + page;
});

bindEvent("click", "#navbar-toggler", function () {
    let navigation = document.querySelector("#navigation");

    if (navigation.classList.contains("show"))
        navigation.classList.remove("show");
    else
        navigation.classList.add("show");
});

bindEvent("click", "#player .fa-pause", function () {
    this.classList.remove("fa-pause");
    this.classList.add("fa-play");

    playlist[playIndex]["player"].pause();
});

bindEvent("click", "#player .fa-play", function () {
    this.classList.remove("fa-play");
    this.classList.add("fa-pause");

    playlist[playIndex]["player"].play();
});

bindEvent("click", "#player .fa-forward", function () {
    playIndex += 1;

    for (let i = 0; i < Object.keys(playlist).length; i++) {
        playlist[i]["player"].stop();
    }

    playPauseButton();
    play();
});

bindEvent("click", "#player .fa-backward", function () {
    playIndex -= 1;

    for (let i = 0; i < Object.keys(playlist).length; i++) {
        playlist[i]["player"].stop();
    }

    playPauseButton();
    play();
});

page = getPage();
window.location.href = "#!page=" + page;
