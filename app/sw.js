let l7ChallengeRequired = false;

const CACHE_VERSION = "v3";

const APPLICATION_CACHE = "bernardofm-app-" + CACHE_VERSION;
const EXTRA_CACHE = "bernardofm-extra-" + CACHE_VERSION;
const IMAGES_CACHE = "bernardofm-images-" + CACHE_VERSION;

const MAX_CACHE_SIZE = 4500;

/*
 * Dynamic endpoints which must never be stored in Cache Storage
 * and must always request fresh data from the server.
 */
const NETWORK_ONLY_PATHS = [
    "/system/firewall",
    "/system/monitoring"
];

/*
 * Known application resources.
 *
 * Other CSS/JS/fonts/etc. do not need to be listed here.
 * They are handled automatically based on request.destination.
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

/*
 * Fetch a request and check whether the L7 protection layer asks
 * the browser to perform a challenge.
 *
 * forceNoStore:
 *
 * true  = also bypass the browser HTTP cache
 * false = use the request's normal HTTP cache behaviour
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
 * ================================================================
 * PATH HELPERS
 * ================================================================
 */

/*
 * Returns true for:
 *
 * /system/firewall
 * /system/firewall/...
 *
 * /system/monitoring
 * /system/monitoring/...
 *
 * Query strings do not matter because URL.pathname excludes them.
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
 * ================================================================
 * CACHE HELPERS
 * ================================================================
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
     * This is an additional safety check.
     *
     * Even if one of the cache strategies accidentally receives a
     * dynamic endpoint in the future, it still cannot be written to
     * Cache Storage.
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
 * Remove cache versions which no longer belong to this deployment.
 *
 * Example when moving from v2 to v3:
 *
 * bernardofm-app-v2
 * bernardofm-extra-v2
 * bernardofm-images-v2
 *
 * are deleted.
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
 * Remove dynamic system endpoints from existing caches.
 *
 * This handles stale entries which may have been stored by an older
 * service-worker version.
 *
 * It deliberately scans every bernardofm-* cache because an endpoint
 * may previously have ended up in a different cache.
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
 * ================================================================
 * CACHE STRATEGIES
 * ================================================================
 */

/*
 * Always fetch from the real server.
 *
 * Cache Storage is never read or written.
 *
 * Browser HTTP caching is bypassed as well.
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
 * Try the real server first.
 *
 * Successful responses are stored in Cache Storage so they are available
 * as an offline fallback.
 *
 * Browser HTTP caching is bypassed during the network attempt, therefore
 * "network first" really means fetching a fresh response from the server.
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
         * Navigations can fall back to the cached application root.
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
 * Return Cache Storage immediately when available.
 *
 * The server is only contacted when the requested resource is not already
 * stored in Cache Storage.
 *
 * Suitable for images, fonts and other rarely changing resources.
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
 * ================================================================
 * INSTALL
 * ================================================================
 */

self.addEventListener("install", event => {
    event.waitUntil(
        (async () => {
            /*
             * Create all caches immediately.
             *
             * This also makes them visible in DevTools before runtime
             * resources have been requested.
             */
            const applicationCache = await caches.open(
                APPLICATION_CACHE
            );

            await caches.open(EXTRA_CACHE);
            await caches.open(IMAGES_CACHE);

            /*
             * Precache known application resources individually.
             *
             * A single unavailable resource must not make installation
             * of the entire service worker fail.
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
                     * Ignore individual precache failures.
                     *
                     * The resource can still be requested normally later.
                     */
                }
            }

            /*
             * Activate this service worker without waiting for all existing
             * tabs to close.
             */
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
            /*
             * Delete cache versions from previous deployments.
             */
            await clearOldCaches();

            /*
             * Also explicitly remove stale copies of dynamic system data.
             *
             * This protects against an older service worker having cached:
             *
             * /system/firewall
             * /system/monitoring
             */
            await removeNetworkOnlyEntriesFromCaches();

            /*
             * Immediately take control of currently open pages.
             */
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
     * Only manage requests belonging to this origin.
     *
     * External resources continue through the browser normally.
     */
    if (requestUrl.origin !== self.location.origin) {
        return;
    }

    /*
     * POST/PUT/PATCH/DELETE/etc. always reach the real server.
     *
     * They are never placed into Cache Storage.
     *
     * L7 challenge detection is still performed.
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
     * ============================================================
     * LIVE SYSTEM DATA
     * ============================================================
     *
     * These endpoints are deliberately checked BEFORE every cache
     * strategy.
     *
     * They:
     *
     * - never read from Cache Storage
     * - never write to Cache Storage
     * - bypass the browser HTTP cache
     *
     * This applies to:
     *
     * /system/firewall
     * /system/monitoring
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
     * Explicit cache:no-store requests always reach the real server.
     *
     * This is useful for callers such as:
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
     * ============================================================
     * NAVIGATION
     * ============================================================
     *
     * Try the server first.
     *
     * If the network is unavailable, use the cached page/application
     * shell as a fallback.
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
     * ============================================================
     * API
     * ============================================================
     *
     * API data should normally be fresh.
     *
     * Network-first still provides an offline fallback.
     *
     * If you have APIs which must NEVER use stale data, add those
     * endpoints to NETWORK_ONLY_PATHS instead.
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
     * ============================================================
     * APPLICATION CODE
     * ============================================================
     *
     * JavaScript/CSS/manifests/workers are network-first.
     *
     * This is important because cache-first would otherwise keep an old
     * firewall.min.js or monitoring.min.js indefinitely until the cache
     * was manually deleted or CACHE_VERSION changed.
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
     * ============================================================
     * FONTS
     * ============================================================
     *
     * Fonts rarely change and are suitable for cache-first.
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
     * ============================================================
     * IMAGES
     * ============================================================
     *
     * Images use their own cache and are served cache-first.
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
     * ============================================================
     * KNOWN APPLICATION RESOURCES
     * ============================================================
     *
     * Known HTML/application files are also network-first so a deployment
     * is picked up without requiring the user to clear Cache Storage.
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
     * ============================================================
     * OTHER SAME-ORIGIN RESOURCES
     * ============================================================
     *
     * Unknown resources are network-first rather than cache-first.
     *
     * This prevents accidentally turning an unknown dynamic endpoint into
     * a permanently stale Cache Storage entry.
     */
    event.respondWith(
        networkFirst(
            request,
            EXTRA_CACHE,
            event.clientId
        )
    );
});