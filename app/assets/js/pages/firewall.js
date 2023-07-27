if (typeof window["firewall"] !== 'undefined') throw new Error("Dieses Skript wurde bereits geladen.");

window["firewall"] = async () => {
    let objects = document.querySelectorAll("[data-url]");

    await generateFirewall(objects);
    backgroundProcesses[0] = setInterval(async () => {
        await generateFirewall(objects);
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
async function generateFirewall(objects) {
    for (let object of objects) {
        const data = tryParseJSON(httpGet(object.getAttribute("data-url")));
        const tempData = removeFromObject(data, ["comment", "dport", "flags", "tcp options", "tcp mss"]);
        const columns = getColumns(tempData, 3);

        const fragment = document.createDocumentFragment();

        const firewall = document.createElement("div");
        firewall.classList.add("firewall");

        fragment.appendChild(firewall);

        for (const [table, chains] of Object.entries(data)) {
            const title = document.createElement("h2");
            title.innerText = ucFirst(table);
            firewall.appendChild(title);

            for (const [chain, rules] of Object.entries(Object(chains))) {
                const title = document.createElement("h3");
                title.innerText = chain;
                firewall.appendChild(title);

                const table = document.createElement("table");
                table.classList.add("responsive-table");

                const thead = document.createElement("thead");
                const tr = document.createElement("tr");

                for (const column of columns) {
                    const th = document.createElement("th");
                    th.innerText = column;
                    tr.appendChild(th);
                }

                thead.appendChild(tr);

                table.appendChild(thead);
                table.appendChild(await generateTableBody(rules, columns));

                firewall.appendChild(table);
            }
        }

        object.appendChild(fragment);
    }
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

        infoText.textContent += " which follow this rule: ";
        if (row["rule"]) {
            infoText.textContent += row["rule"];
        } else {
            infoText.textContent += "no rule found";
        }


        // TODO: Generate firewall explanations
        /*if ('flags' in row) {
            infoText.textContent += "are " + row["flags"];
        }

        if ('tcp options' in row) {
            infoText.textContent += "are tcp option " + row["tcp options"];
        }

        if ('tcp mss' in row) {
            infoText.textContent += "have a tcp mss between " + row["tcp mss"];
        }*/
    }

    let div = document.createElement("div");
    div.textContent = comment;

    tableData.appendChild(infoText);
    tableData.appendChild(div);
    tableRow.appendChild(tableData);

    return tableRow;
}