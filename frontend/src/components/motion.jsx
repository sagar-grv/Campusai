import React from "react";
import {
  motion,
  useInView,
  useReducedMotion,
  animate,
} from "motion/react";

export const EASE = [0.23, 1, 0.32, 1];

export function FadeUp({
  children,
  delay = 0,
  y = 14,
  once = true,
  className,
  ...props
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once, margin: "0px 0px -40px 0px" }}
      transition={{ duration: 0.5, ease: EASE, delay }}
      {...props}
    >
      {children}
    </motion.div>
  );
}

export const item = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE } },
};

export function Stagger({
  children,
  className,
  delay = 0,
  gap = 0.08,
  once = true,
  animate = false,
  ...props
}) {
  const shared = {
    initial: "hidden",
    variants: {
      hidden: {},
      show: {
        transition: { staggerChildren: gap, delayChildren: delay },
      },
    },
  };
  if (animate) {
    return (
      <motion.div className={className} {...shared} animate="show" {...props}>
        {children}
      </motion.div>
    );
  }
  return (
    <motion.div
      className={className}
      {...shared}
      whileInView="show"
      viewport={{ once, margin: "0px 0px -40px 0px" }}
      {...props}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({ children, className, ...props }) {
  return (
    <motion.div className={className} variants={item} {...props}>
      {children}
    </motion.div>
  );
}

export function CountUp({
  value,
  prefix = "",
  suffix = "",
  decimals = 0,
  duration = 1.1,
  className,
  ...props
}) {
  const ref = React.useRef(null);
  const inView = useInView(ref, { once: true, margin: "0px 0px -40px 0px" });
  const reduced = useReducedMotion();
  const [display, setDisplay] = React.useState(reduced ? fmt(value) : fmt(0));

  function fmt(v) {
    return v.toLocaleString("en-IN", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  }

  React.useEffect(() => {
    if (!inView || reduced) return;
    const controls = animate(0, value, {
      duration,
      ease: EASE,
      onUpdate: (v) => setDisplay(fmt(v)),
    });
    return () => controls.stop();
  }, [inView, value, duration, reduced]);

  if (typeof value !== "number" || Number.isNaN(value)) {
    return (
      <span ref={ref} className={className} {...props}>
        {prefix}
        {value}
        {suffix}
      </span>
    );
  }

  return (
    <span ref={ref} className={`tabular-nums ${className || ""}`} {...props}>
      {prefix}
      {display}
      {suffix}
    </span>
  );
}

export function Marquee({ items, className }) {
  if (!items || items.length === 0) return null;
  const row = items.map((t, i) => (
    <span
      key={i}
      className="mx-6 inline-flex items-center gap-6 font-mono text-xs uppercase tracking-widerX text-white/50"
    >
      {t} <span className="text-signal">·</span>
    </span>
  ));
  return (
    <div className={`marquee overflow-hidden ${className || ""}`} aria-hidden="true">
      <div className="marquee-track flex w-max whitespace-nowrap">
        {row}
        {row}
      </div>
    </div>
  );
}
