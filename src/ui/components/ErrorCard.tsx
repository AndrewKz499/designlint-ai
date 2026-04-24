import { Button } from './ui/Button';
import { colors, typography, spacing, radii } from '../tokens';

type Props = {
  title: string;            // Крупный заголовок
  description: string;      // Описание ситуации + что делать
  actionLabel: string;      // Текст CTA
  onAction: () => void;     // Обработчик клика
};

export function ErrorCard({ title, description, actionLabel, onAction }: Props) {
  return (
    <div style={styles.root}>
      <div style={styles.title}>{title}</div>
      <div style={styles.description}>{description}</div>
      <Button onClick={onAction}>{actionLabel}</Button>
    </div>
  );
}

const styles = {
  root: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'flex-start' as const,
    gap: spacing.s300,
    padding: spacing.s400,
    background: colors.errorFill,
    border: '1px solid ' + colors.errorBorder,
    borderRadius: radii.r200,
  } as React.CSSProperties,
  title: {
    fontFamily: typography.h3.fontFamily,
    fontSize: typography.h3.fontSize,
    fontWeight: typography.h3.fontWeight,
    lineHeight: typography.h3.lineHeight,
    color: colors.content,
    margin: 0,
  } as React.CSSProperties,
  description: {
    fontFamily: typography.body.fontFamily,
    fontSize: typography.body.fontSize,
    fontWeight: typography.body.fontWeight,
    lineHeight: typography.body.lineHeight,
    color: colors.content,
    margin: 0,
  } as React.CSSProperties,
};
