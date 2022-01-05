if (typeof window["firewall"] !== 'undefined') throw new Error("Dieses Skript wurde bereits geladen.");

window["firewall"] = () => {
    let objects = document.querySelectorAll("[data-url]");

    generateFirewall(objects);
    backgroundProcesses[0] = setInterval(function () {
        generateFirewall(objects);
    }, 2000);

}

/*
 * Funktion: Anonym
 * Autor: Bernardo de Oliveira
 *
 * Zeigt bei einem Click den Kommentar der Tabellenzeile
 * Blendet alle anderen Kommentare aus
 */
bindEvent("click", "#firewall tr", function () {
    let nextRow = this.parentNode.rows[this.rowIndex];

    if (!nextRow.classList.contains("show")) {
        document.querySelectorAll("#firewall .comment").forEach(function (element) {
            element.classList.remove("show");
        });

        if (nextRow && nextRow.classList.contains("comment")) nextRow.classList.add("show");
    } else {
        nextRow.classList.remove("show");
    }
});

/*
 * Funktion: Anonym
 * Autor: Bernardo de Oliveira
 *
 * Beim Verlassen von einem Kommentar wird der Kommentar ausgeblendet
 */
bindEvent("mouseout", ".comment.show", function () {
    this.classList.remove("show");
});

/*
 * Funktion: generateFirewall()
 * Autor: Bernardo de Oliveira
 *
 * Holt sich die Firewall Daten und verarbeitet diese
 * Generiert die Titel der Firewall Tabellen und Chains
 * Scrollt an die gleiche Position in der Tabelle wie vor dem Aktualisieren der Daten
 * Öffnet die vorher geöffneten Kommentare
 */
function generateFirewall(objects) {
    let toScroll = {};

    for (let object of objects) {
        let firewall = document.createElement("div");
        firewall.id = "firewall";

        let data = tryParseJSON(httpGet(object.getAttribute("data-url")));
        let tempData = removeFromObject(data, "comment");
        let columns = getColumns(tempData, 3);

        for (let [table, chains] of Object.entries(data)) {
            let h2 = document.createElement("h2");
            h2.textContent = ucFirst(table);

            firewall.appendChild(h2);

            for (let [chain, rules] of Object.entries(Object(chains))) {
                let h3 = document.createElement("h3");
                h3.textContent = chain;

                firewall.appendChild(h3);

                let table = document.createElement("table");
                table.classList.add("responsive-table");

                table.appendChild(generateTableHead(columns));
                table.appendChild(generateFirewallBody(rules, columns));

                let container = document.createElement("div");
                container.classList.add("responsive-container");
                container.appendChild(table)
                firewall.appendChild(container);
            }
        }

        let comments = {};
        let oldContainers = object.querySelectorAll(".responsive-container");
        let i = 0;
        for (let oldContainer of Object.values(oldContainers)) {
            if (oldContainer.scrollLeft) toScroll[i] = oldContainer.scrollLeft;

            let commentElements = oldContainer.querySelectorAll(".comment");

            let j = 0;
            for (let commentElement of Object.values(commentElements)) {
                if (commentElement.classList.contains("show")) {
                    if (typeof comments[i] === 'undefined') comments[i] = [];
                    comments[i].push(j);
                }
                j++;
            }
            i++;
        }

        object.innerHTML = "";
        object.appendChild(firewall);

        let newContainers = object.querySelectorAll(".responsive-container");
        for (let [key, value] of Object.entries(toScroll)) {
            newContainers[key].scrollLeft = value;
        }

        i = 0;
        for (let newContainer of Object.values(newContainers)) {
            let commentElements = newContainer.querySelectorAll(".comment");

            let j = 0;
            for (let commentElement of Object.values(commentElements)) {
                if (typeof comments[i] !== 'undefined' && comments[i].includes(j)) {
                    commentElement.classList.add("show");
                }
                j++;
            }
            i++;
        }
    }
}

/*
 * Funktion: generateFirewallBody()
 * Autor: Bernardo de Oliveira
 * Argumente:
 *  data: (Objekt) Die Daten, welche verarbeitet werden sollen
 *  columns: (Array) Definiert die Spaltentitel
 *  tbody: (Objekt) Definiert den Table Body
 *
 * Generiert den Table Body aus den Daten
 * Generiert einzelne Zeilen und verwendet die gleiche Funktion wie bei music.js
 * Generiert noch eine Kommentarzeile
 *
 * Fügt alles zum Table Body hinzu
 */
function generateFirewallBody(data, columns, tbody = null) {
    if (!tbody) tbody = document.createElement("tbody");

    for (let row of data) {
        let tableRow = document.createElement("tr"), comment = "";
        tableRow.classList.add("csr-pointer");

        if (typeof row["comment"] !== 'undefined') comment = row["comment"];

        row = removeFromObject(row, ["id", "comment"]);
        generateTableRow(row, tableRow, columns);
        let commentRow = generateCommentRow(row, comment, columns.length);

        tbody.appendChild(tableRow);
        tbody.appendChild(commentRow);
    }

    return tbody;
}

/*
 * Funktion: generateCommentRow()
 * Autor: Bernardo de Oliveira
 * Argumente:
 *  row: (Objekt) Die Daten der Zeile um einen Kommentar zu generieren
 *  comment: (String) Definiert den vordefinierten Kommentar (IPTables Kommentar)
 *  columnCount: (Integer) Definiert die Spalten Anzahl
 *
 * Generiert aus den Daten ein Kommentar
 * Fügt noch zusätzlich den IPTables Kommentar hinzu
 *
 * Gibt diesen zurück
 */
function generateCommentRow(row, comment, columnCount) {
    let tableRow = document.createElement("tr");
    tableRow.classList.add("comment");

    let tableData = document.createElement("td");
    tableData.setAttribute("colspan", columnCount);

    let infoText = document.createElement("div");
    if (["ACCEPT", "DROP"].includes(row["target"])) {
        if (row["target"] === "DROP") {
            infoText.textContent += ucFirst(row["target"].toLowerCase()) + "ping ";
        } else {
            infoText.textContent += ucFirst(row["target"].toLowerCase()) + "ing ";
        }

        if (["tcp", "udp"].includes(row["prot"])) {
            infoText.textContent += "all " + row["prot"] + " packets";
        } else {
            infoText.textContent += row["prot"] + " packets";
        }

    }

    let div = document.createElement("div");
    div.textContent = comment;

    tableData.appendChild(infoText);
    tableData.appendChild(div);
    tableRow.appendChild(tableData);

    return tableRow;
}