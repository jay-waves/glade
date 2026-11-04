import React from 'react';
import {createRoot} from 'react-dom/client';
import {MantineProvider} from '@mantine/core';
import {FolderTree} from './folder-tree';
import {theme} from './mantine-theme';

let treeRoot;
export function renderFolders(nodes, current, expanded, toggle, navigate, openFile) {
  treeRoot ??= createRoot(document.getElementById('tree'));
  treeRoot.render(
    <MantineProvider theme={theme} defaultColorScheme="auto">
      <FolderTree {...{nodes, current, expanded, toggle, navigate, openFile}}/>
    </MantineProvider>,
  );
}
