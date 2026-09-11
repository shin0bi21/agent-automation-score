export const panelClass = `
  overflow-hidden rounded-2xl border border-[#dedbea] bg-white
  shadow-[0_16px_42px_rgba(46,36,82,.08)]
  dark:border-[#373241] dark:bg-[#1b1921]
  dark:shadow-[0_18px_48px_rgba(0,0,0,.28)]
`;

export const quietButtonClass = `
  cursor-pointer rounded-lg border border-[#c8c1df] bg-white px-3 py-[9px]
  text-xs font-bold text-[#573dbf] outline-offset-2 focus-visible:outline-3
  focus-visible:outline-[#6f56d9]/32 dark:border-[#4d455e] dark:bg-[#1b1921]
  dark:text-[#b9a6ff] dark:focus-visible:outline-[#a58cff]/32
`;

export const actionLinkClass = `
  cursor-pointer border-0 border-b border-current bg-transparent p-0 text-[.72rem]
  font-bold text-[#573dbf] outline-offset-2 focus-visible:outline-3
  focus-visible:outline-[#6f56d9]/32 disabled:cursor-not-allowed disabled:opacity-45
  dark:text-[#b9a6ff] dark:focus-visible:outline-[#a58cff]/32
`;

export const eyebrowClass = `
  font-mono text-[.7rem] leading-[1.2] font-bold tracking-[.16em]
  text-[#6f56d9] uppercase dark:text-[#a58cff]
`;

export const pageTitleClass = `
  mt-[.4rem] mb-4 text-[clamp(2.4rem,5vw,4.5rem)] tracking-[-.05em]
  max-[850px]:text-[clamp(2.6rem,12vw,4.5rem)]
`;

export const mutedTextClass = 'text-[#6f6a7d] dark:text-[#aaa3b7]';

export const focusRingClass = `
  outline-offset-2 focus-visible:outline-3 focus-visible:outline-[#6f56d9]/32
  dark:focus-visible:outline-[#a58cff]/32
`;
