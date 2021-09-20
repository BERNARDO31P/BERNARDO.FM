let httpGetM = await import(pageURL + "assets/js/httpGet.js");
let tryParseJSONM = await import(pageURL + "assets/js/tryParseJSON.js");

if (typeof window["home"] !== 'undefined') throw new Error("Dieses Skript wurde bereits geladen.");

window["home"] = () => {
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

                if (typeof quote["details"] !== "undefined") {
                    html += "<div class='details'><span>" + quote["details"] + "</span></div>";
                    html += "<button class='detailsButton' type='button'>Show more</button>";
                }

                html += "<div class='authorDate'>";
                html += "<span class='author'>" + quote["author"] + "</span>";
                html += "<span> - </span>"
                html += "<span class='date'>" + quote["date"] + "</span>";
                html += "</div>";
                html += "</div>";

                object.innerHTML = object.innerHTML + html;
            }
            object.removeAttribute("data-url");
        } else {
            object.innerHTML = "There was an error loading this page. Please try again later or reloading the page.";
        }
    }

    /*
     * Funktion: Anonym
     * Autor: Bernardo de Oliveira
     *
     * Zeigt die Details von einem Beitrag an oder versteckt sie wieder
     */
    bindEvent("click", ".detailsButton", function () {
        let details = prev(this);

        if (details.classList.contains("show")) {
            this.innerText = "Show more";
            details.classList.remove("show");
        } else {
            let elements = document.querySelectorAll(".details");
            for (let i = 0; i < elements.length; i++) {
                elements[i].classList.remove("show");
            }

            this.innerText = "Show less";
            details.classList.add("show");
        }
    });
}