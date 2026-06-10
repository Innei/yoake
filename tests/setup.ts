import 'fake-indexeddb/auto';

import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach } from 'vitest';

import * as contextMenu from '~/components/ui/context-menu';

if (!('VideoFrame' in globalThis)) {
  class VideoFrameStub {
    constructor(
      public data: AllowSharedBufferSource,
      public init: VideoFrameBufferInit,
    ) {}
    close() {}
  }
  Object.assign(globalThis, { VideoFrame: VideoFrameStub });
}

const host = document.createElement('div');
host.id = '__ctx_menu_host__';
document.body.appendChild(host);
createRoot(host).render(createElement(contextMenu.ContextMenuHost));

afterEach(() => {
  contextMenu.closeContextMenu();
});
