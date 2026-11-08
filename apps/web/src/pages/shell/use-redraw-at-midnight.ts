import { useEffect, useState } from "react";

/**
 * The current time, renewed at each local midnight, for labels that read today's date ("Yesterday").
 * Pass it to the formatter: memoized output only redraws when an input it reads changes.
 */
export function useRedrawAtMidnight() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let timer: number | undefined;
    const schedule = () => {
      const midnight = new Date();
      midnight.setHours(24, 0, 0, 0);
      timer = window.setTimeout(() => {
        setNow(new Date());
        schedule();
      }, midnight.getTime() - Date.now());
    };
    schedule();
    return () => window.clearTimeout(timer);
  }, []);
  return now;
}
