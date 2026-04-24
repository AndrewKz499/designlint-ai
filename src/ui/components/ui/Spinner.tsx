import { colors } from '../../tokens';

type Props = {
  size?: number;    // диаметр в px, по умолчанию 16
  color?: string;   // цвет кольца, по умолчанию textMuted
};

export function Spinner({ size = 16, color }: Props) {
  const ringColor = color || colors.contentMuted;
  const borderWidth = Math.max(2, Math.round(size / 8));

  const style: React.CSSProperties = {
    display: 'inline-block',
    width: size,
    height: size,
    border: `${borderWidth}px solid ${ringColor}33`,
    borderTopColor: ringColor,
    borderRadius: '50%',
    animation: 'designlint-spin 0.8s linear infinite',
    verticalAlign: 'middle',
  };

  return (
    <>
      <style>{`
        @keyframes designlint-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
      <span style={style} aria-label="Загрузка" />
    </>
  );
}
