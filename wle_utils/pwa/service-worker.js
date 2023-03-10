const CACHE = "app-cache-v1";

const files = [
    // This list can be created by looking at the list on the inspector app cache that is created after loading the app 2 times
    // On Chrome: Inspector -> Application -> Cache -> Cache Storage -> Your App Cache
    // Every file in the list with Response-Type = basic must be put here to make it work offline on the first load
    // The app will work offline even if this list is empty but will require it to be loaded 2 times, since the first only the files in this list
    // are actually precached
];

// This force using the cache first if the network is failing for cached resources
var forceTryCacheFirst = false;

self.addEventListener("install", function (event) {
    event.waitUntil(precacheResources());
});

self.addEventListener("fetch", function (event) {
    event.respondWith(getResource(event.request, true, true));
});

async function precacheResources() {
    const cache = await caches.open(CACHE);

    for (const file of files) {
        try {
            await cache.add(file);
        } catch (error) {
            console.error("Can't precache " + file);
        }
    }
}

/**
 * @param {Request} request 
 * 
 * @param {boolean} tryCacheFirst With tryCacheFirst you can specify if you want to first try the cache or always check the network for updates.
 *                                If cache is checked first, you could have an updated resources not being downloaded until cache is cleaned.
 * 
 * @param {boolean} fetchFromNetworkInBackground If tryCacheFirst is true, you can enable this flag to also fetch from network.
 *                                               This will update the cache for the next page load, not the current one.
 * 
 * @param {boolean} disableForceTryCacheFirst If tryCacheFirst is false and the network fails to get a resource that is already in the cache,
 *                                            it will, by default, start using the cache as first option.
 *                                            With this flag u can prevent that and keep using the network first.
 * 
 * @returns {Response}
 */
async function getResource(request, tryCacheFirst = true, fetchFromNetworkInBackground = false, disableForceTryCacheFirst = false) {
    if (tryCacheFirst || (forceTryCacheFirst && !disableForceTryCacheFirst)) {
        // Try to get the resource from the cache
        const responseFromCache = await getFromCache(request.url);
        if (responseFromCache != null) {
            if (fetchFromNetworkInBackground) {
                fetch(request).then(function (responseFromNetwork) {
                    if (responseFromNetwork != null && responseFromNetwork.status == 200) {
                        putInCache(request, responseFromNetwork.clone());
                    }
                }).catch(function () { /* do nothing, we tried to update cache, it's ok if fail*/ });
            }

            return responseFromCache;
        }
    }

    // Try to get the resource from the network
    try {
        const responseFromNetwork = await fetch(request);

        if (responseFromNetwork == null) {
            throw new Error("Can't fetch: " + request.url + " - Response is null");
        } else if (responseFromNetwork.status != 200) {
            throw new Error("Can't fetch: " + request.url + " - Error Code: " + responseFromNetwork.status);
        }

        // response may be used only once
        // we need to save clone to put one copy in cache
        // and serve second one
        putInCache(request, responseFromNetwork.clone());
        return responseFromNetwork;
    } catch (error) {
        if (!tryCacheFirst) {
            const responseFromCache = await getFromCache(request.url);
            if (responseFromCache != null) {
                if (!forceTryCacheFirst) {
                    console.error("Forcing cache first because of possible network issues");
                    forceTryCacheFirst = true;
                }

                return responseFromCache;
            }
        }

        // WLE use ? url params to make it so the bundle is not cached
        // but if network fails we can still try to use the cached one
        if (request.url != null) {
            const requestWithoutParamsURL = request.url.split("?")[0];

            const responseFromCacheWithoutParams = await getFromCache(requestWithoutParamsURL);
            if (responseFromCacheWithoutParams != null) {
                return responseFromCacheWithoutParams;
            }
        }

        return new Response("Network error happened", {
            status: 408,
            headers: { "Content-Type": "text/plain" },
        });
    }
}

async function getFromCache(requestURL) {
    return caches.match(requestURL);
}

async function putInCache(request, response) {
    try {
        // return if request is not GET
        if (request.method !== "GET") return;

        const cache = await caches.open(CACHE);
        cache.put(request, response);
    } catch (error) {
        // do nothing
    }
}