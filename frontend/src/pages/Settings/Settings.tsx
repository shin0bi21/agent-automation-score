import { useState } from 'react';
import { api } from '../../api';
import {
  eyebrowClass,
  mutedTextClass,
  pageTitleClass,
  panelClass,
} from '../../ui';

export type Theme = 'light' | 'dark';

interface SettingsProps {
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
}

const themes: Theme[] = ['light', 'dark'];
const themeOptionClass = `
  grid cursor-pointer gap-[7px] rounded-xl border-2 border-[#dedbea]
  bg-[#fbfaff] p-4 text-left text-[#1d1929] outline-offset-2
  focus-visible:outline-3 focus-visible:outline-[#6f56d9]/32
  aria-checked:border-[#6f56d9]
  aria-checked:shadow-[0_0_0_3px_rgb(111_86_217_/_0.16)]
  dark:border-[#373241] dark:bg-[#211e2a] dark:text-[#f6f2fb]
  dark:focus-visible:outline-[#a58cff]/32 dark:aria-checked:border-[#a58cff]
  dark:aria-checked:shadow-[0_0_0_3px_rgb(165_140_255_/_0.16)]
`;

export default function Settings({ theme, onThemeChange }: SettingsProps) {
  const [checkingSessions, setCheckingSessions] = useState(false);
  const [sessionMessage, setSessionMessage] = useState('');

  async function checkSessionConnection() {
    setCheckingSessions(true);
    setSessionMessage('Connecting to Codex App Server…');
    try {
      const result = await api.probeSessionSource();
      const history = result.storedThreadAvailable
        ? 'Stored sessions are available.'
        : 'No stored session was found.';
      setSessionMessage(`Connected to Codex App Server. ${history}`);
    } catch (error) {
      setSessionMessage((error as Error).message);
    } finally {
      setCheckingSessions(false);
    }
  }

  return (
    <section className="mx-auto max-w-[1000px]" aria-labelledby="settings-title">
      <div className="mb-8 flex items-end justify-between gap-8 max-[850px]:flex-col max-[850px]:items-start">
        <div>
          <p className={eyebrowClass}>PREFERENCES</p>
          <h2 id="settings-title" className={pageTitleClass}>
            Settings
          </h2>
          <p className={mutedTextClass}>
            Choose how Agent Insights looks on this machine.
          </p>
        </div>
      </div>
      <section className={`${panelClass} p-7 max-[560px]:px-[18px]`}>
        <h3 className="mb-5">Appearance</h3>
        <div
          className="grid grid-cols-2 gap-4 max-[560px]:grid-cols-1"
          role="radiogroup"
          aria-label="Color theme"
        >
          {themes.map(option => (
            <button
              key={option}
              className={themeOptionClass}
              role="radio"
              aria-checked={theme === option}
              onClick={() => onThemeChange(option)}
              type="button"
            >
              <span
                className={`mb-1 grid h-[76px] grid-cols-[28%_1fr] grid-rows-[18px_32px] gap-[6px] rounded-lg border p-2 ${
                  option === 'dark'
                    ? 'border-[#40394c] bg-[#151319]'
                    : 'border-[#d8d3e5] bg-[#f6f4fb]'
                }`}
                aria-hidden="true"
              >
                <i
                  className={`row-span-2 block rounded-sm ${
                    option === 'dark' ? 'bg-[#a58cff]' : 'bg-[#6f56d9]'
                  }`}
                />
                <i
                  className={`block rounded-sm ${
                    option === 'dark' ? 'bg-[#3b3155]' : 'bg-[#e6e0fa]'
                  }`}
                />
                <i
                  className={`block rounded-sm ${
                    option === 'dark' ? 'bg-[#27222f]' : 'bg-white'
                  }`}
                />
              </span>
              <strong className="text-sm">{option === 'light' ? 'Light' : 'Dark'}</strong>
              <small className={mutedTextClass}>
                {option === 'light'
                  ? 'White with purple accents'
                  : 'Deep charcoal with purple accents'}
              </small>
            </button>
          ))}
        </div>
      </section>
      <section className={`${panelClass} mt-6 p-7 max-[560px]:px-[18px]`}>
        <div className="flex items-start justify-between gap-6 max-[560px]:flex-col">
          <div>
            <h3>Session source</h3>
            <p className={`mt-2 ${mutedTextClass}`}>
              Verify that this machine can read Codex session metadata. This check does not start an agent turn or consume model tokens.
            </p>
          </div>
          <button
            className="shrink-0 rounded-lg bg-[#6f56d9] px-4 py-3 text-sm font-semibold text-white disabled:cursor-wait disabled:opacity-60 dark:bg-[#a58cff] dark:text-[#17131f]"
            disabled={checkingSessions}
            onClick={() => void checkSessionConnection()}
            type="button"
          >
            {checkingSessions ? 'Checking…' : 'Check Connection'}
          </button>
        </div>
        {sessionMessage && (
          <p className="mt-4 text-sm" role="status">
            {sessionMessage}
          </p>
        )}
      </section>
    </section>
  );
}
