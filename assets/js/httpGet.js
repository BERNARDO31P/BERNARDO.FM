/*
 * Funktion: httpGet()
 * Autor: Joan [https://stackoverflow.com/questions/247483/http-get-request-in-javascript]
 * Argumente:
 *  url: (String) URL von welcher heruntergeladen werden soll
 *
 * Holt sich den Inhalt einer URL und gibt diesen zurück
 */
export function httpGet(url) {
    let xmlHttp = new XMLHttpRequest();

    xmlHttp.open("GET", url, false);

    try {
        xmlHttp.send(null);
        return xmlHttp.responseText;
    } catch (e) {
        return "<body>There was an error performing this request. Please try again later or reloading the page.</body>";
    }

}