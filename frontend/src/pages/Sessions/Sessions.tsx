import Live from '../Live/Live';
import { pageTitleClass } from '../../ui';

export default function Sessions() {
  return (
    <section aria-labelledby="sessions-title">
      <div className="mb-6">
        <h2 id="sessions-title" className={pageTitleClass}>Session Review</h2>
      </div>
      <Live embedded />
    </section>
  );
}
