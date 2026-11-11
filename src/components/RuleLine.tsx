import type { Rule } from '../store/model';

export function RuleLine({ r }: { r: Pick<Rule, 'trigger' | 'text'> }) {
  return (
    <li className="rule">
      {r.trigger && <span className="trigger">{r.trigger}</span>}
      <span className="rule-text">{r.text}</span>
    </li>
  );
}
