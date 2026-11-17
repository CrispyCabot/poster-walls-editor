import { useState } from 'react';
import { analyticsBuiltIn, analyticsOptedOut, setAnalyticsOptOut } from '../analytics.js';

export function UsageStats() {
  const [sharing, setSharing] = useState(() => !analyticsOptedOut());

  if (!analyticsBuiltIn) return null;

  return (
    <section className="usagestats">
      <label>
        <input
          type="checkbox"
          checked={sharing}
          onChange={(e) => {
            setSharing(e.target.checked);
            setAnalyticsOptOut(!e.target.checked);
          }}
        />
        Share anonymous usage stats from this browser
      </label>
      <p className="muted">
        Google Analytics counts which pages get opened and actions like adding a wall or printing
        dimensions. Never names, emails, project details or images.
      </p>
    </section>
  );
}
