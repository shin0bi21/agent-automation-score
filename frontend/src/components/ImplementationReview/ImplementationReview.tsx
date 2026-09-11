import type { ImplementationReviewSection } from '../../types';

interface ImplementationReviewProps {
  sections: ImplementationReviewSection[];
}

interface EvidenceProps {
  title: string;
  files: string[];
  empty: string;
}

export default function ImplementationReview({ sections }: ImplementationReviewProps) {
  return (
    <div className="mt-5 border-t border-[#dedbea] pt-5 dark:border-[#373241]">
      <h3 className="mb-[18px] text-base">Implementation review</h3>
      {sections.map((section, sectionIndex) => (
        <section key={section.id} className={sectionIndex ? 'mt-[22px]' : undefined}>
          <h4 className="mb-2 font-mono text-[.65rem] leading-[1.2] tracking-[.12em] text-[#6f6a7d] uppercase dark:text-[#aaa3b7]">
            {section.label}
          </h4>
          {section.items.map(item => (
            <details key={item.id} className="border-t border-[#dedbea] dark:border-[#373241]">
              <summary className="flex cursor-pointer items-center justify-between gap-4 py-[11px]">
                <span className="text-[.82rem]">{item.label}</span>
                <strong
                  className={`font-mono text-[.62rem] leading-[1.2] uppercase ${
                    item.implemented
                      ? 'text-[#6f56d9] dark:text-[#a58cff]'
                      : 'text-[#bd3d52] dark:text-[#ff8796]'
                  }`}
                >
                  {item.implemented ? 'Implemented' : 'Missing'}
                </strong>
              </summary>
              <div className="grid grid-cols-2 gap-[14px] pt-0.5 pb-[14px] max-[600px]:grid-cols-1">
                <Evidence
                  title="Agent output"
                  files={item.candidateFiles}
                  empty="No matching files created."
                />
                <Evidence
                  title="Reference implementation"
                  files={item.referenceFiles}
                  empty="No matching reference files."
                />
              </div>
            </details>
          ))}
        </section>
      ))}
    </div>
  );
}

function Evidence({ title, files, empty }: EvidenceProps) {
  const bodyClass = 'm-0 font-mono text-[.62rem] leading-[1.45] text-[#6f6a7d] dark:text-[#aaa3b7]';

  return (
    <div>
      <h5 className="mb-[7px] font-mono text-[.58rem] leading-[1.2] tracking-[.08em] text-[#6f6a7d] uppercase dark:text-[#aaa3b7]">
        {title}
      </h5>
      {files.length ? (
        <ul className={`${bodyClass} list-none p-0`}>
          {files.map((file, index) => (
            <li key={file} className={`[overflow-wrap:anywhere] ${index ? 'mt-1' : ''}`}>
              {file}
            </li>
          ))}
        </ul>
      ) : (
        <p className={bodyClass}>{empty}</p>
      )}
    </div>
  );
}
