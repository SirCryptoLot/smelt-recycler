// components/PageShell.tsx
// Single source of truth for page layout: max-width, padding, scroll.
// All inner pages (not the hero landing page) should wrap their content in this.
// AppShell already renders <main>, so this is a plain <div>.

export function PageShell({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={[
        'max-w-[720px] mx-auto w-full',
        'px-4 sm:px-6',
        'pt-6 sm:pt-8',
        'pb-12 sm:pb-16',
        className ?? '',
      ].join(' ')}
    >
      {children}
    </div>
  );
}
