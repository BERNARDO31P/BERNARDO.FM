if (typeof window["firewall"] !== 'undefined') throw new Error("Dieses Skript wurde bereits geladen.");

let openRowKey = null;

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
bindEvent("click", ".firewall tr:not(.comment)", function () {
    const nextRow = this.nextElementSibling;

    if (!nextRow || !nextRow.classList.contains("comment")) return;

    const isOpen = nextRow.classList.contains("show");

    document.querySelectorAll(".firewall tr.comment").forEach(el => {
        el.classList.remove("show");
    });

    if (!isOpen) {
        nextRow.classList.add("show");
        openRowKey = this.dataset.key; // store
    } else {
        openRowKey = null;
    }
});
/*
 * Funktion: Anonym
 * Autor: Bernardo de Oliveira
 *
 * Beim Verlassen von einem Kommentar wird der Kommentar ausgeblendet
 */
bindEvent("mouseout", ".comment.show", function () {
    openRowKey = null;
    this.classList.remove("show");
});

function getColumnsForRules(rules) {
    const columns = new Set();

    for (const row of Object.values(rules)) {
        for (const key of Object.keys(row)) {
            if (key !== "comment") { // exclude meta field
                columns.add(key);
            }
        }
    }

    return Array.from(columns);
}

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
        const data = await httpGetJSON(object.getAttribute("data-url"));

        if (!data) {
            continue;
        }

        const fragment = document.createDocumentFragment();

        const firewall = document.createElement("div");
        firewall.classList.add("firewall");

        fragment.appendChild(firewall);

        for (const [tableName, chains] of Object.entries(data)) {
            const title = document.createElement("h2");
            title.innerText = ucFirst(tableName);
            firewall.appendChild(title);

            for (const [chain, rules] of Object.entries(Object(chains))) {
                const columns = getColumnsForRules(rules);

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
                table.appendChild(await generateTableBody(rules, columns, null, null, (row, fragment, tr, index) => {
                    const key = `${tableName}|${chain}|${index}`;
                    tr.dataset.key = key;

                    const commentRow = generateCommentRow(row, row.comment || "", columns.length);

                    // restore open state
                    if (openRowKey && openRowKey === key) {
                        commentRow.classList.add("show");
                    }

                    fragment.appendChild(commentRow);
                }));

                firewall.appendChild(table);
            }
        }

        object.innerHTML = "";
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
 *
 * TODO: Improve dynamic comment generation further
 */
function generateCommentRow(row, comment, columnCount) {
    const tableRow = document.createElement("tr");
    tableRow.classList.add("comment");

    const tableData = document.createElement("td");
    tableData.setAttribute("colspan", columnCount);

    const lines = generateFirewallExplanation(row, comment);

    for (const line of lines) {
        const div = document.createElement("div");
        div.textContent = line;
        tableData.appendChild(div);
    }

    tableRow.appendChild(tableData);

    return tableRow;
}

function generateFirewallExplanation(row, comment) {
    comment = cleanFirewallValue(comment || row.comment || "");

    if (comment) {
        return [
            "Comment: " + comment
        ];
    }

    const target = cleanFirewallValue(row.target);

    if (!target) {
        return [
            "No action is defined for this row. This is most likely an informational marker or counter row."
        ];
    }

    const protocol = describeProtocol(row);
    const conditions = describeConditions(row);
    const suffix = conditions ? " " + conditions : "";

    switch (target) {
        case "DROP":
            return [
                "Drops " + protocol + suffix + "."
            ];

        case "ACCEPT":
            return [
                "Accepts " + protocol + suffix + "."
            ];

        case "DNAT":
            return [
                "Redirects " + protocol + suffix + " using destination NAT."
            ];

        case "SNAT":
            return [
                "Rewrites the source address for " + protocol + suffix + " using source NAT."
            ];

        case "MASQUERADE":
            return [
                "Applies NAT masquerading to " + protocol + suffix + "."
            ];

        case "RETURN":
            return [
                "Returns " + protocol + suffix + " to the previous chain."
            ];

        case "REJECT":
            return [
                "Rejects " + protocol + suffix + "."
            ];

        default:
            return [
                "Sends " + protocol + suffix + " to chain " + target + "."
            ];
    }
}

function describeProtocol(row) {
    const protocol = cleanFirewallValue(row.prot).toLowerCase();

    switch (protocol) {
        case "":
        case "all":
            return "all traffic";

        case "tcp":
            return "TCP traffic";

        case "udp":
            return "UDP traffic";

        case "icmp":
            return "ICMP traffic";

        default:
            return protocol.toUpperCase() + " traffic";
    }
}

function describeConditions(row) {
    const conditions = [];

    const input = describeInterface(row.in, "in");
    if (input) {
        conditions.push(input);
    }

    const output = describeInterface(row.out, "out");
    if (output) {
        conditions.push(output);
    }

    const source = cleanAddress(row.source);
    if (source) {
        conditions.push("from " + source);
    }

    const destination = cleanAddress(getCleanDestination(row));
    if (destination) {
        conditions.push("to " + destination);
    }

    const port = getDestinationPort(row);
    if (port) {
        conditions.push("with destination port " + port);
    }

    const state = cleanConnectionState(row.state);
    if (state) {
        conditions.push("with connection state " + state);
    }

    const flags = cleanFirewallValue(row.flags);
    if (flags) {
        conditions.push("with TCP flags " + flags);
    }

    const tcpOption = cleanFirewallValue(row["tcp options"]);
    if (tcpOption) {
        if (tcpOption.startsWith("!")) {
            conditions.push("without TCP option " + tcpOption.substring(1));
        } else {
            conditions.push("with TCP option " + tcpOption);
        }
    }

    const tcpMss = cleanFirewallValue(row["tcp mss"]);
    if (tcpMss) {
        if (tcpMss.startsWith("!")) {
            conditions.push("with TCP MSS outside " + tcpMss.substring(1));
        } else {
            conditions.push("with TCP MSS " + tcpMss);
        }
    }

    const matchConditions = describeMatchModules(row);
    if (matchConditions.length) {
        conditions.push(...matchConditions);
    }

    return conditions.join(" ");
}

function describeMatchModules(row) {
    const result = [];

    const rp = describeRpFilter(row);
    if (rp) result.push(rp);

    // future:
    // const conntrack = describeConntrack(row);
    // if (conntrack) result.push(conntrack);

    return result;
}

function describeRpFilter(row) {
    const value = cleanFirewallValue(row.rpfilter);

    if (!value) {
        return "";
    }

    let parts = [];

    const isInvert = value.includes("invert") || value.includes("!");

    if (isInvert) {
        parts.push("failing reverse path filtering");
    } else {
        parts.push("passing reverse path filtering");
    }

    if (value.includes("validmark")) {
        parts.push("with valid routing mark");
    }

    return parts.join(" ");
}

function describeInterface(value, direction) {
    value = cleanFirewallValue(value);

    if (!value || value === "any") {
        return "";
    }

    if (value.startsWith("!")) {
        value = value.substring(1);

        if (direction === "in") {
            return "not coming in through interface " + value;
        }

        return "not going out through interface " + value;
    }

    if (direction === "in") {
        return "coming in through interface " + value;
    }

    return "going out through interface " + value;
}

function cleanAddress(value) {
    value = cleanFirewallValue(value);

    if (!value || value === "any" || value === "anywhere") {
        return "";
    }

    return value;
}

function getCleanDestination(row) {
    let destination = cleanFirewallValue(row.destination);

    if (!destination) {
        return "";
    }

    destination = destination.replace(/\s+tcp\s+dpt:.+$/i, "");
    destination = destination.replace(/\s+udp\s+dpt:.+$/i, "");

    return cleanFirewallValue(destination);
}

function getDestinationPort(row) {
    const directPort = cleanFirewallValue(row.dport);

    if (directPort) {
        return directPort;
    }

    const destination = cleanFirewallValue(row.destination);
    const match = destination.match(/\b(?:tcp|udp)\s+dpt:([^\s]+)/i);

    if (match && match[1]) {
        return match[1];
    }

    return "";
}

function cleanConnectionState(value) {
    value = cleanFirewallValue(value);

    if (!value) {
        return "";
    }

    value = value.replace(/^ctstate\s+/i, "");

    return cleanFirewallValue(value);
}

function cleanFirewallValue(value) {
    if (value === undefined || value === null) {
        return "";
    }

    return String(value).replace(/\s+/g, " ").trim();
}