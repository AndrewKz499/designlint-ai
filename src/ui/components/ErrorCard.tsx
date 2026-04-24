import type { ReactNode } from 'react';
import { Button } from './ui/Button';
import { colors, typography, spacing } from '../tokens';

type Props = {
  icon?: ReactNode;         // Эмодзи или SVG-иконка, по умолчанию нет
  title: string;            // Крупный заголовок
  description: string;      // Описание ситуации + что делать
  actionLabel: string;      // Текст CTA
  onAction: () => void;     // Обработчик клика
};

export function ErrorCard({ icon, title, description, actionLabel, onAction }: Props) {
  return (
    <div style={styles.root}>
      {icon && <div style={styles.icon}>{icon}</div>}
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
    alignItems: 'flex-start',
    gap: spacing.s300,
    padding: `${spacing.s400}px 0`,
  } as React.CSSProperties,
  icon: {
    fontSize: '32px',
    lineHeight: 1,
  } as React.CSSProperties,
  title: {
    fontFamily: typography.h3.fontFamily,
    fontSize: typography.h3.fontSize,
    fontWeight: typography.h3.fontWeight,
    color: colors.content,
  } as React.CSSProperties,
  description: {
    fontSize: typography.body.fontSize,
    color: colors.contentMuted,
    lineHeight: 1.4,
  } as React.CSSProperties,
};
