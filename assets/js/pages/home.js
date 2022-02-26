if (typeof window["home"] !== 'undefined') throw new Error("Dieses Skript wurde bereits geladen.");

window["home"] = () => {
    let objects = document.querySelectorAll("[data-url]");

    for (let object of objects) {
        let data = tryParseJSON(httpGet(object.getAttribute("data-url")));

        if (data) {
            data = Array.prototype.concat(data["greeting"], data["changelog"]);

            for (let [key, quote] of Object.entries(Object(data))) {
                let html = "";

                if (Number(key) !== 0) html += "<div class='divider'></div>";

                html += "<div class='blockquote'>";
                html += "<h2>" + quote["title"] + "</h2>";

                let messages = quote["message"].split("<br/>");

                html += "<span class='message'>";
                for (const [i, message] of messages.entries()) {
                    if (i !== messages.length - 1) html += "<p>" + message + "</p>";
                    else html += "<p class='break'>" + message + "</p>";
                }
                html += "</span>";

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
        this.textContent = "Show more";
        details.classList.remove("show");
    } else {
        let elements = document.querySelectorAll(".details.show");
        for (let element of elements) {
            element.classList.remove("show");
        }

        this.textContent = "Show less";
        details.classList.add("show");
    }
});