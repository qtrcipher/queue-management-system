import type { ButtonHTMLAttributes, PropsWithChildren } from "react";
import { clsx } from "clsx";

export function Button({ className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={clsx("qms-button", className)} {...props} />;
}

export function Surface({ children }: PropsWithChildren) {
  return <section className="surface">{children}</section>;
}

