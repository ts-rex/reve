import { encodeBase64 } from "@std/encoding"
import { ensureFile, emptyDir } from "@std/fs"
/**
 * Base class for reve
 */
export class Reve {
  #resources: Map<string, string> = new Map()
  #locked: boolean = false

  async #processResource(name: string, source: string) {
    const sourceBuff = await Deno.readFile(source);
    const transformed = encodeBase64(sourceBuff);
    const path = `./reve/source/${name}.ts`
    await ensureFile(path)
    await Deno.writeTextFile(path, `export default "${transformed}"`)
  }

  #getMapString() {
    let mapString = "{"
    Array.from(this.#resources.entries()).forEach(([k, _]) => {
      mapString += `"${k}": decodeBase64((await import("./source/${k}.ts")).default)`
    })
    mapString += "}"
    return mapString
  }

  async #buildOutfile(mapString: string) {
    const path = `./reve/index.ts`
    await ensureFile(path)
    await Deno.writeTextFile(path, `import { decodeBase64 } from "jsr:@std/encoding@^0.224.2"; export default ${mapString}`)
  }
  /**
   * Adds a resource to be compressed
   * @param name Resource name
   * @param source Source file of resource
   */
  addResource(name: string, source: string) {
    if (this.#locked) return
    if (name.length == 0) throw new Error("Resource name length must not be 0")
    if (!/^[a-z0-9_]+$/i.test(name)) throw new Error("Name must be alphanumeric or _")
    this.#resources.set(name, source)
  }
  /**
   * Removes an existing resource
   * @param name Resource name
   */
  removeResource(name: string) {
    if (this.#locked) return
    this.#resources.delete(name)
  }
  /**
   * Builds all existing resources
   */
  async build() {
    this.#locked = true;
    emptyDir("./reve/source")
    this.#resources.forEach(async (v, k) => {
      await this.#processResource(k, v)
    })
    const mapString = this.#getMapString()
    await this.#buildOutfile(mapString)
  }

  /**
   * Watch for resource updates & build (EXPERIMENTAL)
   */
  async watch() {
    this.#locked = true;
    await this.build()
    this.#resources.forEach(async (source, name) => {
      const watcher = Deno.watchFs(source)
      for await (const event of watcher) {
        if (["modify", "create"].includes(event.kind)) {
          console.log(`Rebuilding resource \`${name}\``)
          this.#processResource(name, source)
          const mapString = this.#getMapString()
          await this.#buildOutfile(mapString)
          console.log(`✅ Rebuilt resource \`${name}\``)
        }
      }
    })
  }
}

/**
 * Easy initialization function
 * @returns Reve class
 */
export function createReve(): Reve {
  return new Reve()
}
