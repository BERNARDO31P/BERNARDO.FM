/*
 * Funktion: bindEvent()
 * Autor: Bernardo de Oliveira
 * Argumente:
 *  eventNames: (String) Eventname z.B. click
 *  selector: (String) Den Elementselector z.B. die ID oder Klasse usw.
 *  handler: (Objekt) Die Funktion welche ausgeführt werden soll
 *
 * Ist das Äquivalent zu .on(eventNames, selector, handler) in jQuery
 */
const bindEvent = (eventNames, selector, handler) => {
    eventNames.split(' ').forEach((eventName) => {
        document.addEventListener(eventName, function (event) {
            if (event.target.matches(selector + ', ' + selector + ' *')) {
                switch (eventName) {
                    case "click":
                        if (!event.target.closest(selector).onclick) {
                            event.target.closest(selector).onclick = handler;
                            handler.apply(event.target.closest(selector), arguments);
                        }
                        break;
                    default:
                        handler.apply(event.target.closest(selector), arguments);
                        break;
                }
            }
        }, false);
    });
};

/*
 * Funktion: prev()
 * Autor: Bernardo de Oliveira
 * Argumente:
 *  element: (Objekt) Das Element welches geprüft werden soll
 *  className: (String) Wenn eine Klasse mitgegeben wird, wird ein Filter angewendet
 *
 * Ist das Äquivalent zu .prev(selector) in jQuery
 */
const prev = (element, className = "") => {
    let prev = element.previousElementSibling;

    if (!className || prev.classList.contains(className))
        return prev;
}
