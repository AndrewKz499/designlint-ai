interface Props {
  /** Оценка качества от 0 до 100 */
  score: number;
}

/** Возвращает цвет дуги прогресса по значению score */
function progressColor(score: number): string {
  if (score >= 80) return '#22C55E';
  if (score >= 50) return '#F59E0B';
  return '#EF4444';
}

/**
 * Круговой индикатор Health Score на SVG.
 * Отображает оценку соответствия файла дизайн-системе (0–100).
 */
export function HealthScore({ score }: Props) {
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - score / 100);
  const color = progressColor(score);

  return (
    <svg
      width={120}
      height={120}
      viewBox="0 0 120 120"
      style={{ display: 'block' }}
    >
      {/* Фоновый круг */}
      <circle
        cx={60}
        cy={60}
        r={radius}
        fill="none"
        stroke="#E5E7EB"
        strokeWidth={8}
      />

      {/* Прогресс-дуга — начинается сверху (rotate -90deg) */}
      <circle
        cx={60}
        cy={60}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={8}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        transform="rotate(-90 60 60)"
      />

      {/* Значение score */}
      <text
        x={60}
        y={55}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={24}
        fontWeight="bold"
        fontFamily="Inter, sans-serif"
        fill="#1a1a1a"
      >
        {score}
      </text>

      {/* Подпись "/100" */}
      <text
        x={60}
        y={74}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={12}
        fontFamily="Inter, sans-serif"
        fill="#8E8E93"
      >
        /100
      </text>
    </svg>
  );
}
