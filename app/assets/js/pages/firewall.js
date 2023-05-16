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
    for (let object of objects) {
        const data = tryParseJSON(httpGet(object.getAttribute("data-url")));
        const tempData = removeFromObject(data, ["comment", "dport", "flags", "tcp options", "tcp mss"]);
        const columns = getColumns(tempData, 3);


        object.innerHTML = `<div id="firewall">
            ${(() => {
                let html = "";
                for (const [table, chains] of Object.entries(data)) {
                    html += `<h2>${ucFirst(table)}</h2>
                        ${(() => {
                            let html = "";
                            for (const [chain, rules] of Object.entries(Object(chains))) {
                                html += `<h3>${chain}</h3>
                                    <div class="responsive-container">
                                        <table class="responsive-table">
                                           <thead>
                                           ${(() => {
                                    let html = "";
                                    for (const column of columns) {
                                        html += `<th>${column}</th>`;
                                    }
                                    return html;
                                })()}
                                           </thead>
                                           ${generateTableBody(rules, columns).innerHTML}
                                        </table>
                                    </div>`;
                            }
                            return html;
                    })()}
                            `;
                }
                return html;
        })()}
        </div>`;
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