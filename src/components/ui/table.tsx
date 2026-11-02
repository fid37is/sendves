import type { HTMLAttributes, ReactNode, TdHTMLAttributes, ThHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/**
 * A data table that adapts to the room it has, not to the screen: when the space it sits in is narrower than
 * 640px (a phone, or a narrow column on a tablet) every row becomes a card, with the first cell as its title
 * and each cell that has a `label` shown as a small caption above its value. Nothing scrolls sideways.
 * See `.table-stack` in globals.css.
 *
 * - First cell of a row: the title (no `label`).
 * - Other cells: pass `label` (the column heading); add `wide` for long values (URLs, DNS records, errors)
 *   so they get the full width of the card.
 * - Action cells (right-aligned buttons or links): no `label`, keep `className="text-right"` or a
 *   `justify-end` group, so actions stay on the right in both layouts.
 *
 * `stack={false}` keeps the classic scrolling table for data that really is a grid.
 */
export function Table({ className, stack = true, ...props }: HTMLAttributes<HTMLTableElement> & { stack?: boolean }) {
  return (
    <div className={cn("overflow-x-auto", stack && "table-wrap")}>
      <table className={cn("w-full text-left text-sm", stack ? "table-stack" : "min-w-[640px]", className)} {...props} />
    </div>
  );
}

export function TH({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return <th className={cn("whitespace-nowrap border-b border-mist bg-mist-50 px-6 py-3 text-xs font-semibold text-ink-muted", className)} {...props} />;
}

type TDProps = TdHTMLAttributes<HTMLTableCellElement> & {
  /** The column heading, shown above the value when the table is stacked into cards. */
  label?: string;
  /** Stacked cards only: give this cell the full width of the card instead of half. */
  wide?: boolean;
  children?: ReactNode;
};

export function TD({ className, label, wide, children, ...props }: TDProps) {
  return (
    <td
      className={cn("border-b border-mist px-6 py-4 text-ink-soft", className)}
      data-label={label || undefined}
      data-wide={wide ? "" : undefined}
      {...props}
    >
      {label ? <span className="tlabel" aria-hidden="true">{label}</span> : null}
      {children}
    </td>
  );
}

export function EmptyRow({ cols, message }: { cols: number; message: string }) {
  return (
    <tr>
      <td colSpan={cols} className="tempty px-6 py-12 text-center text-sm text-ink-muted">
        {message}
      </td>
    </tr>
  );
}