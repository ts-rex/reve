import resources from "./reve/index.ts"

const text = resources.text
const textString = new TextDecoder().decode(text)
console.log(textString)