import { Plugin } from '../index';
import path from 'path';
import WebSocket from 'ws';
import hash_sum from 'hash-sum';
import chokidar from 'chokidar';
import { SFCBlock } from '@vue/compiler-sfc';
import { parseSFC } from "./vue";
import { cachedRead } from "../utils";
import isExtensible = Reflect.isExtensible;

const hmrClientPath = path.resolve(__dirname, '../../client/client.js');

interface HMRPayload {
    type: string,
    path?: string,
    id?: string,
    index?: number,
}

export const hmrPlugin: Plugin = ({ root, app, server }) => {
    app.use(async(ctx, next) => {
        if (ctx.path !== '/__hmrClient') {
            return next()
        }
        ctx.type = 'js';
        ctx.body = await cachedRead(hmrClientPath);
    })

    const wss = new WebSocket.Server({ server })
    const sockets = new Set<WebSocket>()

    wss.on('connection', (socket) => {
       sockets.add(socket);
       socket.send(JSON.stringify({ type: 'connected' }));
       socket.on('close', () => {
           sockets.delete(socket);
       })
    });

    wss.on('error', (e: Error & { code: string }) => {
        if (e.code !== 'EADDRINUSE') {
            console.error(e);
        }
    });

    const notify = (payload: HMRPayload) => {
        sockets.forEach((s) => s.send(JSON.stringify(payload)));
    }

    const watcher = chokidar.watch(root, {
        ignored: [/node_modules/]
    });

    watcher.on('change', async(file) => {
        const resourcePath = '/' + path.relative(root, file);
        const send = (payload: HMRPayload) => {
            console.log(`[hmr] ${JSON.stringify(payload)}`);
            notify(payload);
        }

        if (file.endsWith('.vue')) {
            const [descriptor, prevDescriptor] = await parseSFC(root, file);
            if (!descriptor || !prevDescriptor) {
                return
            }

            if (!isEqual(descriptor.script, prevDescriptor.script)) {
                send({
                    type:'reload',
                    path: resourcePath,
                });
                return
            }
            if (!isEqual(descriptor.template, prevDescriptor.template)) {
                send({
                    type: 'rerender',
                    path: resourcePath,
                });
            }
        }
    })
}
