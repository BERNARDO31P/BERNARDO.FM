let objects = document.querySelectorAll("[data-url]");
console.log(httpGet(objects[0].getAttribute("data-url")));