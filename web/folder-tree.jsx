import React, {useMemo,useState} from 'react';
import {Tree,useTree} from '@mantine/core';
import {ChevronDown,Folder,FolderOpen,Image as FileMediaIcon} from 'lucide-react';
export function FolderTree({nodes,current,expanded,toggle,navigate,openFile}) {
  const [limits,setLimits] = useState({});
  const tree = useTree({
    expandedState:Object.fromEntries([...expanded].map(path=>[path,true])),
    selectedState:[current],
    onNodeExpand:path=>toggle(path,true),
    onNodeCollapse:path=>toggle(path,false),
  });
  const data = useMemo(() => {
  const convert = (items,parent='') => {
    const selectedIndex=items.findIndex(n=>n.path===current || (n.kind===undefined && current?.startsWith(n.path+'/')));
    const count=Math.max(limits[parent]||100,selectedIndex+1);
    const result=items.slice(0,count).map(n=>({value:n.path,label:n.name,nodeProps:{entry:n},hasChildren:n.kind===undefined,children:n.children?convert(n.children,n.path):undefined}));
    if(count<items.length) result.push({value:'more:'+parent,label:`Show more… (${items.length-count} remaining)`,nodeProps:{more:()=>setLimits({...limits,[parent]:count+100})}});
    return result;
  };
  return convert(nodes);
  },[nodes,current,limits]);
  const activate=node=>{const n=node.nodeProps.entry; if(node.nodeProps.more) node.nodeProps.more(); else n.kind===undefined?navigate(n.path):openFile(n);};
  return <Tree data={data} tree={tree} expandOnClick={false} expandOnSpace={false} levelOffset={18} aria-label="Files and folders"
    onKeyDownCapture={event=>{
      if(event.key!=='Enter' && event.key!==' ') return;
      const row=event.target.closest('[role="treeitem"]');
      if(!row) return;
      event.preventDefault();event.stopPropagation();
      row.querySelector('.file-tree-row')?.click();
    }}
    classNames={{label:'file-tree-row'}} renderNode={({node,expanded:open,elementProps})=><div {...elementProps}
      onClick={event=>{elementProps.onClick(event);activate(node);}}>
      {node.nodeProps.entry?.kind===undefined && !node.nodeProps.more ? <span className="tree-disclosure" onClick={event=>{event.stopPropagation();tree.toggleExpanded(node.value);}} aria-hidden="true"><ChevronDown size={14} style={{transform:open?undefined:'rotate(-90deg)'}}/></span>:<span className="tree-disclosure"/>}
      {node.nodeProps.more?null:node.nodeProps.entry.kind===undefined?(open?<FolderOpen size={18}/>:<Folder size={18}/>):<FileMediaIcon size={18}/>}
      <span className="file-tree-link">{node.label}</span>
    </div>}/>;
}
