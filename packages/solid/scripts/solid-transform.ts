import { transformAsync } from "@solidjs/compiler"
import { init, parse } from "es-module-lexer"

export type ResolveImportPath = (specifier: string) => string | null

export interface TransformSolidSourceOptions {
  filename: string
  moduleName?: string
  resolvePath?: ResolveImportPath
}

const nodeModulesPattern = /[/\\]node_modules[/\\]/
const tsPattern = /\.[cm]?tsx?$/
const jsxPattern = /\.[cm]?[jt]sx$/

export function stripQueryAndHash(path: string): string {
  const searchIndex = path.indexOf("?")
  const hashIndex = path.indexOf("#")
  const end = [searchIndex, hashIndex].filter((index) => index >= 0).sort((a, b) => a - b)[0]
  return end === undefined ? path : path.slice(0, end)
}

export function isNodeModulesPath(path: string): boolean {
  return nodeModulesPattern.test(path)
}

export function resolveNodeSolidRuntimeImport(specifier: string): string | null {
  switch (specifier) {
    case "solid-js":
      return "solid-js/dist/solid.js"
    case "solid-js/store":
      return "solid-js/store/dist/store.js"
    default:
      return null
  }
}

export async function transformSolidSource(code: string, options: TransformSolidSourceOptions): Promise<string> {
  const filename = stripQueryAndHash(options.filename)

  if (jsxPattern.test(filename)) {
    code = (
      await transformAsync(code, {
        filename,
        moduleName: options.moduleName ?? "@opentui/solid",
        generate: "universal",
      })
    ).code
  }

  // The Solid compiler keeps TypeScript syntax.
  if (tsPattern.test(filename)) {
    code = new Bun.Transpiler({ loader: "ts", target: "bun" }).transformSync(code)
  }

  return options.resolvePath ? rewriteImports(code, options.resolvePath) : code
}

async function rewriteImports(code: string, resolvePath: ResolveImportPath): Promise<string> {
  await init
  const [imports] = parse(code)
  let output = ""
  let last = 0
  for (const entry of imports) {
    if (!entry.specifier) continue
    const next = resolvePath(entry.specifier)
    if (!next || next === entry.specifier) continue
    output += code.slice(last, entry.start) + (entry.type === "dynamic" ? JSON.stringify(next) : next)
    last = entry.end
  }
  return output + code.slice(last)
}
