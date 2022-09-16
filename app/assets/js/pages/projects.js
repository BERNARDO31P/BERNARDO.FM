/*
 * Funktion: Projects
 * Autor: Bernardo de Oliveira
 *
 * Lädt die Projekte von Github und rendert alle notwendigen Dinge
 */
window["projects"] = () => {
    let object = document.querySelector("[data-url]");

    let cards = document.createElement("div");
    cards.classList.add("cards");

    let pageCount = getGetParameter(location.href,"p") ?? 1;
    location.href = setGetParameter(location.href, "p", pageCount);

    let data = tryParseJSON(httpGet(object.dataset.url));
    if (data && data.length > 0) {
        let startIndex = (pageCount - 1) * 10;
        let paged = data.slice(startIndex, startIndex + 10);

        for (let entry of paged) {
            let card = document.createElement("div");
            card.classList.add("card");

            let title = document.createElement("h3");
            title.textContent = entry.name;
            card.appendChild(title);

            let description = document.createElement("p");
            description.textContent = entry.description;
            card.appendChild(description);

            let github = document.createElement("a");
            github.textContent = "View on GitHub";
            github.href = entry.html_url;
            github.target = "_blank";
            github.classList.add("button");
            github.classList.add("shadow");
            card.appendChild(github);


            cards.appendChild(card);
        }
    }

    object.parentNode.insertBefore(cards, object);
    object.remove();
}