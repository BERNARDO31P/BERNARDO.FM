if (typeof window["firewall"] !== 'undefined') {
    throw new Error("Dieses Skript wurde bereits geladen.");
}

const FIREWALL_ROWS_PER_CHAIN = 20;

let openRowKey = null;
let expandedFirewallChains = {};
let firewallRendering = false;

window["firewall"] = async () => {
    const objects = document.querySelectorAll("[data-url]");
    await generateFirewall(objects);

    backgroundProcesses[0] = setInterval(async () => {
        if (firewallRendering) {
            return;
        }

        firewallRendering = true;

        try {
            await generateFirewall(objects);
        } finally {
            firewallRendering = false;
        }

    }, 2000);
};

bindEvent("click", ".firewall-chain-toggle", async function (event) {
    event.preventDefault();

    const tableName = this.dataset.tableName || "";
    const chain = this.dataset.chain || "";

    setFirewallChainExpanded(tableName, chain, !isFirewallChainExpanded(tableName, chain));

    const object = this.closest("[data-url]");

    if (object) {
        await generateFirewall([object]);
    }
});

/*
 * Funktion: Anonym
 * Autor: Bernardo de Oliveira
 *
 * Zeigt bei einem Click den Kommentar der Tabellenzeile
 * Blendet alle anderen Kommentare aus
 */
bindEvent("click", ".firewall tr:not(.comment)", function () {
    const nextRow = this.nextElementSibling;

    if (!nextRow || !nextRow.classList.contains("comment")) {
        return;
    }

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
            if (key !== "comment") {
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
 * Generiert oder aktualisiert die Titel der Firewall Tabellen und Chains sowie Reihen
 * Öffnet die vorher geöffneten Kommentare
 */
async function generateFirewall(objects) {
    for (const object of objects) {
        const data = await httpGetJSON(object.getAttribute("data-url"));

        if (!data) {
            continue;
        }

        let firewall = object.querySelector(".firewall");
        if (!firewall) {
            firewall = document.createElement("div");
            firewall.classList.add("firewall");

            object.appendChild(firewall);
        }

        const existingContainers = new Map();

        firewall.querySelectorAll(".responsive-container").forEach(container => {
            const tableName = container.dataset.tableName;
            const chain = container.dataset.chain;

            existingContainers.set(tableName + "|" + chain, container);
        });

        const usedContainers = new Set();
        const usedTables = new Set();

        let chainCounter = 0;
        for (const [tableName, chains] of Object.entries(data)) {
            usedTables.add(tableName);

            let tableHeading = firewall.querySelector(`h2[data-table-name="${tableName}"]`);

            if (!tableHeading) {
                tableHeading = document.createElement("h2");
                tableHeading.dataset.tableName = tableName;
                tableHeading.innerText = ucFirst(tableName);

                firewall.appendChild(tableHeading);
            }

            let insertAfter = tableHeading;
            for (const [chain, rules] of Object.entries(Object(chains))) {
                chainCounter++;

                const containerKey = tableName + "|" + chain;

                usedContainers.add(containerKey);

                const columns = getColumnsForRules(rules);
                const totalRows = getFirewallRuleCount(rules);
                const expanded = isFirewallChainExpanded(tableName, chain);

                const visibleRules = expanded ? rules : limitFirewallRules(rules, FIREWALL_ROWS_PER_CHAIN);

                let container = existingContainers.get(containerKey);
                if (!container) {
                    const title = document.createElement("h3");

                    title.dataset.tableName = tableName;
                    title.dataset.chain = chain;
                    title.innerText = chain;

                    insertAfter.after(title);

                    insertAfter = title;

                    const toggle = generateFirewallChainToggle(tableName, chain, totalRows, expanded);

                    if (toggle) {
                        insertAfter.after(toggle);

                        insertAfter = toggle;
                    }

                    container = document.createElement("div");

                    container.classList.add("responsive-container");

                    container.dataset.tableName = tableName;
                    container.dataset.chain = chain;

                    insertAfter.after(container);

                    insertAfter = container;
                } else {
                    const existingTitle = firewall.querySelector(`h3[data-table-name="${tableName}"][data-chain="${chain}"]`);

                    if (existingTitle) {
                        insertAfter = existingTitle;
                    }

                    const existingToggle = firewall.querySelector(`.firewall-chain-toggle[data-table-name="${tableName}"][data-chain="${chain}"]`);

                    const newToggle = generateFirewallChainToggle(tableName, chain, totalRows, expanded);

                    if (existingToggle) {
                        existingToggle.remove();
                    }

                    if (newToggle) {
                        insertAfter.after(newToggle);

                        insertAfter = newToggle;
                    }

                    insertAfter = container;
                }

                let table = container.querySelector("table");
                if (!table) {
                    table = document.createElement("table");
                    table.classList.add("responsive-table");

                    container.appendChild(table);
                }

                const thead = document.createElement("thead");
                const headerRow = document.createElement("tr");

                for (const column of columns) {
                    const th = document.createElement("th");

                    th.innerText = column;

                    headerRow.appendChild(th);
                }

                thead.appendChild(headerRow);

                const oldThead = table.querySelector("thead");
                if (oldThead) {
                    oldThead.replaceWith(thead);
                } else {
                    table.appendChild(thead);
                }

                const tbody = await generateTableBody(visibleRules, columns, null, null, (row, fragment, tr, index) => {
                    const key = `${tableName}|${chain}|${index}`;

                    tr.dataset.key = key;

                    const commentRow = generateCommentRow(row, row.comment || "", columns.length);

                    if (openRowKey === key) {
                        commentRow.classList.add("show");
                    }

                    fragment.appendChild(commentRow);
                });

                const oldTbody = table.querySelector("tbody");

                if (oldTbody) {
                    oldTbody.replaceWith(tbody);
                } else {
                    table.appendChild(tbody);
                }

                if (chainCounter % 2 === 0) {
                    await yieldToBrowser();
                }
            }
        }

        // REMOVE OLD CHAINS
        firewall.querySelectorAll(".responsive-container").forEach(container => {
            const key = container.dataset.tableName + "|" + container.dataset.chain;

            if (!usedContainers.has(key)) {
                const title = firewall.querySelector(`h3[data-table-name="${container.dataset.tableName}"][data-chain="${container.dataset.chain}"]`);

                if (title) {
                    title.remove();
                }

                const toggle = firewall.querySelector(`.firewall-chain-toggle[data-table-name="${container.dataset.tableName}"][data-chain="${container.dataset.chain}"]`);

                if (toggle) {
                    toggle.remove();
                }

                container.remove();
            }
        });


        // REMOVE OLD TABLES
        firewall.querySelectorAll("h2[data-table-name]").forEach(title => {
            const tableName = title.dataset.tableName;

            if (!usedTables.has(tableName)) {
                title.remove();
            }
        });
    }
}

async function yieldToBrowser() {

    return new Promise(resolve => {

        requestAnimationFrame(() => {
            resolve();
        });

    });
}

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
        return ["Comment: " + comment];
    }

    const target = cleanFirewallValue(row.target);

    if (!target) {
        return ["No action is defined for this row. This is most likely an informational marker or counter row."];
    }

    const protocol = describeProtocol(row);
    const conditions = describeConditions(row);
    const suffix = conditions ? " " + conditions : "";

    switch (target) {
        case "DROP":
            return ["Drops " + protocol + suffix + "."];

        case "ACCEPT":
            return ["Accepts " + protocol + suffix + "."];

        case "DNAT":
            return ["Redirects " + protocol + suffix + " using destination NAT."];

        case "SNAT":
            return ["Rewrites the source address for " + protocol + suffix + " using source NAT."];

        case "MASQUERADE":
            return ["Applies NAT masquerading to " + protocol + suffix + "."];

        case "RETURN":
            return ["Returns " + protocol + suffix + " to the previous chain."];

        case "REJECT":
            return ["Rejects " + protocol + suffix + "."];

        default:
            return ["Sends " + protocol + suffix + " to chain " + target + "."];
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
    if (rp) {
        result.push(rp);
    }

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

function isFirewallChainExpanded(tableName, chain) {
    return expandedFirewallChains[tableName + "|" + chain] === true;
}

function setFirewallChainExpanded(tableName, chain, expanded) {
    const key = tableName + "|" + chain;

    if (expanded) {
        expandedFirewallChains[key] = true;
    } else {
        delete expandedFirewallChains[key];
    }
}

function limitFirewallRules(rules, limit) {
    if (Array.isArray(rules)) {
        return rules.slice(0, limit);
    }

    return Object.fromEntries(Object.entries(Object(rules)).slice(0, limit));
}

function getFirewallRuleCount(rules) {
    return Object.keys(Object(rules)).length;
}

function generateFirewallChainToggle(tableName, chain, totalRows, expanded) {
    if (totalRows <= FIREWALL_ROWS_PER_CHAIN) {
        return null;
    }

    const button = document.createElement("button");

    button.type = "button";
    button.classList.add("firewall-chain-toggle");
    button.dataset.tableName = tableName;
    button.dataset.chain = chain;

    if (expanded) {
        button.innerText = "Show less";
    } else {
        button.innerText = "Show all rows (" + totalRows + ")";
    }

    return button;
}