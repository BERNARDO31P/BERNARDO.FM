let l7ChallengeRequired = false;

const CACHE_VERSION = "v1";

const APPLICATION_CACHE = "bernardofm-app-" + CACHE_VERSION;
const EXTRA_CACHE       = "bernardofm-extra-" + CACHE_VERSION;
const IMAGES_CACHE      = "bernardofm-images-" + CACHE_VERSION;

const MAX_CACHE_SIZE = 4500;

/*
 * Known application resources.
 *
 * CSS/JS/fonts/etc. do not need to be listed here. They are added
 * automatically when the page requests them.
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
 * ================================================================
 * L7 PROTECTION
 * ================================================================
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

async function fetchRequest(request, clientId, navigation = false) {
    const response = await fetch(request);

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
 * ================================================================
 * CACHE HELPERS
 * ================================================================
 */

function isCacheableResponse(response) {
    return response.status === 200 && !isL7Challenge(response);
}

async function putCache(cache, request, response) {
    if (!isCacheableResponse(response)) {
        return;
    }

    const keys = await cache.keys();

    if (keys.length >= MAX_CACHE_SIZE) {
        await cache.delete(keys[0]);
    }

    await cache.put(request, response.clone());
}

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
 * ================================================================
 * CACHE STRATEGIES
 * ================================================================
 */

async function networkOnly(request, clientId) {
    return fetchRequest(request, clientId);
}

async function networkFirst(request, cacheName, clientId, navigation = false) {
    const cache = await caches.open(cacheName);

    try {
        const response = await fetchRequest(request, clientId, navigation);

        if (!isL7Challenge(response)) {
            await putCache(cache, request, response);
        }

        return response;
    } catch (error) {
        let cachedResponse = await cache.match(request);

        if (!cachedResponse && navigation) {
            cachedResponse = await caches.match("/");
        }

        if (cachedResponse) {
            return cachedResponse;
        }

        return Response.error();
    }
}

async function cacheFirst(request, cacheName, clientId) {
    const cache = await caches.open(cacheName);
    const cachedResponse = await cache.match(request);

    if (cachedResponse) {
        return cachedResponse;
    }

    try {
        const response = await fetchRequest(request, clientId);

        if (!isL7Challenge(response)) {
            await putCache(cache, request, response);
        }

        return response;
    } catch (error) {
        return Response.error();
    }
}


/*
 * ================================================================
 * INSTALL
 * ================================================================
 */

self.addEventListener("install", event => {
    event.waitUntil(
        (async () => {
            /*
             * Create all caches immediately so they are visible in
             * DevTools even before runtime resources are added.
             */
            const applicationCache = await caches.open(APPLICATION_CACHE);

            await caches.open(EXTRA_CACHE);
            await caches.open(IMAGES_CACHE);

            /*
             * Precache known application resources individually.
             *
             * One failed resource must not make service-worker
             * installation fail.
             */
            for (const path of APPLICATION) {
                try {
                    const request = new Request(path, {
                        credentials: "same-origin",
                        cache: "no-store"
                    });

                    const response = await fetch(request);

                    if (isCacheableResponse(response)) {
                        await applicationCache.put(path, response.clone());
                    }
                } catch (error) {
                }
            }

            await self.skipWaiting();
        })()
    );
});


/*
 * ================================================================
 * ACTIVATE
 * ================================================================
 */

self.addEventListener("activate", event => {
    event.waitUntil(
        (async () => {
            await clearOldCaches();
            await self.clients.claim();
        })()
    );
});


/*
 * ================================================================
 * FETCH
 * ================================================================
 */

self.addEventListener("fetch", event => {
    const request = event.request;
    const requestUrl = new URL(request.url);

    /*
     * Never handle browser extensions.
     */
    if (
        requestUrl.protocol === "chrome-extension:"
        || requestUrl.protocol === "moz-extension:"
    ) {
        return;
    }

    /*
     * POST/PUT/PATCH/DELETE/etc. always go to the network.
     *
     * They still pass through L7 challenge detection.
     */
    if (request.method !== "GET") {
        event.respondWith(
            networkOnly(request, event.clientId)
        );

        return;
    }

    /*
     * Only cache resources belonging to this origin.
     *
     * External resources continue normally through the network.
     */
    if (requestUrl.origin !== self.location.origin) {
        return;
    }

    /*
     * Explicit cache:no-store requests are intentionally checking
     * the real server.
     *
     * This is important for httpGetJSON(), getScript(), etc.
     */
    if (request.cache === "no-store") {
        event.respondWith(
            networkOnly(request, event.clientId)
        );

        return;
    }

    /*
     * Navigations are network-first.
     *
     * This ensures that opening/reloading the PWA after the L7 token
     * expires actually reaches the protection layer instead of
     * permanently serving a cached application shell.
     *
     * If offline, the cached page is used as fallback.
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
     * API requests should normally return fresh information.
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
     * Application files.
     *
     * This automatically catches:
     *
     * <script src="...">
     * <link rel="stylesheet" ...>
     * fonts
     * manifests
     * workers
     *
     * No filenames have to be hardcoded.
     */
    if (
        request.destination === "script"
        || request.destination === "style"
        || request.destination === "font"
        || request.destination === "manifest"
        || request.destination === "worker"
        || request.destination === "sharedworker"
    ) {
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
     * Images have their own cache.
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
     * Explicit application resources.
     */
    if (APPLICATION.includes(requestUrl.pathname)) {
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
     * Everything else from bernardo.fm is runtime-cached here.
     */
    event.respondWith(
        cacheFirst(
            request,
            EXTRA_CACHE,
            event.clientId
        )
    );
});