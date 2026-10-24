let l7ChallengeRequired = false;

const CACHE_VERSION = "v4";

const APPLICATION_CACHE = "bernardofm-app-" + CACHE_VERSION;
const EXTRA_CACHE = "bernardofm-extra-" + CACHE_VERSION;
const IMAGES_CACHE = "bernardofm-images-" + CACHE_VERSION;

const MAX_CACHE_SIZE = 4500;

/*
 * Dynamische Endpunkte dürfen niemals im Cache Storage gespeichert
 * werden. Sie müssen ihre Daten immer frisch vom Server abrufen.
 */
const NETWORK_ONLY_PATHS = [
    "/system/firewall",
    "/system/monitoring",
    "/system/song"
];

/*
 * Bekannte Anwendungsressourcen. Andere CSS-/JS-Dateien, Schriftarten usw.
 * müssen hier nicht aufgeführt werden. Sie werden automatisch anhand
 * von request.destination behandelt.
 */
const APPLICATION = [
    "/",
    "/assets/css/lib/all.css",
    "/assets/css/style.min.css",
    "/assets/js/lib/all.js",
    "/assets/js/lib/player.min.js",
    "/assets/js/tools.min.js",
    "/assets/js/script.min.js",
    "/pages/home.html",
    "/assets/js/pages/home.min.js",
    "/pages/music.html",
    "/assets/js/pages/music.min.js",
    "/pages/monitoring.html",
    "/assets/js/pages/monitoring.min.js",
    "/pages/firewall.html",
    "/assets/js/pages/firewall.min.js",
    "/pages/projects.html",
    "/assets/js/pages/projects.min.js",
    "/manifest.webmanifest"
];


/*
 * L7-SCHUTZ
 */

function isL7Challenge(response) {
    return response.headers.get("X-L7-Challenge") === "required";
}

async function notifyL7Challenge(clientId) {
    if (clientId) {
        const client = await self.clients.get(clientId);

        if (client) {
            client.postMessage({
                type: "l7-challenge"
            });

            return;
        }
    }

    const clients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true
    });

    for (const client of clients) {
        client.postMessage({
            type: "l7-challenge"
        });
    }
}

/*
 * Führt die Anfrage aus und prüft, ob der L7-Schutz vom Browser eine
 * Challenge verlangt.
 * 
 * forceNoStore:
 * 
 * true  = zusätzlich den HTTP-Cache des Browsers umgehen
 * false = die normale HTTP-Cache-Behandlung der Anfrage verwenden
 */
async function fetchRequest(
    request,
    clientId,
    navigation = false,
    forceNoStore = false
) {
    const response = forceNoStore
        ? await fetch(request, {
            cache: "no-store"
        })
        : await fetch(request);

    if (isL7Challenge(response)) {
        l7ChallengeRequired = true;

        await notifyL7Challenge(clientId);

        return response;
    }

    if (navigation) {
        l7ChallengeRequired = false;
    }

    return response;
}


/*
 * HILFSFUNKTIONEN FÜR PFADE
 */

/*
 * Gibt für folgende Pfade true zurück:
 * 
 * /system/firewall
 * /system/firewall/...
 * 
 * /system/monitoring
 * /system/monitoring/...
 * 
 * Abfrageparameter spielen keine Rolle, da URL.pathname sie ausschliesst.
 */
function isNetworkOnlyPath(pathname) {
    return NETWORK_ONLY_PATHS.some(path => {
        return (
            pathname === path
            || pathname.startsWith(path + "/")
        );
    });
}


/*
 * HILFSFUNKTIONEN FÜR DEN CACHE
 */

function isCacheableResponse(response) {
    return (
        response.status === 200
        && !isL7Challenge(response)
    );
}

async function putCache(cache, request, response) {
    if (!isCacheableResponse(response)) {
        return;
    }

    const requestUrl = new URL(request.url);

    /*
     * Zusätzliche Sicherheitsprüfung: Selbst wenn eine Cache-Strategie
     * zukünftig versehentlich einen dynamischen Endpunkt erhält, darf sie
     * diesen nicht im Cache Storage speichern.
     */
    if (isNetworkOnlyPath(requestUrl.pathname)) {
        return;
    }

    const keys = await cache.keys();

    if (keys.length >= MAX_CACHE_SIZE) {
        await cache.delete(keys[0]);
    }

    await cache.put(
        request,
        response.clone()
    );
}

/*
 * Entfernt Cache-Versionen, die nicht mehr zur aktuellen Bereitstellung gehören.
 * 
 * Beispiel beim Wechsel von v2 auf v3:
 * 
 * bernardofm-app-v2
 * bernardofm-extra-v2
 * bernardofm-images-v2
 * 
 * werden gelöscht.
 */
async function clearOldCaches() {
    const currentCaches = [
        APPLICATION_CACHE,
        EXTRA_CACHE,
        IMAGES_CACHE
    ];

    const cacheNames = await caches.keys();

    for (const cacheName of cacheNames) {
        if (
            cacheName.startsWith("bernardofm-")
            && !currentCaches.includes(cacheName)
        ) {
            await caches.delete(cacheName);
        }
    }
}

/*
 * Entfernt dynamische Systemendpunkte aus bestehenden Caches.
 * 
 * Damit werden veraltete Einträge früherer Service-Worker-Versionen
 * bereinigt. Alle bernardofm-*-Caches werden geprüft, weil ein Endpunkt
 * früher auch in einem anderen Cache gelandet sein könnte.
 */
async function removeNetworkOnlyEntriesFromCaches() {
    const cacheNames = await caches.keys();

    for (const cacheName of cacheNames) {
        if (!cacheName.startsWith("bernardofm-")) {
            continue;
        }

        const cache = await caches.open(cacheName);
        const requests = await cache.keys();

        for (const request of requests) {
            const requestUrl = new URL(request.url);

            if (isNetworkOnlyPath(requestUrl.pathname)) {
                await cache.delete(request);
            }
        }
    }
}


/*
 * CACHE-STRATEGIEN
 */

/*
 * Daten immer direkt vom Server abrufen. Cache Storage wird
 * weder gelesen noch beschrieben. Auch der HTTP-Cache des Browsers
 * wird umgangen.
 */
async function networkOnly(request, clientId) {
    return fetchRequest(
        request,
        clientId,
        false,
        true
    );
}

/*
 * Zuerst den Server anfragen. Erfolgreiche Antworten werden als
 * Offline-Fallback im Cache Storage gespeichert. Während der
 * Netzwerkanfrage wird der HTTP-Cache umgangen. Damit bedeutet
 * «Netzwerk zuerst» tatsächlich eine frische Antwort vom Server.
 */
async function networkFirst(
    request,
    cacheName,
    clientId,
    navigation = false
) {
    const cache = await caches.open(cacheName);

    try {
        const response = await fetchRequest(
            request,
            clientId,
            navigation,
            true
        );

        if (!isL7Challenge(response)) {
            await putCache(
                cache,
                request,
                response
            );
        }

        return response;
    } catch (error) {
        let cachedResponse = await cache.match(request);

        /*
         * Bei Navigationen kann auf die zwischengespeicherte
         * Anwendungsstartseite zurückgegriffen werden.
         */
        if (
            !cachedResponse
            && navigation
        ) {
            cachedResponse = await caches.match("/");
        }

        if (cachedResponse) {
            return cachedResponse;
        }

        return Response.error();
    }
}

/*
 * Falls vorhanden, den Eintrag sofort aus Cache Storage zurückgeben.
 * Nur wenn er dort fehlt, wird der Server kontaktiert. Geeignet für
 * Bilder, Schriftarten und andere selten geänderte Ressourcen.
 */
async function cacheFirst(
    request,
    cacheName,
    clientId
) {
    const cache = await caches.open(cacheName);

    const cachedResponse = await cache.match(request);

    if (cachedResponse) {
        return cachedResponse;
    }

    try {
        const response = await fetchRequest(
            request,
            clientId
        );

        if (!isL7Challenge(response)) {
            await putCache(
                cache,
                request,
                response
            );
        }

        return response;
    } catch (error) {
        return Response.error();
    }
}


/*
 * INSTALLATION
 */

self.addEventListener("install", event => {
    event.waitUntil(
        (async () => {
            /*
             * Alle Caches sofort erstellen, damit sie auch in DevTools sichtbar
             * sind, bevor die ersten Ressourcen angefordert wurden.
             */
            const applicationCache = await caches.open(
                APPLICATION_CACHE
            );

            await caches.open(EXTRA_CACHE);
            await caches.open(IMAGES_CACHE);

            /*
             * Bekannte Anwendungsressourcen einzeln vorab zwischenspeichern.
             * Eine einzelne nicht verfügbare Ressource darf die Installation
             * des gesamten Service Workers nicht verhindern.
             */
            for (const path of APPLICATION) {
                try {
                    const request = new Request(path, {
                        credentials: "same-origin",
                        cache: "no-store"
                    });

                    const response = await fetch(request);

                    if (isCacheableResponse(response)) {
                        await applicationCache.put(
                            path,
                            response.clone()
                        );
                    }
                } catch (error) {
                    /*
                     * Fehler beim Vorab-Zwischenspeichern einzelner Ressourcen ignorieren.
                     * Die Ressource kann später weiterhin normal angefordert werden.
                     */
                }
            }

            /*
             * Diesen Service Worker aktivieren, ohne auf das Schliessen aller
             * offenen Tabs zu warten.
             */
            await self.skipWaiting();
        })()
    );
});


/*
 * AKTIVIERUNG
 */

self.addEventListener("activate", event => {
    event.waitUntil(
        (async () => {
            /*
             * Cache-Versionen früherer Bereitstellungen löschen.
             */
            await clearOldCaches();

            /*
             * Zusätzlich veraltete Kopien dynamischer Systemdaten entfernen.
             * Damit wird verhindert, dass ein älterer Service Worker die Endpunkte
             * /system/firewall und /system/monitoring zwischengespeichert lässt.
             */
            await removeNetworkOnlyEntriesFromCaches();

            /*
             * Bereits geöffnete Seiten sofort unter die Kontrolle dieses
             * Service Workers stellen.
             */
            await self.clients.claim();
        })()
    );
});


/*
 * ANFRAGEN
 */

self.addEventListener("fetch", event => {
    const request = event.request;
    const requestUrl = new URL(request.url);

    /*
     * Anfragen von Browsererweiterungen nicht behandeln.
     */
    if (
        requestUrl.protocol === "chrome-extension:"
        || requestUrl.protocol === "moz-extension:"
    ) {
        return;
    }

    /*
     * Nur Anfragen vom eigenen Ursprung verwalten. Externe Ressourcen
     * werden weiterhin normal vom Browser behandelt.
     */
    if (requestUrl.origin !== self.location.origin) {
        return;
    }

    /*
     * POST-/PUT-/PATCH-/DELETE-Anfragen erreichen immer den Server und
     * werden niemals im Cache Storage gespeichert. Die Prüfung auf eine
     * L7-Challenge erfolgt dennoch.
     */
    if (request.method !== "GET") {
        event.respondWith(
            networkOnly(
                request,
                event.clientId
            )
        );

        return;
    }

    /*
     * DYNAMISCHE SYSTEMDATEN
     * 
     * Diese Endpunkte werden absichtlich VOR jeder Cache-Strategie geprüft.
     * Sie lesen niemals aus Cache Storage, schreiben niemals hinein und
     * umgehen den HTTP-Cache des Browsers.
     * 
     * Das gilt für /system/firewall und /system/monitoring.
     */
    if (isNetworkOnlyPath(requestUrl.pathname)) {
        event.respondWith(
            networkOnly(
                request,
                event.clientId
            )
        );

        return;
    }

    /*
     * Anfragen mit ausdrücklichem cache: "no-store" gehen immer direkt
     * an den Server. Das ist beispielsweise für folgenden Aufruf sinnvoll:
     * 
     * fetch(url, {
     *     cache: "no-store"
     * });
     */
    if (request.cache === "no-store") {
        event.respondWith(
            networkOnly(
                request,
                event.clientId
            )
        );

        return;
    }

    /*
     * NAVIGATION
     * 
     * Zuerst den Server anfragen. Falls das Netzwerk nicht verfügbar ist,
     * auf die zwischengespeicherte Seite bzw. Anwendungshülle zurückgreifen.
     */
    if (request.mode === "navigate") {
        event.respondWith(
            networkFirst(
                request,
                APPLICATION_CACHE,
                event.clientId,
                true
            )
        );

        return;
    }

    /*
     * API
     * 
     * API-Daten sollten normalerweise aktuell sein. Die Netzwerk-zuerst-
     * Strategie bietet dennoch einen Offline-Fallback. Endpunkte, die NIEMALS
     * veraltete Daten verwenden dürfen, gehören stattdessen in NETWORK_ONLY_PATHS.
     */
    if (requestUrl.pathname.startsWith("/api/")) {
        event.respondWith(
            networkFirst(
                request,
                EXTRA_CACHE,
                event.clientId
            )
        );

        return;
    }

    /*
     * ANWENDUNGSCODE
     * 
     * JavaScript-, CSS-, Manifest- und Worker-Dateien verwenden die
     * Netzwerk-zuerst-Strategie. Mit Cache zuerst würden etwa
     * firewall.min.js und monitoring.min.js möglicherweise unbegrenzt
     * veraltet bleiben, bis der Cache geleert oder CACHE_VERSION geändert wird.
     */
    if (
        request.destination === "script"
        || request.destination === "style"
        || request.destination === "manifest"
        || request.destination === "worker"
        || request.destination === "sharedworker"
    ) {
        event.respondWith(
            networkFirst(
                request,
                APPLICATION_CACHE,
                event.clientId
            )
        );

        return;
    }

    /*
     * SCHRIFTARTEN
     * 
     * Schriftarten ändern sich selten und eignen sich für Cache zuerst.
     */
    if (request.destination === "font") {
        event.respondWith(
            cacheFirst(
                request,
                APPLICATION_CACHE,
                event.clientId
            )
        );

        return;
    }

    /*
     * BILDER
     * 
     * Bilder verwenden einen eigenen Cache und werden mit Cache zuerst ausgeliefert.
     */
    if (
        request.destination === "image"
        || requestUrl.pathname.endsWith(".png")
        || requestUrl.pathname.endsWith(".jpg")
        || requestUrl.pathname.endsWith(".jpeg")
        || requestUrl.pathname.endsWith(".gif")
        || requestUrl.pathname.endsWith(".svg")
        || requestUrl.pathname.endsWith(".webp")
        || requestUrl.pathname.endsWith(".ico")
        || requestUrl.pathname.endsWith(".avif")
    ) {
        event.respondWith(
            cacheFirst(
                request,
                IMAGES_CACHE,
                event.clientId
            )
        );

        return;
    }

    /*
     * BEKANNTE ANWENDUNGSRESSOURCEN
     * 
     * Bekannte HTML- und Anwendungsdateien verwenden ebenfalls Netzwerk zuerst,
     * damit neue Versionen ohne manuelles Leeren von Cache Storage geladen werden.
     */
    if (APPLICATION.includes(requestUrl.pathname)) {
        event.respondWith(
            networkFirst(
                request,
                APPLICATION_CACHE,
                event.clientId
            )
        );

        return;
    }

    /*
     * SONSTIGE RESSOURCEN DES EIGENEN URSPRUNGS
     * 
     * Unbekannte Ressourcen werden mit Netzwerk zuerst behandelt. So wird
     * verhindert, dass ein unbekannter dynamischer Endpunkt versehentlich
     * dauerhaft veraltet im Cache Storage landet.
     */
    event.respondWith(
        networkFirst(
            request,
            EXTRA_CACHE,
            event.clientId
        )
    );
});