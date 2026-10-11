// Keep enlarged and translated labels inside their controls. The upstream
// primitive stays replaceable; callers can still override these defaults.
import type { ComponentProps } from 'react';
import { cn } from '@kit/ui/utils';
import {
  Button as PrimitiveButton,
  buttonVariants as primitiveVariants,
} from '../shadcn/button';

const defaults = 'h-auto min-h-[44px] max-w-full whitespace-normal';

export function Button({
  className,
  ...props
}: ComponentProps<typeof PrimitiveButton>) {
  return <PrimitiveButton className={cn(defaults, className)} {...props} />;
}

export function buttonVariants(
  props: Parameters<typeof primitiveVariants>[0] = {},
) {
  const { class: classValue, className, ...variants } = props;
  return primitiveVariants({
    ...variants,
    className: cn(defaults, classValue, className),
  });
}
