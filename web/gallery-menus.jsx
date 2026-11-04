import React, {useSyncExternalStore} from 'react';
import {gallerySettings} from './gallery-settings.mjs';
import {galleryUsesRows} from './gallery/gallery-layout.mjs';
import {ActionIcon,Menu} from '@mantine/core';
import {Check as CheckIcon,Ellipsis as KebabHorizontalIcon,ArrowDownWideNarrow as SortDescIcon} from 'lucide-react';
export function GalleryMenus({overlayRoot}) {
  const settings = useSyncExternalStore(gallerySettings.subscribe, gallerySettings.getSnapshot);
  const update = (id, value) => gallerySettings.update({[id]:value});
  const menuProps = {position:'bottom-start', middlewares:{flip:false,shift:{padding:12}}, width:220, portalProps:{target:overlayRoot}};
  return <>
    <Menu {...menuProps}>
      <Menu.Target><ActionIcon aria-label="Sort"><SortDescIcon size={18}/></ActionIcon></Menu.Target>
      <Menu.Dropdown>{[['name-asc','Name A–Z'],['name-desc','Name Z–A'],['time-desc','Modified: newest'],['time-asc','Modified: oldest'],['taken-desc','Taken: newest'],['taken-asc','Taken: oldest']].map(([value,label])=><Menu.RadioItem key={value} value={value} checked={settings.sort===value} onChange={value=>update('sort',value)} closeMenuOnClick checkIcon={<CheckIcon size={16} strokeWidth={1.75} aria-hidden="true"/>}>{label}</Menu.RadioItem>)}</Menu.Dropdown>
    </Menu>
    <Menu {...menuProps}>
      <Menu.Target><ActionIcon aria-label="Gallery options"><KebabHorizontalIcon size={18}/></ActionIcon></Menu.Target>
      <Menu.Dropdown>
        <Menu.CheckboxItem disabled={settings.width<=700} checked={galleryUsesRows(settings.width,settings.rows)} onChange={value=>update('rows',value)} closeMenuOnClick checkIcon={<CheckIcon size={16} strokeWidth={1.75} aria-hidden="true"/>}>Adjusted height</Menu.CheckboxItem>
        {[['recursive','Include subdirectories'],['autoplay','Autoplay videos'],['hidden','Show hidden files']].map(([id,label])=><Menu.CheckboxItem key={id} checked={settings[id]} onChange={value=>update(id,value)} closeMenuOnClick checkIcon={<CheckIcon size={16} strokeWidth={1.75} aria-hidden="true"/>}>{label}</Menu.CheckboxItem>)}
      </Menu.Dropdown>
    </Menu>
  </>;
}
