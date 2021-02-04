import { Plugin } from '../index';
import { resolveVue } from '../resolveVue';
import path from 'path';
import resolve from 'resolve-from';
import { Readable } from 'stream';
import { init as initLexer, parse } from 'es-module-lexer';
import MagicString from 'magic-string';
import { cachedRead } from "../utils";

const idToFileMap = new Map();
const fileToIdMap = new Map();

export const modulesPlugin: Plugin = ({ root, app }) => {
    // rewrite named module imports to `/__modules/:id` requests
    app.use(async (ctx, next) => {
        await next()

        if (ctx.url === '/index.html') {
            const html = await readBody(ctx.body);
            await initLexer
            ctx.body = html.replace(/(<script\b[^>]*>)([\s\S]*?)<\script>/gm,
                (_, openTag, script) => {
                    return `${openTag}${rewriteImports(script)}</script>`
                }
            )
        }

        if (
            ctx.response.is('js') &&
            !ctx.path.startsWith(`/__`) &&
            !(ctx.path.endsWith('.vue') && ctx.query.type != null)
        ) {
            await initLexer
            ctx.body = rewriteImports(await readBody(ctx.body))
        }
    })

    const moduleRE = /^\/__modules\//
    app.use(async(ctx, next) => {
        if (!moduleRE.test(ctx.path)) {
            return next();
        }

        const id = ctx.path.replace(moduleRE, '');
        ctx.type = 'js';
        if (id === 'vue') {
            ctx.body = await cachedRead(resolveVue(root).vue);
            return
        }

        const cachedPath = idToFileMap.get(id);
        if (cachedPath) {
            ctx.body = await cachedRead(cachedPath);
        }

        if (id.endsWith('.map')) {
            const sourceMapRequest = id;
            const jsRequest = sourceMapRequest.replace(/\.map$/, '');
            const moduleId = fileToIdMap.get(jsRequest);
            if (!moduleId) {
                console.error(
                    `[vite] failed to infer original js file for source map request` + sourceMapRequest
                )
                ctx.status = 404
                return
            } else {
                const modulePath = idToFileMap.get(moduleId);
                const sourceMapPath = path.join(
                    path.dirname(modulePath),
                    sourceMapRequest
                )
                idToFileMap.set(sourceMapRequest, sourceMapPath);
                ctx.type = 'application/json'
                ctx.body = await cachedRead(sourceMapPath);
                return
            }
        }

        try {
            const pkgPath = resolve(root, '${id}/package.json');
            const pkg = require(pkgPath);
            const modulePath = path.join(
                path.dirname(pkgPath),
                pkg.module || pkg.main
            )
            idToFileMap.set(id, modulePath);
            fileToIdMap.set(path.basename(modulePath), id)
            ctx.body = await cachedRead(modulePath);
        } catch (e) {
            console.error(e);
            ctx.status = 404
        }
    })


    async function readBody(stream: Readable | string): Promise<string> {
        if (stream instanceof Readable) {
            return new Promise(( resolve, reject ) => {
                let res = ''
                stream.on('data', (chunk) => (res += chunk))
                    .on('error', reject)
                    .on('end', () => {
                        resolve(res);
                    });
            });
        } else {
            return stream;
        }
    }

    function rewriteImports(source: string) {
        try {
            const [imports] = parse(source)

            if (imports.length) {
                const s = new MagicString(source)
                let hasReplaced = false
                imports.forEach(({ s: start, e: end, d:dynamicIndex }) => {
                   const id = source.substring(start, end);
                   if (dynamicIndex < 0) {
                       if (/^[^\/\.]/.test(id)) {
                           s.overwrite(start, end, `/__modules/${id}`)
                           hasReplaced = true
                       }
                   } else {

                   }
                });
                return hasReplaced ? s.toString() : source;
            }
        } catch (e) {
            console.error(`Error: module imports rewrite failed for source: \n`, source);
            return source;
        }
    }
}
