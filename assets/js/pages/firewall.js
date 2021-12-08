if (typeof window["firewall"] !== 'undefined') throw new Error("Dieses Skript wurde bereits geladen.");

let text = {};

window["firewall"] = () => {
    let objects = document.querySelectorAll("[data-url]");

    generateFirewall(objects);
    backgroundProcesses[0] = setInterval(function () {
        generateFirewall(objects);
    }, 2000);

}

// TODO: Comment
bindEvent("click", "#firewall tr", function () {
    let nextRow = this.parentNode.rows[this.rowIndex];

    document.querySelectorAll("#firewall .comment").forEach(function (element) {
        element.classList.remove("show");
    });

    if (nextRow && nextRow.classList.contains("comment")) nextRow.classList.add("show");
});

bindEvent("mouseout", ".comment.show", function () {
    this.classList.remove("show");
});

// TODO: Comment
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
            h2.innerText = ucFirst(table);

            firewall.appendChild(h2);

            for (let [chain, rules] of Object.entries(Object(chains))) {
                let h3 = document.createElement("h3");
                h3.innerText = chain;

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

        let oldContainers = object.querySelectorAll(".responsive-container");
        let i = 0;
        for (let oldContainer of Object.values(oldContainers)) {
            if (oldContainer.scrollLeft) toScroll[i] = oldContainer.scrollLeft;

            i++;
        }

        object.innerHTML = "";
        object.appendChild(firewall);

        let newContainers = object.querySelectorAll(".responsive-container");
        for (let [key, value] of Object.entries(toScroll)) {
            newContainers[key].scrollLeft = value;
        }
    }
}

/*
 * Funktion: generateFirewallBody()
 * Autor: Bernardo de Oliveira
 * Argumente:
 *  data: (Object) Die Daten, welche verarbeitet werden sollen
 *
 * Generiert eine Tabelle aus den Daten (Table body)
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

// TODO: Comment
function generateCommentRow(row, comment, columnCount) {
    let tableRow = document.createElement("tr");
    tableRow.classList.add("comment");

    let tableData = document.createElement("td");
    tableData.setAttribute("colspan", columnCount);

    // TODO: Generate info text
    let div = document.createElement("div");
    div.innerText = comment;

    tableData.appendChild(div);
    tableRow.appendChild(tableData);

    return tableRow;
}