import React, { useState } from 'react';
import { colors, typography, spacing, radii } from '../../tokens';

interface InputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: 'text' | 'password';
  disabled?: boolean;
  autoFocus?: boolean;
}

const base: React.CSSProperties = {
  width: '100%',
  padding: spacing.s300,
  fontFamily: typography.body.fontFamily,
  fontSize: typography.body.fontSize,
  fontWeight: typography.body.fontWeight,
  lineHeight: typography.body.lineHeight,
  color: colors.content,
  background: colors.bgDefault,
  border: '1px solid ' + colors.border,
  borderRadius: radii.r200,
  boxSizing: 'border-box',
  outline: 'none',
  transition: 'border-color 0.15s ease',
};

const focusedStyle: React.CSSProperties = {
  borderColor: colors.content,
};

const disabledStyle: React.CSSProperties = {
  background: colors.bgSecondary,
  color: colors.contentMuted,
  cursor: 'not-allowed',
};

const placeholderCSS = `.designlint-input::placeholder { color: ${colors.contentMuted}; }`;

export function Input({
  value,
  onChange,
  placeholder,
  type = 'text',
  disabled = false,
  autoFocus,
}: InputProps): React.ReactElement {
  const [isFocused, setIsFocused] = useState(false);

  const style: React.CSSProperties = {
    ...base,
    ...(isFocused && !disabled ? focusedStyle : {}),
    ...(disabled ? disabledStyle : {}),
  };

  return (
    <>
      <style>{placeholderCSS}</style>
      <input
        className="designlint-input"
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        autoFocus={autoFocus}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        style={style}
      />
    </>
  );
}

export default Input;
