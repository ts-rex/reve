# reVe
reVe (re5e; re(sourc)e, pronounced `reeve`) is a build tool for applications that converts  resource files into typescript files for building, bundling, or compiling your code.

```ts
import { createReve } from "@ts-rex/reve"
const reve = createReve()

reve.addResource("client", "./client/dist/index.html")

if(Deno.env.get("DEV")) {
    reve.watch()
} else {
    reve.build()
}
```

```ts
import { App } from "generic-webserver-library"
const app = new App();

const textDecoder = new TextDecoder()

app.get('/', async (req, res) => {
    res.html(textDecoder.decode((await import('./reve/index.ts')).client))
})
```