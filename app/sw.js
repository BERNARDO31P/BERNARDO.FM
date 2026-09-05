let l7ChallengeRequired = false;

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

    if (response.headers.get("X-L7-Challenge") === "required") {
        l7ChallengeRequired = true;

        await notifyL7Challenge(clientId);

        return response;
    }

    if (navigation) {
        l7ChallengeRequired = false;
    }

    return response;
}

self.addEventListener("install", event => {
    event.waitUntil(
        caches.open("bernardofm").then(async cache => {
            /*
             * Do not accidentally cache the L7 challenge page.
             */
            const response = await fetch("/", {
                cache: "no-store"
            });

            if (
                response.ok
                && response.headers.get("X-L7-Challenge") !== "required"
            ) {
                await cache.put("/", response.clone());
            }

            await self.skipWaiting();
        })
    );
});

self.addEventListener("activate", event => {
    event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", event => {
    /*
     * Once an AJAX/fetch request detected an expired L7 token,
     * the next page navigation must bypass the PWA cache.
     *
     * Otherwise location.reload() could simply return the cached /
     * again and the user would never see the challenge.
     */
    if (event.request.mode === "navigate" && l7ChallengeRequired) {
        event.respondWith(
            fetchRequest(event.request, event.clientId, true)
        );

        return;
    }

    /*
     * Never try to serve POST/PUT/PATCH/etc. from Cache Storage.
     */
    if (event.request.method !== "GET") {
        event.respondWith(
            fetchRequest(event.request, event.clientId)
        );

        return;
    }

    event.respondWith(
        caches.match(event.request).then(response => {
            if (response) {
                return response;
            }

            return fetchRequest(event.request, event.clientId);
        }).catch(() => {
            return Response.error();
        })
    );
});