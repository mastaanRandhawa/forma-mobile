import { useEffect, useRef, useState } from "react";
import { motion } from "@/lib/motion";
import { Num } from "./text";
import type { ComponentProps } from "react";

/**
 * Animates the numeric part of a value ("78", "1.4k", "20%") from its previous
 * number to the new one with an ease-out — the website's metric count-up.
 * Non-numeric values ("—") render as-is.
 */
export function CountUp({ value, duration = 700, ...rest }: { value: string; duration?: number } & Omit<ComponentProps<typeof Num>, "children">) {
  const m = value.match(/^(-?[\d,]*\.?\d+)(.*)$/);
  const target = m ? parseFloat(m[1].replace(/,/g, "")) : null;
  const decimals = m?.[1].includes(".") ? m[1].split(".")[1].length : 0;
  const suffix = m?.[2] ?? "";
  const [shown, setShown] = useState(target ?? 0);
  const from = useRef(0);

  useEffect(() => {
    if (target == null) return;
    if (motion.reduced) {
      setShown(target);
      from.current = target;
      return;
    }
    const start = from.current;
    const t0 = Date.now();
    let raf = 0;
    const tick = () => {
      const p = Math.min(1, (Date.now() - t0) / duration);
      const e = 1 - (1 - p) ** 3;
      setShown(start + (target - start) * e);
      if (p < 1) raf = requestAnimationFrame(tick);
      else from.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);

  if (target == null) return <Num {...rest}>{value}</Num>;
  return <Num {...rest}>{`${shown.toFixed(decimals)}${suffix}`}</Num>;
}
