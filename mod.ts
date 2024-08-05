import { encodeBase64 } from "@std/encoding"
import { emptyDir, ensureFile } from "@std/fs"
import { gzip } from "https://deno.land/x/compress@v0.4.5/mod.ts"

function sanitizeFilename(filename: string) {
  const invalidChars = /[<>:"/\\|?*\x00-\x1F]/g
  const sanitized = filename.replace(invalidChars, "").replace(" ", "_")
  const trimmed = sanitized.trim()
  const maxLength = 255
  const finalFilename = trimmed.length > maxLength
    ? trimmed.substring(0, maxLength)
    : trimmed

  return finalFilename
}

function debounce<T extends Array<unknown>, X>(fn: (...args: T) => X, delay: number) {
  let timeoutId: number;
  return (...args: T): Promise<X> => {
    return new Promise((res) => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      timeoutId = setTimeout(() => {
        res(fn(...args));
      }, delay);
    })
  };
}

/**
 * Base class for reve
 */
export class Reve {
  #resources: Map<string, URL> = new Map()
  #fileNameMap: Map<string, string> = new Map()
  #locked: boolean = false
  /**
   * @param url The base file url of the project, used to determine relative paths & the output folder
   * @param [doGzip=false] Optionally enale gziping output files
   */
  constructor(private url: string, private doGzip: boolean = false) { }

  #getAbsolutePath(relativePath: string) {
    return new URL(relativePath, this.url)
  }

  async #processResource(name: string, source: URL) {
    try {
      const sourceBuff = (this.doGzip ? gzip : (v: Uint8Array) => v)(await Deno.readFile(source))
      const transformed = encodeBase64(sourceBuff)
      const filename = sanitizeFilename(name)
      const path = this.#getAbsolutePath(`./reve/source/${filename}.ts`)
      await ensureFile(path)
      await Deno.writeTextFile(path, `export default "${transformed}"`)
    } catch {
      console.log(`unable to process \`${name}\`, Ignoring.`)
    }
  }

  #getMapString() {
    let mapString = "{"
    Array.from(this.#resources.entries()).forEach(([k, _]) => {
      mapString +=
        `"${k}": ${this.doGzip?`gunzip(`:''}decodeBase64((await import("./source/${k}.ts")).default)${this.doGzip?`)`:''}`
    })
    mapString += "}"
    return mapString
  }

  async #buildOutfile(mapString: string) {
    const path = this.#getAbsolutePath(`./reve/index.ts`)
    await ensureFile(path)
    await Deno.writeTextFile(
      path,
      `import { decodeBase64 } from "jsr:@std/encoding@^0.224.2"; ${this.doGzip?`import { gunzip } from "https://deno.land/x/compress@v0.4.5/mod.ts";`:''} export default ${mapString}`,
    )
  }
  /**
   * Adds a resource to be compressed
   * @param name Resource name
   * @param source Source file of resource
   */
  addResource(name: string, source: string) {
    if (this.#locked) return
    if (name.length == 0) {
      throw new Error("Resource name length must not be 0")
    }
    if (!/^[a-z0-9_ ]+$/i.test(name)) {
      throw new Error("Name must be alphanumeric or _")
    }
    const sanitizedFilename = sanitizeFilename(name)
    const conflictingName = this.#fileNameMap.get(sanitizedFilename)
    if (conflictingName) {
      throw new Error(
        `Resource \`${name}\`, when sanitized, has the same file name as \`${conflictingName}\` (${sanitizedFilename}.ts)`,
      )
    }
    this.#fileNameMap.set(sanitizedFilename, name)
    this.#resources.set(name, this.#getAbsolutePath(source))
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
    this.#locked = true
    emptyDir("./reve/source")
    this.#resources.forEach(async (v, k) => {
      console.log(`Building resource \`${k}\`\n`)
      await this.#processResource(k, v)
      console.log(`✅ Built resource \`${k}\`\n\n`)
    })
    const mapString = this.#getMapString()
    await this.#buildOutfile(mapString)
  }

  /**
   * Watch for resource updates & build (EXPERIMENTAL)
   */
  async watch() {
    this.#locked = true
    await this.build()
    this.#resources.forEach(async (source, name) => {
      const watcher = Deno.watchFs(source.pathname)
      const process = debounce(async (event: Deno.FsEvent) => {
        if (["modify", "create"].includes(event.kind)) {
          console.log(`Building resource \`${name}\`\n`)
          this.#processResource(name, source)
          const mapString = this.#getMapString()
          await this.#buildOutfile(mapString)
          console.log(`✅ Built resource \`${name}\`\n\n`)
        }
      }, 100)
      for await (const event of watcher) {
        process(event)
      }
    })
  }
}

/**
 * Easy initialization function
 * @deprecated
 * @param url The base file url of the project, used to determine relative paths & the output folder
 * @returns Reve class
 */
export function createReve(url: string): Reve {
  return new Reve(url)
}
