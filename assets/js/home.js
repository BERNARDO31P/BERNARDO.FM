import {tryParseJSON} from "http://localhost:8080/assets/js/tryParseJSON.js";
import {httpGet} from "http://localhost:8080/assets/js/httpGet.js";

let objects = document.querySelectorAll("[data-url]");
for (let i = 0; i < objects.length; i++) {
    let object = objects[i];
    let data = tryParseJSON(httpGet(object.getAttribute("data-url")));

    if (data) {
        data = Array.prototype.concat(data["greeting"], data["changelog"]);
        for (let j = 0; j < data.length; j++) {
            let quote = data[j];

            let html = "<div class='blockquote'>";
            html += "<h2>" + quote["title"] + "</h2>";
            html += "<span class='message'>" + quote["message"] + "</span>";
            html += "<span class='author'>" + quote["author"] + "</span>";
            html += "<span class='date'>" + quote["date"] + "</span>";
            html += "<span class='details'>" + quote["details"] + "</span>";
            html += "</div>";

            object.innerHTML = object.innerHTML + html;
        }
    } else {
        object.innerHTML = "There was an error loading this page. Please try again later or reloading the page.";
    }
}
