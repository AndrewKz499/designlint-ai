import { colors } from '../../tokens';
import { UI } from '../../../shared/strings';

type Props = {
  size?: number;   // диаметр в px, default 20
};

export function Spinner({ size = 20 }: Props) {
  const borderWidth = Math.max(2, Math.round(size / 8));

  const style: React.CSSProperties = {
    display: 'inline-block',
    width: size,
    height: size,
    borderRadius: 9999,
    borderWidth: borderWidth,
    borderStyle: 'solid',
    borderColor: colors.bgSecondary,
    borderTopColor: colors.accent,
    animation: 'designlint-spin 0.8s linear infinite',
    verticalAlign: 'middle',
    boxSizing: 'border-box',
  };

  return (
    <>
      <style>{`
        @keyframes designlint-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
      <span style={style} role="status" aria-label={UI.spinnerLoading} />
    </>
  );
}
