/* eslint-disable no-cond-assign */

import { cwd, getPackages, PackageJson, requireSafe, spawnAsync } from './utils'
import { resolve } from 'path'
import fs from 'fs-extra'
import json5 from 'json5'
import cac from 'cac'
import ts from 'typescript'

const { args, options } = cac().help().parse()
delete options['--']
const tsArgs = Object.keys(options).map(name => '--' + name)

async function readJson(path: string) {
    const data = await fs.readFile(path, 'utf8')
    return json5.parse(data)
}

interface TsConfig {
    compilerOptions: ts.CompilerOptions
}

const coreLibs = []

const whitelist = [
]

async function prepareBuild(nodes: Node[]) {
    if (!nodes.length) return
    await fs.writeFile(cwd + '/tsconfig.temp.json', JSON.stringify({
        files: [],
        references: nodes.map(node => ({ path: './' + node.path })),
    }, null, 2))
}

async function bundleNodes(nodes: Node[]) {
    for (const node of nodes) {
        await fs.mkdir(resolve(cwd, node.path, 'lib'), { recursive: true })
        console.log('building', node.path)
        const code = await spawnAsync(['yarn', 'dtsc','--outFile',resolve(cwd,node.path,'lib/index.d.ts')], {
            cwd: resolve(cwd, node.path),
        })
        if (code) process.exit(code)
    }
}

interface Node {
    path?: string
    meta?: PackageJson
    prev?: string[]
    next?: Set<string>
    bundle?: boolean
    config?: TsConfig
    visited?: boolean
}

interface Layer {
    bundle: boolean
    nodes: Node[]
}

;(async () => {
    // Step 1: get relevant packages
    const folders = await getPackages(args)

    // Step 2: initialize nodes
    const nodes: Record<string, Node> = {}
    await Promise.all(folders.map(async (path) => {
        const fullPath = resolve(cwd, path)
        const meta: PackageJson = requireSafe(fullPath + '/package.json')
        if (!meta || meta.private) return
        const config: TsConfig = await readJson(fullPath + '/tsconfig.json')
        const bundle = true
        nodes[meta.name] = { path, meta, config, bundle, prev: [], next: new Set() }
    }))

    // Step 3: build dependency graph
    for (const name in nodes) {
        const { meta } = nodes[name]
        const deps = {
            ...meta.dependencies,
            ...meta.devDependencies,
            ...meta.peerDependencies,
        }
        for (const dep in deps) {
            if (whitelist.includes(dep) && meta.devDependencies[dep] || !nodes[dep]) continue
            if (name === 'oitq' && dep.startsWith('@oitq/plugin-')) continue
            nodes[name].prev.push(dep)
            nodes[dep].next.add(name)
        }
        delete nodes[name].meta
    }

    // Step 4: generate bundle workflow
    let bundle = false
    const layers: Layer[] = []
    while (Object.keys(nodes).length) {
        const layer = { bundle, nodes: [] }
        bundle = !bundle
        let flag = true
        while (flag) {
            flag = false
            for (const name of Object.keys(nodes)) {
                const node = nodes[name]
                if (node.bundle === bundle || node.next.size) continue
                flag = true
                delete nodes[name]
                layer.nodes.unshift(node)
                node.prev.forEach(dep => {
                    nodes[dep].next.delete(name)
                })
            }
        }
        if (layers.length && !layer.nodes.length) {
            throw new Error('circular dependency detected')
        }
        layers.unshift(layer)
    }

    // Step 5: generate dts files
    // make sure the number of layers is even
    if (bundle) layers.unshift({ bundle, nodes: [] })
    for (let i = 0; i < layers.length; i += 2) {
        const bundleTargets = layers[i].nodes
        const buildTargets = layers[i + 1].nodes
        await Promise.all([
            prepareBuild(buildTargets),
            bundleNodes(bundleTargets),
        ])
        if (buildTargets.length) {
            const code = await spawnAsync(['tsc', '-b', 'tsconfig.temp.json', ...tsArgs])
            if (code) process.exit(code)
        }
    }
})()
