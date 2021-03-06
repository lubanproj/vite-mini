// This file runs in the browser
import { HMRRuntime } from 'vue';

console.log(`[vite] connecting...`);

declare var __VUE_HMR_RUNTIME__: HMRRuntime;

const socket = new WebSocket(`ws://${location.host}`);

// listen for messages
socket.addEventListener('message', ({ data }) => {
    const { type, path, id, index } = JSON.parse(data);
    switch (type) {
        case 'connected':
            console.log(`[vite] connected.`);
            break;
        case 'reload':
            import(`${path}?t=${Data.now()}`).then((m) => {
                __VUE_HMR_RUNTIME__.rerender(path, m.render);
            });
            break;
        case 'style-update':
            updateStyle(id, `${path}?type=style&index=${index}&t=${Date.now()}`);
            break;
        case 'style-remove':
            const link = document.getElementById(`vite-css-${id}`)
            if (link) {
                document.head.removeChild(link);
            }
            break;
        case 'full-reload':
            location.reload();
    }
});

// ping server
socket.addEventListener(`close`, () => {
    console.log(`[vite] server connection lost. polling for restart...`);
    setInterval(() => {
        new WebSocket(`ws://${location.host}`).addEventListener(`open`, ()=> {
            location.reload();
        })
    }, 1000);
})

export function updateStyle(id: string, url: string) {
    const linkId = `vite-css-${id}`
    let link = document.getElementById(linkId);
    if (!link) {
        link = document.createElement('link');
        link.id = linkId
        link.setAttribute('rel', 'stylesheet')
        link.setAttribute('type','text/css')
        document.head.appendChild(link)
    }
    link.setAttribute('href', url)
}
