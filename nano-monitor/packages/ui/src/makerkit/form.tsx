'use client';

// Composes child-based controls, translates errors and associates only mounted
// descriptions/messages with inputs. Optional descriptions must not create
// dangling ARIA references.
// Lives outside `shadcn/form.tsx` so that file stays upstream-equivalent
// and can be replaced by the shadcn CLI (e.g. when switching themes).

import * as React from 'react';
import { useRender } from '@base-ui/react/use-render';

import { cn } from '@kit/ui/utils';
import {
  Form,
  FormControl as PrimitiveFormControl,
  FormDescription as PrimitiveFormDescription,
  FormField,
  FormItem as PrimitiveFormItem,
  FormLabel as PrimitiveFormLabel,
  useFormField,
} from '../shadcn/form';
import { Trans } from './trans';

const DescriptionContext = React.createContext<{
  ids: string[];
  register: (id: string) => () => void;
} | null>(null);

function FormItem(props: React.ComponentProps<typeof PrimitiveFormItem>) {
  const [ids, setIds] = React.useState<string[]>([]);
  const register = React.useCallback((id: string) => {
    setIds((current) => (current.includes(id) ? current : [...current, id]));
    return () => setIds((current) => current.filter((item) => item !== id));
  }, []);
  const value = React.useMemo(() => ({ ids, register }), [ids, register]);
  return (
    <DescriptionContext.Provider value={value}>
      <PrimitiveFormItem {...props} />
    </DescriptionContext.Provider>
  );
}

function useDescriptionRegistration(id: string, present = true) {
  const register = React.useContext(DescriptionContext)?.register;
  React.useEffect(() => {
    if (present) return register?.(id);
  }, [id, present, register]);
}

function FormDescription(
  props: React.ComponentProps<typeof PrimitiveFormDescription>,
) {
  const { formDescriptionId } = useFormField();
  useDescriptionRegistration(formDescriptionId);
  return <PrimitiveFormDescription {...props} />;
}

function FormLabel({
  className,
  ...props
}: React.ComponentProps<typeof PrimitiveFormLabel>) {
  return (
    <PrimitiveFormLabel
      className={cn('flex-wrap wrap-anywhere', className)}
      {...props}
    />
  );
}

// Preserve child-based call sites while composing onto the actual Base UI
// control. A wrapper div cannot receive a label for its nested input. Avoid
// pointing aria-labelledby back to the input itself.
function FormControl({
  children,
  render,
  className,
}: React.ComponentProps<typeof PrimitiveFormControl>) {
  const { error, formItemId } = useFormField();
  const descriptions = React.useContext(DescriptionContext)?.ids;
  const element =
    render ?? (React.isValidElement(children) ? children : undefined);
  return useRender({
    defaultTagName: 'div',
    render: element,
    props: {
      id: formItemId,
      'aria-describedby': descriptions?.length
        ? descriptions.join(' ')
        : undefined,
      'aria-invalid': !!error,
      className: cn(className),
      ...(element ? {} : { children }),
    },
  });
}

const FormMessage: React.FC<
  React.ComponentPropsWithRef<'p'> & { params?: Record<string, unknown> }
> = ({ className, children, params = {}, ...props }) => {
  const { error, formMessageId } = useFormField();
  const body = error ? String(error?.message) : children;
  useDescriptionRegistration(formMessageId, !!body);

  if (!body) {
    return null;
  }

  return (
    <p
      id={formMessageId}
      className={cn('text-destructive text-[0.8rem] font-medium', className)}
      {...props}
    >
      {typeof body === 'string' ? (
        <Trans i18nKey={body} defaults={body} values={params} />
      ) : (
        body
      )}
    </p>
  );
};
FormMessage.displayName = 'FormMessage';

export {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  useFormField,
};
