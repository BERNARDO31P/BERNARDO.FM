/*
 * Funktion: bindEvent()
 * Autor: Brandon Ros (https://gist.github.com/brandonros/f276b75099d363d8c74e00ec55892e91)
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
                handler.apply(event.target.closest(selector), arguments)
            }
        }, false)
    })
}

const prev = (element, className = "") => {
        let prev = element.previousElementSibling;

        if (!className || prev.classList.contains(className))
            return prev;
}
