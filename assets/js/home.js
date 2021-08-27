let httpGetM = await import(window.location.protocol + "//" + window.location.host + "/assets/js/httpGet.js");
let tryParseJSONM = await import(window.location.protocol + "//" + window.location.host + "/assets/js/tryParseJSON.js");

window["home"] = function loadHome() {
    let objects = document.querySelectorAll("[data-url]");
    for (let i = 0; i < objects.length; i++) {
        let object = objects[i];
        let data = tryParseJSONM.tryParseJSON(httpGetM.httpGet(object.getAttribute("data-url")));

        if (data) {
            data = Array.prototype.concat(data["greeting"], data["changelog"]);
            for (let j = 0; j < data.length; j++) {
                let html = "";

                if (j !== 0)
                    html += "<div class='divider'></div>";

                let quote = data[j];

                html += "<div class='blockquote'>";
                html += "<h2>" + quote["title"] + "</h2>";
                html += "<span class='message'>" + quote["message"] + "</span>";
                html += "<div class='authorDate'>";
                html += "<span class='author'>" + quote["author"] + "</span>";
                html += "<span> - </span>"
                html += "<span class='date'>" + quote["date"] + "</span>";
                html += "</div>";
                html += "<span class='details'>" + quote["details"] + "</span>";
                html += "</div>";

                object.innerHTML = object.innerHTML + html;
            }
            object.removeAttribute("data-url");
        } else {
            object.innerHTML = "There was an error loading this page. Please try again later or reloading the page.";
        }
    }
}