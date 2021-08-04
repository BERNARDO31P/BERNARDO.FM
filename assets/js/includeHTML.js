let httpGetM = await import(window.location.protocol + "//" + window.location.host + "/assets/js/httpGet.js");

/*
 * Funktion: htmlToElement()
 * Autor: Bernardo de Oliveira
 * Argumente:
 *  html: (String) HTML String welcher zu einem Element werden soll
 *
 * Wandelt ein String zu einem HTML Element um und gibt dieses zurück
 */
export function htmlToElement(html) {
    let parser = new DOMParser();
    return parser.parseFromString(html, "text/html");
}

/*
 * Funktion: dataIncludeReplace()
 * Autor: Bernardo de Oliveira
 *
 * Alle HTML Objekte mit dem Attribut "data-include" sowie "data-replace" werden ausgewählt
 * Gefundene Objekte werden mit einer Schleife geladen
 * In der Schleife wird das Attribut ausgelesen
 *
 * Die ausgelesene Datei wird in das Objekt geladen
 * oder das Objekt wird durch die ausgelesene Datei ersetzt
 */
export function dataIncludeReplace(object) {
    let elementsInclude = object.querySelectorAll('[data-include]');
    let elementsReplace = object.querySelectorAll('[data-replace]');


    for (let i = 0, len = elementsInclude.length; i < len; i++) {
        let url = elementsInclude[i].getAttribute("data-include");
        let data = htmlToElement(httpGetM.httpGet(url));

        let dataElementsInclude = data.querySelectorAll('[data-include]');
        let dataElementsReplace = data.querySelectorAll('[data-replace]');
        if (dataElementsInclude.length || dataElementsReplace.length) {
            dataIncludeReplace(data);
        }

        elementsInclude[i].innerHTML = data.body.innerHTML;
        elementsInclude[i].removeAttribute("data-include");
    }

    for (let i = 0, len = elementsReplace.length; i < len; i++) {
        let url = elementsReplace[i].getAttribute("data-replace");
        let data = htmlToElement(httpGetM.httpGet(url));

        let dataElementsInclude = data.querySelectorAll('[data-include]');
        let dataElementsReplace = data.querySelectorAll('[data-replace]');
        if (dataElementsInclude.length || dataElementsReplace.length) {
            dataIncludeReplace(data);
        }

        elementsReplace[i].outerHTML = data.body.innerHTML;
    }
}

dataIncludeReplace(document.body);