import { Reve } from "../mod.ts"
const reve = new Reve(import.meta.url, true)
reve.addResource("text", "./randomtxt.txt")
reve.watch()
