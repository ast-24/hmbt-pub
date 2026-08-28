import type { ReactNode } from "react";

type FormFieldLabelProps = {
  children: ReactNode;
  required?: boolean;
};

export function FormFieldLabel({
  children,
  required = false,
}: FormFieldLabelProps): ReactNode {
  return (
    <span className="form-field-label">
      {children}
      {required ? (
        <span className="form-field-label__required" aria-hidden>
          *
        </span>
      ) : (
        <span className="form-field-label__optional">(任意)</span>
      )}
    </span>
  );
}
