if (typeof window["firewall"] !== 'undefined') throw new Error("Dieses Skript wurde bereits geladen.");

window["firewall"] = () => {
    let objects = document.querySelectorAll("[data-url]");

    generateFirewall(objects);
    /*backgroundProcesses[0] = setInterval(function () {
        generateFirewall(objects);
    }, 2000);*/

}

bindEvent("click", "#firewall tr", function (e) {
    let nextRow = this.parentNode.rows[this.rowIndex];
    nextRow.style.display = "table-row";
});

// TODO: Comment
function generateFirewall(objects) {
    for (let object of objects) {
        let html = "<div id='firewall'>";
        let data = tryParseJSON(httpGet(object.getAttribute("data-url")));

        let columns = [];
        for (let chains of Object.values(data)) {
            for (let rules of Object.values(Object(chains))) {
                for (let rule of Object.values(Object(rules))) {
                    let tempColumns = Object.keys(removeFromObject(rule, "comment"));

                    if (columns.length < tempColumns.length) columns = tempColumns;
                }
            }
        }

        for (let [table, chains] of Object.entries(data)) {
            html += "<h2>" + ucFirst(table) + "</h2>";

            for (let [chain, rules] of Object.entries(Object(chains))) {
                html += "<h3>" + chain + "</h3>";
                html += "<table>";
                html += generateTableHead(columns).outerHTML;

                html += "<tbody><tr><td>10</td><td>30 MB</td><td>ACCEPT</td><td>TCP</td><td>*</td><td>*</td><td>*</td><td>*</td></tr></tbody>";
                for (let [ruleID, rule] of Object.entries(Object(rules))) {
                }

                html += "</table>";
            }
        }

        object.innerHTML = html;
    }
}

// TODO: Comment
function generateFirewallHead() {

}

// TODO: Comment
function generateFirewallBody() {

}