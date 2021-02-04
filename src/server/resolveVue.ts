import path from 'path'
import resolve from 'resolve-from'
import sfcCompiler from '@vue/compiler-sfc'

interface ResolveVuePaths {
    vue: string
    compiler: string
}

let resolved: ResolveVuePaths | undefined = undefined;

export function resolveVue(root: string): ResolveVuePaths {
    if (resolved) {
        return resolved
    }

    let vuePath: string;
    let compilerPath: string;
    try {
        // see if user has local vue installation
        const userVuePkg = resolve(root, 'vue/package.json');
        vuePath = path.join(
            path.dirname(userVuePkg),
            '/dist/vue.runtime.esm-browser.js'
        );

        try {
            const compilerPkgPath = resolve(root, '@vue/compiler-sfc/package.json');
            const compilerPkg = require(compilerPkgPath);
            if (compilerPkg.version != require(userVuePkg).version) {
                throw new Error()
            }
            compilerPath = path.join(path.dirname(compilerPkgPath), compilerPkg.main)
        } catch(e) {
            console.error(
                `[vite] Error: a local installation of \`vue\` is detected out` + `no matching \`@vue/compiler-sfc\``
                + `is found. Make sure to install both and use the same version.`
            );
            compilerPath = require.resolve(`@vue/compiler-sfc`);
        }
    } catch(e) {
        vuePath = require.resolve('vue/dist/vue.runtime.esm-browser.js');
        compilerPath = require.resolve('@vue/compiler-sfc')
    }

    return (resolved = {
        vue: vuePath,
        compiler: compilerPath
    })
}

export function resolveCompiler(cwd: string): typeof sfcCompiler {
    return require(resolveVue(cwd).compiler)
}
