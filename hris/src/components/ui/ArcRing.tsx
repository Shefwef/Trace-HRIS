import { motion } from 'framer-motion';

interface Props {
  value: number;
  total: number;
  color: string;
  size?: number;
  strokeWidth?: number;
  centerLabel?: string;
  centerSublabel?: string;
  delay?: number;
}

export function ArcRing({
  value,
  total,
  color,
  size = 120,
  strokeWidth = 8,
  centerLabel,
  centerSublabel = 'left',
  delay = 0,
}: Props) {
  const radius = size / 2 - strokeWidth;
  const circumference = 2 * Math.PI * radius;
  const pct = total > 0 ? Math.max(0, Math.min(1, value / total)) : 0;
  const offset = circumference * (1 - pct);

  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="var(--color-bg-muted)"
        strokeWidth={strokeWidth}
      />
      <motion.circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        initial={{ strokeDashoffset: circumference }}
        animate={{ strokeDashoffset: offset }}
        transition={{
          duration: 0.9,
          ease: [0.34, 1.56, 0.64, 1],
          delay,
        }}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text
        x={size / 2}
        y={size / 2 - 2}
        textAnchor="middle"
        dominantBaseline="middle"
        fontFamily="var(--font-display)"
        fontSize={size * 0.24}
        fontWeight={700}
        fill="var(--color-text-primary)"
      >
        {centerLabel}
      </text>
      <text
        x={size / 2}
        y={size / 2 + size * 0.14}
        textAnchor="middle"
        dominantBaseline="middle"
        fontFamily="var(--font-body)"
        fontSize={size * 0.09}
        fill="var(--color-text-muted)"
      >
        {centerSublabel}
      </text>
    </svg>
  );
}
