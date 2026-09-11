import type { RunActivityNode } from '../../types';

interface ActivityNodeProps {
  node: RunActivityNode;
  root?: boolean;
}

interface RunActivityTreeProps {
  nodes: RunActivityNode[];
}

const treeClass = `
  min-h-0 flex-1 overflow-y-scroll overscroll-contain pr-2 [scrollbar-gutter:stable]
  focus-visible:rounded-[5px] focus-visible:outline-2 focus-visible:outline-offset-3
  focus-visible:outline-[#6f56d9] dark:focus-visible:outline-[#a58cff]
`;

function markerClass(status: RunActivityNode['status']) {
  const base = 'mt-1 size-[9px] rounded-full border-2 bg-white dark:bg-[#1b1921]';
  if (status === 'running') {
    return `${base} border-[#6f56d9] shadow-[0_0_0_3px_rgb(111_86_217_/_0.16)] dark:border-[#a58cff] dark:shadow-[0_0_0_3px_rgb(165_140_255_/_0.16)]`;
  }
  if (status === 'completed') {
    return `${base} border-[#6f56d9] bg-[#6f56d9] dark:border-[#a58cff] dark:bg-[#a58cff]`;
  }
  if (status === 'failed') {
    return `${base} border-[#bd3d52] bg-[#bd3d52] dark:border-[#ff8796] dark:bg-[#ff8796]`;
  }
  return `${base} border-[#c8c1df] dark:border-[#4d455e]`;
}

function ActivityNode({ node, root = false }: ActivityNodeProps) {
  return (
    <li className="relative grid grid-cols-[12px_1fr] gap-[9px] py-[6px] text-[#6f6a7d] dark:text-[#aaa3b7]">
      <span className={markerClass(node.status)} aria-hidden="true" />
      <div>
        <strong
          className={`block leading-[1.4] text-[#1d1929] dark:text-[#f6f2fb] ${
            root ? 'text-[.8rem]' : 'text-[.74rem]'
          }`}
        >
          {node.label}
        </strong>
        {node.detail && (
          <p className="mt-[3px] [overflow-wrap:anywhere] font-mono text-[.66rem] leading-[1.5] whitespace-pre-wrap text-[#6f6a7d] dark:text-[#aaa3b7]">
            {node.detail}
          </p>
        )}
      </div>
    </li>
  );
}

export default function RunActivityTree({ nodes }: RunActivityTreeProps) {
  const roots = nodes.filter(node => node.parentId === null);

  return (
    <div
      className={treeClass}
      aria-label="Live agent activity"
      role="region"
      tabIndex={0}
    >
      {roots.map(root => (
        <section key={root.id}>
          <ActivityNode node={root} root />
          <ol className="relative mt-[6px] ml-[7px] list-none border-l border-[#c8c1df] pl-[22px] dark:border-[#4d455e]">
            {nodes
              .filter(node => node.parentId === root.id)
              .map(node => (
                <ActivityNode key={node.id} node={node} />
              ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
