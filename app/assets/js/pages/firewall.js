if (typeof window["firewall"] !== "undefined") {
    throw new Error("Dieses Skript wurde bereits geladen.");
}

const FIREWALL_ROWS_PER_CHAIN = 20;
const FIREWALL_SCROLL_IDLE = 300;

const FIREWALL_BUILTIN_CHAINS = new Set([
    "PREROUTING",
    "INPUT",
    "FORWARD",
    "OUTPUT",
    "POSTROUTING"
]);
const FIREWALL_PACKET_FLOW = [
    ["raw", "PREROUTING"],
    ["mangle", "PREROUTING"],
    ["nat", "PREROUTING"],

    ["mangle", "INPUT"],
    ["filter", "INPUT"],

    ["mangle", "FORWARD"],
    ["filter", "FORWARD"],

    ["raw", "OUTPUT"],
    ["mangle", "OUTPUT"],
    ["nat", "OUTPUT"],
    ["filter", "OUTPUT"],

    ["mangle", "POSTROUTING"],
    ["nat", "POSTROUTING"]
];

const FIREWALL_COMMENT_TRANSITION = 1000;

let openRowKey = null;
let expandedFirewallChains = {};
let firewallRendering = false;
let firewallRenderGeneration = 0;
let firewallCommentTransitionUntil = 0;
let firewallScrollUntil = 0;
let firewallRestoringScroll = false;

window["firewall"] = async () => {
    const objects = document.querySelectorAll("[data-url]");

    firewallRendering = true;

    try {
        await generateFirewall(objects);
    } finally {
        firewallRendering = false;
    }

    backgroundProcesses[0] = setInterval(async () => {
        if (
            firewallRendering
            || performance.now() < firewallCommentTransitionUntil
            || performance.now() < firewallScrollUntil
        ) {
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

    setFirewallChainExpanded(
        tableName,
        chain,
        !isFirewallChainExpanded(tableName, chain)
    );

    const object = this.closest("[data-url]");

    if (!object || firewallRendering) {
        return;
    }

    firewallRendering = true;

    try {
        await generateFirewall([object]);
    } finally {
        firewallRendering = false;
    }
});

/*
 * Funktion: Anonym
 * Autor: Bernardo de Oliveira
 *
 * Verhindert Firewall Refreshes während eine Tabelle gescrollt wird.
 * Ein bereits laufender Render wird ungültig, damit keine ältere
 * Scroll Position wiederhergestellt wird.
 */
document.addEventListener("scroll", event => {
    const container = event.target;

    if (
        firewallRestoringScroll
        || !(container instanceof Element)
        || !container.matches(".firewall .responsive-container")
    ) {
        return;
    }

    firewallRenderGeneration++;
    firewallScrollUntil = performance.now() + FIREWALL_SCROLL_IDLE;
}, true);

/*
 * Funktion: Anonym
 * Autor: Bernardo de Oliveira
 *
 * Zeigt bei einem Click die Erklärung der Tabellenzeile
 * Blendet alle anderen Erklärungen aus
 * Laufende Firewall Refreshes dürfen die Animation nicht überschreiben
 */
bindEvent("click", ".firewall tr:not(.comment)", function () {
    const nextRow = this.nextElementSibling;

    if (!nextRow || !nextRow.classList.contains("comment")) {
        return;
    }

    /*
     * Einen bereits laufenden Render ungültig machen und neue
     * Refreshes bis zum Ende der CSS Animation blockieren.
     */
    firewallRenderGeneration++;
    firewallCommentTransitionUntil = performance.now() + FIREWALL_COMMENT_TRANSITION;

    const isOpen = nextRow.classList.contains("show");

    document.querySelectorAll(".firewall tr.comment").forEach(element => {
        element.classList.remove("show");
    });

    if (!isOpen) {
        nextRow.classList.add("show");
        openRowKey = this.dataset.key || null;
    } else {
        openRowKey = null;
    }
});

/*
 * Funktion: getFirewallChainReferences()
 * Autor: Bernardo de Oliveira
 * Argumente:
 *  tableChains: (Objekt) Alle Chains derselben iptables Tabelle
 *  rules: (Array|Objekt) Die Regeln der aktuellen Chain
 *
 * Ermittelt alle sichtbaren User Chains welche von der aktuellen Chain
 * angesprungen werden. Die Reihenfolge der Regeln bleibt erhalten.
 */
function getFirewallChainReferences(tableChains, rules) {
    const references = [];
    const found = new Set();

    for (const row of Object.values(Object(rules))) {
        const target = cleanFirewallValue(row && row.target);

        if (
            !target
            || found.has(target)
            || !Object.prototype.hasOwnProperty.call(tableChains, target)
        ) {
            continue;
        }

        const targetRules = tableChains[target];

        /*
         * Leere Chains werden im UI nicht dargestellt und deshalb
         * auch nicht in die Traversierung aufgenommen.
         */
        if (getFirewallRuleCount(targetRules) <= 0) {
            continue;
        }

        found.add(target);
        references.push(target);
    }

    return references;
}

/*
 * Funktion: getFirewallRenderOrder()
 * Autor: Bernardo de Oliveira
 * Argumente:
 *  data: (Objekt) Die vollständigen iptables Daten
 *
 * Erstellt die Anzeigereihenfolge anhand des iptables Packet Flows.
 * Referenzierte User Chains werden unmittelbar nach ihrer aufrufenden
 * Chain rekursiv dargestellt.
 */
function getFirewallRenderOrder(data) {
    const result = [];
    const visited = new Set();
    const visiting = new Set();

    /*
     * Tabellennamen case-insensitive auffindbar machen.
     */
    const tableNames = new Map();

    for (const tableName of Object.keys(Object(data))) {
        tableNames.set(tableName.toLowerCase(), tableName);
    }

    const visitChain = (tableName, chain) => {
        const chains = Object(data[tableName]);

        if (!Object.prototype.hasOwnProperty.call(chains, chain)) {
            return;
        }

        const rules = chains[chain];

        if (getFirewallRuleCount(rules) <= 0) {
            return;
        }

        const key = tableName + "|" + chain;

        /*
         * Bereits dargestellte Chains nicht ein zweites Mal anzeigen.
         */
        if (visited.has(key)) {
            return;
        }

        /*
         * Schutz vor zyklischen Chain Referenzen.
         */
        if (visiting.has(key)) {
            return;
        }

        visiting.add(key);

        result.push({
            tableName: tableName,
            chain: chain,
            rules: rules
        });

        /*
         * Sprungziele sofort nach der aktuellen Chain verfolgen.
         */
        const references = getFirewallChainReferences(chains, rules);

        for (const target of references) {
            visitChain(tableName, target);
        }

        visiting.delete(key);
        visited.add(key);
    };

    /*
     * Zuerst den bekannten iptables Packet Flow durchlaufen.
     */
    for (const [wantedTableName, chain] of FIREWALL_PACKET_FLOW) {
        const tableName = tableNames.get(wantedTableName.toLowerCase());

        if (!tableName) {
            continue;
        }

        visitChain(tableName, chain);
    }

    /*
     * Chains welche vom normalen Packet Flow nicht erreicht werden,
     * trotzdem anzeigen. Damit verschwinden beispielsweise bewusst
     * definierte aber momentan nicht angesprungene Chains nicht aus dem UI.
     */
    for (const [tableName, chains] of Object.entries(Object(data))) {
        for (const chain of Object.keys(Object(chains))) {
            visitChain(tableName, chain);
        }
    }

    return result;
}

/*
 * Funktion: getColumnsForRules()
 * Autor: Bernardo de Oliveira
 *
 * Ermittelt alle sichtbaren Spalten der Firewall Regeln
 * Kommentare und interne Parser Daten werden nicht als Spalten angezeigt
 */
function getColumnsForRules(rules) {
    const columns = new Set();

    for (const row of Object.values(Object(rules))) {
        for (const key of Object.keys(Object(row))) {
            if (key === "comment" || key.startsWith("_")) {
                continue;
            }

            columns.add(key);
        }
    }

    return Array.from(columns);
}

/*
 * Funktion: formatFirewallNumber()
 * Autor: Bernardo de Oliveira
 *
 * Formatiert grosse Zahlen in eine lesbare Form
 */
function formatFirewallNumber(value) {
    const number = Number(value);

    if (!Number.isFinite(number)) {
        return value;
    }

    const units = [
        {value: 1_000_000_000_000, suffix: "T"},
        {value: 1_000_000_000, suffix: "B"},
        {value: 1_000_000, suffix: "M"},
        {value: 1_000, suffix: "K"}
    ];

    for (const unit of units) {
        if (Math.abs(number) >= unit.value) {
            return formatFirewallDecimal(number / unit.value) + unit.suffix;
        }
    }

    return number.toLocaleString();
}

/*
 * Funktion: formatFirewallBytes()
 * Autor: Bernardo de Oliveira
 *
 * Formatiert Bytes in KiB, MiB, GiB usw.
 */
function formatFirewallBytes(value) {
    const bytes = Number(value);

    if (!Number.isFinite(bytes)) {
        return value;
    }

    if (bytes === 0) {
        return "0 B";
    }

    const units = [
        "B",
        "KiB",
        "MiB",
        "GiB",
        "TiB",
        "PiB"
    ];

    const base = 1024;
    const index = Math.min(Math.floor(Math.log(Math.abs(bytes)) / Math.log(base)), units.length - 1);
    const converted = bytes / Math.pow(base, index);

    return formatFirewallDecimal(converted) + " " + units[index];
}

/*
 * Funktion: formatFirewallDecimal()
 * Autor: Bernardo de Oliveira
 *
 * Formatiert Dezimalzahlen abhängig von deren Grösse
 */
function formatFirewallDecimal(value) {
    if (Math.abs(value) >= 100) {
        return value.toFixed(0);
    }

    if (Math.abs(value) >= 10) {
        return value.toFixed(1);
    }

    return value.toFixed(2).replace(/\.?0+$/, "");
}

/*
 * Funktion: formatFirewallTableRow()
 * Autor: Bernardo de Oliveira
 *
 * Formatiert Packet- und Byte-Zähler einer Firewall Tabellenzeile
 * Der originale Wert wird für spätere Berechnungen gespeichert
 */
function formatFirewallTableRow(tr, row, columns) {
    const cells = tr.querySelectorAll("td");

    columns.forEach((column, index) => {
        const cell = cells[index];

        if (!cell) {
            return;
        }

        const value = cleanFirewallValue(row[column]);

        if (!value) {
            return;
        }

        let formatted = "";

        switch (column.toLowerCase()) {
            case "pkts":
                formatted = formatFirewallNumber(value);
                break;

            case "bytes":
                formatted = formatFirewallBytes(value);
                break;

            default:
                return;
        }

        cell.textContent = formatted;
        cell.title = Number(value).toLocaleString() + " " + (column.toLowerCase() === "bytes" ? "bytes" : "packets");
        cell.dataset.value = value;
    });
}

/*
 * Funktion: generateFirewall()
 * Autor: Bernardo de Oliveira
 *
 * Holt die Firewall Daten und verarbeitet diese
 * Ordnet alle Chains anhand des iptables Packet Flows
 * Referenzierte User Chains werden unmittelbar nach ihrem Aufrufer dargestellt
 * Die bestehende DOM Struktur bleibt während des asynchronen Renderings sichtbar
 * Scroll Positionen werden unmittelbar vor dem DOM Umbau gesichert
 */
async function generateFirewall(objects) {
    const renderGeneration = firewallRenderGeneration;

    for (const object of objects) {
        const data = await httpGetJSON(object.getAttribute("data-url"));

        /*
         * Eine User Interaktion während des Requests macht diesen
         * Render ungültig. Die bestehende DOM Struktur bleibt erhalten.
         */
        if (renderGeneration !== firewallRenderGeneration) {
            return;
        }

        if (!data) {
            continue;
        }

        let firewall = object.querySelector(".firewall");

        if (!firewall) {
            firewall = document.createElement("div");
            firewall.classList.add("firewall");

            object.appendChild(firewall);
        }

        /*
         * Bestehende Container wiederverwenden.
         * Sie bleiben bis zum vollständig abgeschlossenen Rendern
         * an ihrer bisherigen Position im DOM.
         */
        const existingContainers = new Map();

        firewall.querySelectorAll(".responsive-container").forEach(container => {
            const tableName = container.dataset.tableName || "";
            const chain = container.dataset.chain || "";
            const key = tableName + "|" + chain;

            existingContainers.set(key, container);
        });

        const orderedChains = getFirewallRenderOrder(data);
        const renderedChains = [];

        let ddosProtectionEnabled = false;
        let chainCounter = 0;

        /*
         * Zuerst alle Chains aktualisieren, ohne bestehende Container
         * aus dem sichtbaren DOM zu entfernen.
         */
        for (const item of orderedChains) {
            const tableName = item.tableName;
            const chain = item.chain;
            const rules = item.rules;

            chainCounter++;

            if (firewallRulesContainPermanentMode(rules)) {
                ddosProtectionEnabled = true;
            }

            const columns = getColumnsForRules(rules);
            const totalRows = getFirewallRuleCount(rules);
            const expanded = isFirewallChainExpanded(tableName, chain);

            const visibleRules = expanded
                ? rules
                : limitFirewallRules(rules, FIREWALL_ROWS_PER_CHAIN);

            const containerKey = tableName + "|" + chain;

            let container = existingContainers.get(containerKey);

            if (!container) {
                container = document.createElement("div");

                container.classList.add("responsive-container");
                container.dataset.tableName = tableName;
                container.dataset.chain = chain;
            }

            let table = container.querySelector("table");

            if (!table) {
                table = document.createElement("table");
                table.classList.add("responsive-table");

                container.appendChild(table);
            }

            /*
             * Header aktualisieren
             */
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

            /*
             * Regeln aktualisieren
             */
            const tbody = await generateTableBody(
                visibleRules,
                columns,
                null,
                null,
                (row, fragment, tr, index) => {
                    const key = tableName + "|" + chain + "|" + index;

                    tr.dataset.key = key;

                    formatFirewallTableRow(
                        tr,
                        row,
                        columns
                    );

                    const commentRow = generateCommentRow(
                        row,
                        row.comment || "",
                        columns.length,
                        tableName,
                        chain
                    );

                    if (openRowKey === key) {
                        commentRow.classList.add("show");
                    }

                    fragment.appendChild(commentRow);
                }
            );

            /*
             * Falls während generateTableBody() eine User Interaktion
             * stattgefunden hat, darf dieser alte Render das aktuelle
             * tbody nicht mehr ersetzen.
             */
            if (renderGeneration !== firewallRenderGeneration) {
                return;
            }

            const oldTbody = table.querySelector("tbody");

            if (oldTbody) {
                oldTbody.replaceWith(tbody);
            } else {
                table.appendChild(tbody);
            }

            /*
             * Noch nichts verschieben.
             * Nur merken, wie die fertige Reihenfolge aussehen soll.
             */
            renderedChains.push({
                tableName: tableName,
                chain: chain,
                container: container,
                totalRows: totalRows,
                expanded: expanded,
                key: containerKey
            });

            if (chainCounter % 2 === 0) {
                await yieldToBrowser();

                /*
                 * Ein Scroll, Click oder eine andere relevante
                 * User Interaktion macht diesen Render ungültig.
                 */
                if (renderGeneration !== firewallRenderGeneration) {
                    return;
                }
            }
        }

        if (renderGeneration !== firewallRenderGeneration) {
            return;
        }

        /*
         * Scroll Positionen erst unmittelbar vor dem DOM Umbau sichern.
         * Dadurch wird nicht ein veralteter Wert vom Anfang des
         * asynchronen Refreshes wiederhergestellt.
         */
        const scrollPositions = new Map();

        for (const item of renderedChains) {
            scrollPositions.set(item.key, {
                left: item.container.scrollLeft,
                top: item.container.scrollTop
            });
        }

        /*
         * Erst jetzt die neue Reihenfolge erzeugen.
         *
         * Ab hier gibt es absichtlich kein await mehr.
         * Bestehende Container werden zwar in das Fragment verschoben,
         * aber direkt danach in einem Zug wieder eingesetzt.
         */
        const fragment = document.createDocumentFragment();

        let previousTableName = null;

        for (const item of renderedChains) {
            if (previousTableName !== item.tableName) {
                const tableHeading = document.createElement("h2");

                tableHeading.dataset.tableName = item.tableName;
                tableHeading.innerText = ucFirst(item.tableName);

                fragment.appendChild(tableHeading);

                previousTableName = item.tableName;
            }

            const title = document.createElement("h3");

            title.dataset.tableName = item.tableName;
            title.dataset.chain = item.chain;
            title.innerText = item.chain;

            fragment.appendChild(title);

            const toggle = generateFirewallChainToggle(
                item.tableName,
                item.chain,
                item.totalRows,
                item.expanded
            );

            if (toggle) {
                fragment.appendChild(toggle);
            }

            fragment.appendChild(item.container);
        }

        /*
         * Vollständige Struktur atomar ersetzen.
         */
        firewall.replaceChildren(fragment);

        /*
         * Während der programmgesteuerten Wiederherstellung dürfen
         * ausgelöste Scroll Events nicht als User Scroll gelten.
         */
        firewallRestoringScroll = true;

        /*
         * Scroll Positionen nach dem erneuten Einfügen der Container
         * wiederherstellen. Falls sich die Tabellenbreite geändert hat,
         * wird auf den neuen maximalen Scroll Bereich begrenzt.
         */
        for (const item of renderedChains) {
            const position = scrollPositions.get(item.key);

            if (!position) {
                continue;
            }

            item.container.scrollLeft = Math.min(
                position.left,
                Math.max(
                    0,
                    item.container.scrollWidth - item.container.clientWidth
                )
            );

            item.container.scrollTop = Math.min(
                position.top,
                Math.max(
                    0,
                    item.container.scrollHeight - item.container.clientHeight
                )
            );
        }

        /*
         * Scroll Events der Wiederherstellung können verzögert eintreffen.
         * Deshalb erst im nächsten Frame wieder echte User Scroll Events
         * berücksichtigen.
         */
        requestAnimationFrame(() => {
            firewallRestoringScroll = false;
        });

        if (ddosProtectionEnabled) {
            showFirewallDdosNotice(firewall);
        } else {
            hideFirewallDdosNotice(firewall);
        }
    }
}

/*
 * Funktion: firewallRulesContainPermanentMode()
 * Autor: Bernardo de Oliveira
 *
 * Prüft, ob eine Chain Regeln der permanenten DDoS Protection enthält
 */
function firewallRulesContainPermanentMode(rules) {
    for (const row of Object.values(Object(rules))) {
        if (isPermanentProtectionRule(row)) {
            return true;
        }
    }

    return false;
}

/*
 * Funktion: isPermanentProtectionRule()
 * Autor: Bernardo de Oliveira
 *
 * Prüft, ob eine Firewall Regel den permanenten Schutzmodus markiert
 */
function isPermanentProtectionRule(row) {
    const matches = getFirewallMatchData(row);

    const comments = [
        row.comment,
        matches.comment,
        matches.comment && matches.comment.text,
        matches.comment && matches.comment.value
    ];

    return comments.some(comment => {
        return cleanFirewallValue(comment).toLowerCase() === "protection is in permanent mode";
    });
}

/*
 * Funktion: cssEscapeValue()
 * Autor: Bernardo de Oliveira
 *
 * Escaped einen Wert für die Verwendung in einem CSS Attributselektor
 */
function cssEscapeValue(value) {
    if (window.CSS && typeof window.CSS.escape === "function") {
        return window.CSS.escape(String(value));
    }

    return String(value)
        .replace(/\\/g, "\\\\")
        .replace(/\"/g, "\\\"");
}

/*
 * Funktion: yieldToBrowser()
 * Autor: Bernardo de Oliveira
 *
 * Gibt dem Browser Zeit zum Rendern
 */
async function yieldToBrowser() {
    return new Promise(resolve => {
        requestAnimationFrame(() => {
            resolve();
        });
    });
}

/*
 * Funktion: generateCommentRow()
 * Autor: Bernardo de Oliveira
 *
 * Generiert eine Erklärungszeile für eine Firewall Regel
 */
function generateCommentRow(row, comment, columnCount, tableName, chain) {
    const tableRow = document.createElement("tr");
    tableRow.classList.add("comment");

    const tableData = document.createElement("td");
    tableData.setAttribute("colspan", Math.max(columnCount, 1).toString());

    const lines = generateFirewallExplanation(row, comment, tableName, chain);

    for (const line of lines) {
        const div = document.createElement("div");

        div.textContent = line;

        tableData.appendChild(div);
    }

    tableRow.appendChild(tableData);

    return tableRow;
}

/*
 * Funktion: generateFirewallExplanation()
 * Autor: Bernardo de Oliveira
 *
 * Generiert eine ausführliche Erklärung einer Firewall Regel
 */
function generateFirewallExplanation(row, comment, tableName, chain) {
    const matches = getFirewallMatchData(row);
    const lines = [];

    const action = describeFirewallAction(row, matches, tableName, chain);

    if (action) {
        lines.push("Action: " + action);
    }

    const traffic = describeTrafficSelector(row, matches);

    if (traffic) {
        lines.push("Traffic: " + traffic);
    }

    const conntrack = describeConntrackMatch(row, matches);

    if (conntrack) {
        lines.push("Connection tracking: " + conntrack);
    }

    const tcpFlags = describeTcpFlagsMatch(row, matches);

    if (tcpFlags) {
        lines.push("TCP flags: " + tcpFlags);
    }

    const tcpOption = describeTcpOptionMatch(row, matches);

    if (tcpOption) {
        lines.push("TCP option: " + tcpOption);
    }

    const tcpMss = describeTcpMssMatch(row, matches);

    if (tcpMss) {
        lines.push("TCP MSS: " + tcpMss);
    }

    const rpFilter = describeRpFilterMatch(row, matches);

    if (rpFilter) {
        lines.push("Reverse-path filter: " + rpFilter);
    }

    const u32 = describeU32Match(matches);

    if (u32) {
        lines.push("Packet fields: " + u32);
    }

    const stringMatch = describeStringMatch(matches);

    if (stringMatch) {
        lines.push("Payload match: " + stringMatch);
    }

    const limit = describeLimitMatch(matches);

    if (limit) {
        lines.push("Rate limit: " + limit);
    }

    const hashlimit = describeHashlimitMatch(matches);

    if (hashlimit) {
        lines.push("Per-key rate limit: " + hashlimit);
    }

    const recent = describeRecentMatch(matches);

    if (recent) {
        lines.push("Recent list: " + recent);
    }

    const cleanedComment = cleanFirewallValue(comment || row.comment || "");

    if (cleanedComment) {
        lines.push("Comment: " + cleanedComment);
    }

    if (!lines.length) {
        lines.push("This rule contains no fields that can currently be explained.");
    }

    return lines;
}

/*
 * Funktion: getFirewallMatchData()
 * Autor: Bernardo de Oliveira
 *
 * Holt die vom PHP Parser generierten Match Daten
 */
function getFirewallMatchData(row) {
    if (row && typeof row._matches === "object" && row._matches !== null) {
        return row._matches;
    }

    return {};
}

/*
 * Funktion: describeFirewallAction()
 * Autor: Bernardo de Oliveira
 *
 * Beschreibt die Aktion einer Firewall Regel
 */
function describeFirewallAction(row, matches, tableName, chain) {
    const target = cleanFirewallValue(row.target);

    if (!target) {
        if (matches.recent && matches.recent.operation) {
            return "No jump target is defined. The match module may update its state, then evaluation continues with the next rule in chain " + chain + ".";
        }

        return "No jump target is defined, so matching packets continue to the next rule. This is commonly used for comments, counters or non-terminating match-module bookkeeping.";
    }

    switch (target.toUpperCase()) {
        case "DROP":
            return "Drop every packet that satisfies all conditions below. No reply is sent by this target.";

        case "ACCEPT":
            return "Accept every packet that satisfies all conditions below and stop traversing the current ruleset path.";

        case "RETURN":
            if (FIREWALL_BUILTIN_CHAINS.has(String(chain).toUpperCase())) {
                return "Stop traversing built-in chain " + chain + ". The chain policy then determines what happens to the packet.";
            }

            return "Stop traversing chain " + chain + " and resume with the rule immediately after the rule that jumped into this chain.";

        case "REJECT": {
            const rejectWith = cleanFirewallValue(matches.reject && matches.reject.with);

            if (rejectWith) {
                return "Reject every matching packet and send the configured rejection response " + rejectWith + ".";
            }

            return "Reject every matching packet and send an error response when the selected reject mode supports one.";
        }

        case "DNAT": {
            const destination = cleanFirewallValue(matches.nat && (matches.nat.to_destination || matches.nat.to));

            if (destination) {
                return "Rewrite the destination using DNAT to " + destination + ".";
            }

            return "Rewrite the packet destination using DNAT.";
        }

        case "SNAT": {
            const source = cleanFirewallValue(matches.nat && (matches.nat.to_source || matches.nat.to));

            if (source) {
                return "Rewrite the source using SNAT to " + source + ".";
            }

            return "Rewrite the packet source using SNAT.";
        }

        case "MASQUERADE":
            return "Apply source NAT using the current address of the outgoing interface.";

        default:
            if (matches.goto === true) {
                return "Continue processing in chain " + target + " using iptables goto semantics. A RETURN from that chain does not resume in the current chain.";
            }

            return "Jump to chain or target " + target + ". If it is a user-defined chain and that chain returns, processing resumes at the following rule here.";
    }
}

/*
 * Funktion: describeTrafficSelector()
 * Autor: Bernardo de Oliveira
 *
 * Beschreibt Protokoll, Interfaces, Adressen und Ports einer Firewall Regel
 */
function describeTrafficSelector(row, matches) {
    const conditions = [];

    const protocol = describeProtocol(row);

    if (protocol) {
        conditions.push(protocol);
    }

    const input = describeInterface(row.in, "in");

    if (input) {
        conditions.push(input);
    }

    const output = describeInterface(row.out, "out");

    if (output) {
        conditions.push(output);
    }

    const source = describeAddress(row.source, "source");

    if (source) {
        conditions.push(source);
    }

    const destination = describeAddress(row.destination, "destination");

    if (destination) {
        conditions.push(destination);
    }

    const sourcePort = getSourcePortData(row, matches);

    if (sourcePort) {
        conditions.push(describePortCondition(sourcePort, "source"));
    }

    const destinationPort = getDestinationPortData(row, matches);

    if (destinationPort) {
        conditions.push(describePortCondition(destinationPort, "destination"));
    }

    if (matches.multiport && matches.multiport.direction === "ports") {
        const ports = formatPortList(matches.multiport.ports);

        conditions.push(
            (matches.multiport.invert ? "neither source nor destination port may be " : "source or destination port is one of ") + ports
        );
    }

    if (!conditions.length) {
        return "all packets";
    }

    return conditions.join("; ") + ".";
}

/*
 * Funktion: describeProtocol()
 * Autor: Bernardo de Oliveira
 *
 * Beschreibt das verwendete Netzwerkprotokoll
 */
function describeProtocol(row) {
    let protocol = cleanFirewallValue(row.prot).toLowerCase();

    if (!protocol || protocol === "all" || protocol === "0") {
        return "all protocols";
    }

    let inverted = false;

    if (protocol.startsWith("!")) {
        inverted = true;
        protocol = protocol.substring(1).trim();
    }

    const names = {
        "tcp": "TCP",
        "udp": "UDP",
        "icmp": "ICMP",
        "icmpv6": "ICMPv6",
        "esp": "ESP",
        "ah": "AH",
        "sctp": "SCTP"
    };

    const name = names[protocol] || protocol.toUpperCase();

    return inverted ? "any protocol except " + name : name + " traffic";
}

/*
 * Funktion: describeInterface()
 * Autor: Bernardo de Oliveira
 *
 * Beschreibt ein Input- oder Output-Interface
 */
function describeInterface(value, direction) {
    value = cleanFirewallValue(value);

    if (!value || value === "*" || value === "any") {
        return "";
    }

    let inverted = false;

    if (value.startsWith("!")) {
        inverted = true;
        value = value.substring(1).trim();
    }

    if (direction === "in") {
        return inverted
            ? "not received on interface " + value
            : "received on interface " + value;
    }

    return inverted
        ? "not sent through interface " + value
        : "sent through interface " + value;
}

/*
 * Funktion: describeAddress()
 * Autor: Bernardo de Oliveira
 *
 * Beschreibt eine Source- oder Destination-Adresse
 */
function describeAddress(value, direction) {
    value = cleanFirewallValue(value);

    if (!value || value === "any" || value === "anywhere" || value === "0.0.0.0/0" || value === "::/0") {
        return "";
    }

    let inverted = false;

    if (value.startsWith("!")) {
        inverted = true;
        value = value.substring(1).trim();
    }

    if (direction === "source") {
        return inverted
            ? "source is not " + value
            : "source is " + value;
    }

    return inverted
        ? "destination is not " + value
        : "destination is " + value;
}

/*
 * Funktion: getSourcePortData()
 * Autor: Bernardo de Oliveira
 *
 * Holt Source-Port Informationen aus einer Firewall Regel
 */
function getSourcePortData(row, matches) {
    if (matches.source_port && matches.source_port.value) {
        return matches.source_port;
    }

    if (matches.multiport && matches.multiport.direction === "sports") {
        return {
            value: matches.multiport.ports,
            invert: matches.multiport.invert === true,
            multiple: true
        };
    }

    const value = cleanFirewallValue(row.sport);

    if (!value) {
        return null;
    }

    return value.startsWith("!")
        ? {value: value.substring(1), invert: true}
        : {value: value, invert: false};
}

/*
 * Funktion: getDestinationPortData()
 * Autor: Bernardo de Oliveira
 *
 * Holt Destination-Port Informationen aus einer Firewall Regel
 */
function getDestinationPortData(row, matches) {
    if (matches.destination_port && matches.destination_port.value) {
        return matches.destination_port;
    }

    if (matches.multiport && matches.multiport.direction === "dports") {
        return {
            value: matches.multiport.ports,
            invert: matches.multiport.invert === true,
            multiple: true
        };
    }

    const value = cleanFirewallValue(row.dport);

    if (!value) {
        return null;
    }

    return value.startsWith("!")
        ? {value: value.substring(1), invert: true}
        : {value: value, invert: false};
}

/*
 * Funktion: describePortCondition()
 * Autor: Bernardo de Oliveira
 *
 * Beschreibt eine Port-Bedingung
 */
function describePortCondition(portData, direction) {
    const formatted = formatPortList(portData.value);

    if (portData.invert) {
        return direction + " port is not in " + formatted;
    }

    if (String(portData.value).includes(",") || String(portData.value).includes(":")) {
        return direction + " port is in " + formatted;
    }

    return direction + " port is " + formatted;
}

/*
 * Funktion: formatPortList()
 * Autor: Bernardo de Oliveira
 *
 * Formatiert Portlisten und Portbereiche
 */
function formatPortList(value) {
    value = cleanFirewallValue(value);

    if (!value) {
        return "";
    }

    return value.split(",").map(part => {
        const range = part.trim().split(":");

        if (range.length === 2 && range[0] !== range[1]) {
            return range[0] + "-" + range[1];
        }

        return part.trim();

    }).join(", ");
}

/*
 * Funktion: describeConntrackMatch()
 * Autor: Bernardo de Oliveira
 *
 * Beschreibt einen conntrack/state Match
 */
function describeConntrackMatch(row, matches) {
    let state = "";
    let inverted = false;

    if (matches.conntrack && matches.conntrack.state) {
        state = cleanFirewallValue(matches.conntrack.state);
        inverted = matches.conntrack.invert === true;
    } else {
        state = cleanFirewallValue(row.state);

        if (state.startsWith("!")) {
            inverted = true;
            state = state.substring(1).trim();
        }

        state = state.replace(/^ctstate\s+/i, "");
    }

    if (!state) {
        return "";
    }

    const states = state
        .split(",")
        .map(item => item.trim())
        .filter(Boolean);

    const readable = states
        .map(describeConntrackState)
        .join(", ");

    return inverted
        ? "connection state must not be any of: " + readable + "."
        : "connection state must be one of: " + readable + ".";
}

/*
 * Funktion: describeConntrackState()
 * Autor: Bernardo de Oliveira
 *
 * Beschreibt einen einzelnen conntrack Zustand
 */
function describeConntrackState(state) {
    switch (String(state).toUpperCase()) {
        case "NEW":
            return "NEW (a new tracked flow or packet not yet seen in both directions)";

        case "ESTABLISHED":
            return "ESTABLISHED (part of an existing tracked connection)";

        case "RELATED":
            return "RELATED (a new flow related to an existing tracked connection)";

        case "INVALID":
            return "INVALID (cannot be associated with a valid tracked connection)";

        case "UNTRACKED":
            return "UNTRACKED";

        default:
            return state;
    }
}

/*
 * Funktion: describeTcpFlagsMatch()
 * Autor: Bernardo de Oliveira
 *
 * Beschreibt TCP Flag Matches
 */
function describeTcpFlagsMatch(row, matches) {
    let flags = matches.tcp_flags || null;

    if (!flags) {
        const raw = cleanFirewallValue(row.flags);

        if (!raw) {
            return "";
        }

        let inverted = false;
        let value = raw;

        if (value.startsWith("!")) {
            inverted = true;
            value = value.substring(1);
        }

        const parts = value.split("/");

        flags = {
            mask: parts[0] || "",
            comparison: parts[1] || "",
            invert: inverted
        };
    }

    const decodedMask = decodeTcpFlagValue(flags.mask);
    const decodedComparison = decodeTcpFlagValue(flags.comparison);

    const mask = decodedMask.length ? decodedMask : splitTcpFlags(flags.mask);
    const comparison = decodedComparison.length ? decodedComparison : splitTcpFlags(flags.comparison);

    let explanation = "";

    if (String(flags.comparison).toUpperCase() === "NONE" || !comparison.length) {
        if (String(flags.mask).toUpperCase() === "ALL") {
            explanation = "none of the TCP flags covered by the iptables ALL mask may be set.";
        } else {
            explanation = "none of these flags may be set: " + mask.join(", ") + ".";
        }

    } else if (String(flags.mask).toUpperCase() === "ALL" && String(flags.comparison).toUpperCase() === "ALL") {
        explanation = "all TCP flags covered by the iptables ALL mask must be set.";

    } else if (String(flags.mask).toUpperCase() === "ALL") {
        explanation = "these flags must be set: " + comparison.join(", ") + "; every other flag covered by the iptables ALL mask must be clear.";

    } else {
        const comparisonSet = new Set(comparison);
        const clear = mask.filter(flag => !comparisonSet.has(flag));
        const parts = [];

        if (comparison.length) {
            parts.push("must be set: " + comparison.join(", "));
        }

        if (clear.length) {
            parts.push("must be clear: " + clear.join(", "));
        }

        explanation = parts.join("; ") + ".";
    }

    if (flags.syn_shortcut === true) {
        explanation += " This is the normal iptables --syn test for an initial TCP SYN packet.";
    }

    if (flags.invert === true) {
        explanation = "the following flag condition is inverted: " + explanation;
    }

    return explanation;
}

/*
 * Funktion: splitTcpFlags()
 * Autor: Bernardo de Oliveira
 *
 * Teilt TCP Flags in einzelne Werte
 */
function splitTcpFlags(value) {
    value = cleanFirewallValue(value).toUpperCase();

    if (!value || value === "NONE") {
        return [];
    }

    if (value === "ALL") {
        return ["ALL"];
    }

    return value
        .split(",")
        .map(item => item.trim())
        .filter(Boolean);
}

/*
 * Funktion: decodeTcpFlagValue()
 * Autor: Bernardo de Oliveira
 *
 * Decodiert eine numerische TCP Flagmaske
 */
function decodeTcpFlagValue(value) {
    value = cleanFirewallValue(value).toLowerCase();

    if (!/^0x[0-9a-f]+$/.test(value)) {
        return [];
    }

    const numeric = Number.parseInt(value, 16);
    const flags = [];

    const bits = [
        [0x01, "FIN"],
        [0x02, "SYN"],
        [0x04, "RST"],
        [0x08, "PSH"],
        [0x10, "ACK"],
        [0x20, "URG"],
        [0x40, "ECE"],
        [0x80, "CWR"]
    ];

    for (const [bit, name] of bits) {
        if ((numeric & bit) !== 0) {
            flags.push(name);
        }
    }

    return flags;
}

/*
 * Funktion: describeTcpOptionMatch()
 * Autor: Bernardo de Oliveira
 *
 * Beschreibt einen TCP Option Match
 */
function describeTcpOptionMatch(row, matches) {
    let option = "";
    let inverted = false;

    if (matches.tcp_option && matches.tcp_option.option !== undefined) {
        option = cleanFirewallValue(matches.tcp_option.option);
        inverted = matches.tcp_option.invert === true;
    } else {
        option = cleanFirewallValue(row["tcp options"]);

        if (option.startsWith("!")) {
            inverted = true;
            option = option.substring(1).trim();
        }
    }

    if (!option) {
        return "";
    }

    const optionName = option === "2"
        ? "2 (Maximum Segment Size / MSS)"
        : option;

    return inverted
        ? "the packet must not contain TCP option " + optionName + "."
        : "the packet must contain TCP option " + optionName + ".";
}

/*
 * Funktion: describeTcpMssMatch()
 * Autor: Bernardo de Oliveira
 *
 * Beschreibt einen TCP MSS Match
 */
function describeTcpMssMatch(row, matches) {
    let range = "";
    let inverted = false;

    if (matches.tcp_mss && matches.tcp_mss.range !== undefined) {
        range = cleanFirewallValue(matches.tcp_mss.range);
        inverted = matches.tcp_mss.invert === true;
    } else {
        range = cleanFirewallValue(row["tcp mss"]);

        if (range.startsWith("!")) {
            inverted = true;
            range = range.substring(1).trim();
        }
    }

    if (!range) {
        return "";
    }

    const formatted = formatNumericRange(range);

    return inverted
        ? "the advertised Maximum Segment Size must be outside " + formatted + "."
        : "the advertised Maximum Segment Size must be within " + formatted + ".";
}

/*
 * Funktion: describeRpFilterMatch()
 * Autor: Bernardo de Oliveira
 *
 * Beschreibt einen Reverse Path Filter Match
 */
function describeRpFilterMatch(row, matches) {
    let rp = matches.rpfilter || null;

    if (!rp) {
        const value = cleanFirewallValue(row.rpfilter);

        if (!value) {
            return "";
        }

        rp = {
            invert: value.includes("invert") || value.includes("!"),
            validmark: value.includes("validmark"),
            loose: value.includes("loose"),
            accept_local: value.includes("accept-local")
        };
    }

    const parts = [];

    if (rp.invert) {
        parts.push("matches packets that fail reverse-path validation, which is useful for rejecting spoofed or unroutable source addresses");
    } else {
        parts.push("matches packets that pass reverse-path validation");
    }

    if (rp.validmark) {
        parts.push("the packet nfmark is included in the reverse route lookup");
    }

    if (rp.loose) {
        parts.push("loose mode is enabled, so a route may exist through a different interface");
    }

    if (rp.accept_local) {
        parts.push("locally assigned source addresses are accepted");
    }

    return parts.join("; ") + ".";
}

/*
 * Funktion: describeU32Match()
 * Autor: Bernardo de Oliveira
 *
 * Beschreibt einen u32 Match
 */
function describeU32Match(matches) {
    if (!matches.u32 || !matches.u32.expression) {
        return "";
    }

    const expression = cleanFirewallValue(matches.u32.expression);
    const normalized = expression.replace(/\s+/g, "").toLowerCase();
    const inverted = matches.u32.invert === true;

    let match = normalized.match(/^(?:0|0x0)&0xffff=([^:]+):([^:]+)$/);

    if (match) {
        const minimum = parseFirewallNumber(match[1]);
        const maximum = parseFirewallNumber(match[2]);

        if (minimum !== null && maximum !== null) {
            return inverted
                ? "IPv4 total packet length must be outside " + minimum + "-" + maximum + " bytes."
                : "IPv4 total packet length must be between " + minimum + " and " + maximum + " bytes.";
        }
    }

    match = normalized.match(/^(?:5|0x5)&0xff=([^:]+):([^:]+)$/);

    if (match) {
        const minimum = parseFirewallNumber(match[1]);
        const maximum = parseFirewallNumber(match[2]);

        if (minimum !== null && maximum !== null) {
            return inverted
                ? "IPv4 TTL must be outside " + minimum + "-" + maximum + "."
                : "IPv4 TTL must be between " + minimum + " and " + maximum + ".";
        }
    }

    return inverted
        ? "the u32 expression must not match: " + expression + "."
        : "the u32 expression must match: " + expression + ".";
}

/*
 * Funktion: parseFirewallNumber()
 * Autor: Bernardo de Oliveira
 *
 * Konvertiert Dezimal- oder Hexadezimalzahlen
 */
function parseFirewallNumber(value) {
    value = cleanFirewallValue(value).toLowerCase();

    if (/^0x[0-9a-f]+$/.test(value)) {
        return Number.parseInt(value, 16);
    }

    if (/^[0-9]+$/.test(value)) {
        return Number.parseInt(value, 10);
    }

    return null;
}

/*
 * Funktion: describeStringMatch()
 * Autor: Bernardo de Oliveira
 *
 * Beschreibt einen String Match
 */
function describeStringMatch(matches) {
    if (!matches.string || matches.string.value === undefined) {
        return "";
    }

    const value = String(matches.string.value);
    const inverted = matches.string.invert === true;
    const algorithm = cleanFirewallValue(matches.string.algorithm);
    const range = [];

    if (matches.string.from !== undefined) {
        range.push("starting at byte " + matches.string.from);
    }

    if (matches.string.to !== undefined) {
        range.push("up to byte " + matches.string.to);
    }

    const pattern = matches.string.hex === true
        ? "hex pattern " + value
        : "string " + JSON.stringify(value);

    let result = inverted
        ? "packet data must not contain the " + pattern
        : "packet data must contain the " + pattern;

    if (algorithm) {
        result += " using the " + algorithm.toUpperCase() + " search algorithm";
    }

    if (range.length) {
        result += ", " + range.join(" and ");
    }

    if (matches.string.ignore_case === true) {
        result += ", ignoring letter case";
    }

    return result + ".";
}

/*
 * Funktion: describeLimitMatch()
 * Autor: Bernardo de Oliveira
 *
 * Beschreibt einen Limit Match
 */
function describeLimitMatch(matches) {
    if (!matches.limit || !matches.limit.rate) {
        return "";
    }

    const rate = cleanFirewallValue(matches.limit.rate);
    const burst = cleanFirewallValue(matches.limit.burst);
    const parts = [];

    parts.push(
        "uses one shared token-bucket limiter and matches only while the configured average rate of " +
        formatRate(rate) +
        " is available"
    );

    if (burst) {
        parts.push("the burst allowance is " + burst + " packets");
    }

    if (matches.limit.invert === true) {
        parts.push("the limiter result is inverted");
    }

    return parts.join("; ") + ".";
}

/*
 * Funktion: describeHashlimitMatch()
 * Autor: Bernardo de Oliveira
 *
 * Beschreibt einen Hashlimit Match
 */
function describeHashlimitMatch(matches) {
    if (!matches.hashlimit || !matches.hashlimit.rate) {
        return "";
    }

    const hashlimit = matches.hashlimit;
    const comparison = cleanFirewallValue(hashlimit.comparison).toLowerCase();
    const rate = formatRate(hashlimit.rate);
    const grouping = describeHashlimitMode(hashlimit.mode);
    const parts = [];

    if (comparison === "above") {
        parts.push("matches when the measured rate is above " + rate);
    } else {
        parts.push("matches while the measured rate is at or below " + rate);
    }

    if (grouping) {
        parts.push("rate accounting is separated by " + grouping);
    } else {
        parts.push("one shared rate bucket is used");
    }

    if (hashlimit.burst) {
        parts.push("burst allowance: " + hashlimit.burst + " packets");
    }

    if (hashlimit.name) {
        parts.push("hash table name: " + hashlimit.name);
    }

    if (hashlimit.htable_expire) {
        const milliseconds = Number.parseInt(hashlimit.htable_expire, 10);

        if (Number.isFinite(milliseconds)) {
            parts.push("inactive hash entries expire after " + formatMilliseconds(milliseconds));
        }
    }

    if (hashlimit.srcmask) {
        parts.push("source grouping mask: /" + hashlimit.srcmask);
    }

    if (hashlimit.dstmask) {
        parts.push("destination grouping mask: /" + hashlimit.dstmask);
    }

    if (hashlimit.invert === true) {
        parts.push("the hashlimit result is inverted");
    }

    return parts.join("; ") + ".";
}

/*
 * Funktion: describeHashlimitMode()
 * Autor: Bernardo de Oliveira
 *
 * Beschreibt den Hashlimit Modus
 */
function describeHashlimitMode(mode) {
    mode = cleanFirewallValue(mode);

    if (!mode) {
        return "";
    }

    const labels = {
        "srcip": "source IP address",
        "dstip": "destination IP address",
        "srcport": "source port",
        "dstport": "destination port"
    };

    return mode
        .split(",")
        .map(value => {
            const key = value.trim();

            return labels[key] || key;
        })
        .join(" + ");
}

/*
 * Funktion: formatRate()
 * Autor: Bernardo de Oliveira
 *
 * Formatiert eine Rate
 */
function formatRate(rate) {
    rate = cleanFirewallValue(rate);

    if (!rate) {
        return "";
    }

    return rate
        .replace(/\/s$/i, "/second")
        .replace(/\/sec$/i, "/second")
        .replace(/\/m$/i, "/minute")
        .replace(/\/min$/i, "/minute")
        .replace(/\/h$/i, "/hour");
}

/*
 * Funktion: formatMilliseconds()
 * Autor: Bernardo de Oliveira
 *
 * Formatiert Millisekunden in eine lesbare Form
 */
function formatMilliseconds(milliseconds) {
    if (milliseconds % 1000 === 0) {
        const seconds = milliseconds / 1000;

        return seconds + (seconds === 1 ? " second" : " seconds");
    }

    return milliseconds + " ms";
}

/*
 * Funktion: describeRecentMatch()
 * Autor: Bernardo de Oliveira
 *
 * Beschreibt einen recent Match
 */
function describeRecentMatch(matches) {
    if (!matches.recent || !matches.recent.operation) {
        return "";
    }

    const recent = matches.recent;
    const operation = cleanFirewallValue(recent.operation).toLowerCase();
    const name = cleanFirewallValue(recent.name) || "DEFAULT";

    const side = recent.side === "destination"
        ? "destination IP"
        : "source IP";

    const conditions = [];

    if (recent.seconds) {
        conditions.push("seen within the last " + recent.seconds + " seconds");
    }

    if (recent.hitcount) {
        conditions.push("recorded at least " + recent.hitcount + " times");
    }

    if (recent.rttl === true) {
        conditions.push("with the same TTL as the stored entry");
    }

    let result = "";

    switch (operation) {
        case "set":
            result = "add or refresh the " + side + " in list " + name;
            break;

        case "rcheck":
        case "check":
            result = "match only if the " + side + " already exists in list " + name;
            break;

        case "update":
            result = "match only if the " + side + " exists in list " + name + " and refresh its last-seen timestamp";
            break;

        case "remove":
            result = "match only if the " + side + " exists in list " + name + ", then remove that entry";
            break;

        default:
            result = "apply operation " + operation + " to the " + side + " in list " + name;
            break;
    }

    if (conditions.length) {
        result += ", requiring it to have been " + conditions.join(" and ");
    }

    if (recent.mask) {
        result += "; address mask: " + recent.mask;
    }

    if (recent.reap === true) {
        result += "; expired entries are reaped during the check";
    }

    if (recent.invert === true) {
        result += "; the recent-module result is inverted";
    }

    return result + ".";
}

/*
 * Funktion: formatNumericRange()
 * Autor: Bernardo de Oliveira
 *
 * Formatiert einen numerischen Bereich
 */
function formatNumericRange(value) {
    value = cleanFirewallValue(value);

    const parts = value.split(":");

    if (parts.length === 2) {
        return parts[0] + "-" + parts[1];
    }

    return value;
}

/*
 * Funktion: cleanFirewallValue()
 * Autor: Bernardo de Oliveira
 *
 * Bereinigt einen Firewall Wert
 */
function cleanFirewallValue(value) {
    if (value === undefined || value === null) {
        return "";
    }

    return String(value).replace(/\s+/g, " ").trim();
}

/*
 * Funktion: isFirewallChainExpanded()
 * Autor: Bernardo de Oliveira
 *
 * Prüft, ob eine Firewall Chain aufgeklappt ist
 */
function isFirewallChainExpanded(tableName, chain) {
    return expandedFirewallChains[tableName + "|" + chain] === true;
}

/*
 * Funktion: setFirewallChainExpanded()
 * Autor: Bernardo de Oliveira
 *
 * Speichert den Zustand einer Firewall Chain
 */
function setFirewallChainExpanded(tableName, chain, expanded) {
    const key = tableName + "|" + chain;

    if (expanded) {
        expandedFirewallChains[key] = true;
    } else {
        delete expandedFirewallChains[key];
    }
}

/*
 * Funktion: limitFirewallRules()
 * Autor: Bernardo de Oliveira
 *
 * Begrenzt die Anzahl sichtbarer Firewall Regeln
 */
function limitFirewallRules(rules, limit) {
    if (Array.isArray(rules)) {
        return rules.slice(0, limit);
    }

    return Object.fromEntries(Object.entries(Object(rules)).slice(0, limit));
}

/*
 * Funktion: getFirewallRuleCount()
 * Autor: Bernardo de Oliveira
 *
 * Zählt die Regeln einer Firewall Chain
 */
function getFirewallRuleCount(rules) {
    return Object.keys(Object(rules)).length;
}

/*
 * Funktion: generateFirewallChainToggle()
 * Autor: Bernardo de Oliveira
 *
 * Generiert den Button zum Auf- und Zuklappen einer Firewall Chain
 */
function generateFirewallChainToggle(tableName, chain, totalRows, expanded) {
    if (totalRows <= FIREWALL_ROWS_PER_CHAIN) {
        return null;
    }

    const button = document.createElement("button");

    button.type = "button";
    button.classList.add("firewall-chain-toggle");
    button.dataset.tableName = tableName;
    button.dataset.chain = chain;

    button.innerText = expanded
        ? "Show less"
        : "Show all rows (" + totalRows + ")";

    return button;
}

/*
 * Funktion: showFirewallDdosNotice()
 * Autor: Bernardo de Oliveira
 *
 * Zeigt die Meldung über eine aktive permanente DDoS Protection
 */
function showFirewallDdosNotice(firewall) {
    let notice = firewall.querySelector(".firewall-ddos-notice");

    if (!notice) {
        notice = document.createElement("div");
        notice.classList.add("firewall-ddos-notice");
        notice.textContent = "An active DDoS attack has been detected. Permanent protection has been enabled automatically.";

        firewall.prepend(notice);
    }
}

/*
 * Funktion: hideFirewallDdosNotice()
 * Autor: Bernardo de Oliveira
 *
 * Entfernt die Meldung über eine aktive permanente DDoS Protection
 */
function hideFirewallDdosNotice(firewall) {
    const notice = firewall.querySelector(".firewall-ddos-notice");

    if (notice) {
        notice.remove();
    }
}