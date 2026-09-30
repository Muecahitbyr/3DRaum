import type { ButtonHTMLAttributes } from 'react';
import styles from './Button.module.css';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'primary' | 'danger' | 'icon';
  block?: boolean;
}

export function Button({ variant = 'default', block = false, className, type = 'button', ...rest }: ButtonProps) {
  const classes = [
    styles.button,
    variant !== 'default' && styles[variant],
    block && styles.block,
    className,
  ]
    .filter(Boolean)
    .join(' ');
  return <button type={type} className={classes} {...rest} />;
}
