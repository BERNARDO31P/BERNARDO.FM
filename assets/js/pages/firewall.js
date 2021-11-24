if (typeof window["firewall"] !== 'undefined') throw new Error("Dieses Skript wurde bereits geladen.");

window["firewall"] = () => {
    let objects = document.querySelectorAll("[data-url]");

    for (let i = 0; i < objects.length; i++) {
        let object = objects[i];
        let data = tryParseJSON(httpGet(object.getAttribute("data-url")));

        console.log(data);
    }
}

bindEvent("click", "tr", function (e) {
    let nextRow = this.parentNode.rows[this.rowIndex];
    nextRow.style.display = "table-row";

});
