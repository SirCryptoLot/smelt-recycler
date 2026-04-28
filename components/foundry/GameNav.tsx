'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const GOLD = '#d4a438';

interface GameNavProps {
  /** The user's forge ID, if known — makes the Forge link smart */
  forgeId?: number | null;
}

interface Item {
  icon: string;
  label: string;
  href: string;
  match: (path: string) => boolean;
}

function buildItems(forgeId: number | null | undefined): Item[] {
  return [
    {
      icon: '🗺️',
      label: 'Map',
      href: '/foundry',
      match: p => p === '/foundry',
    },
    {
      icon: '⚒️',
      label: forgeId ? 'Forge' : 'Claim',
      href: forgeId ? `/foundry/forge/${forgeId}` : '/foundry/claim',
      match: p => p.startsWith('/foundry/forge') || p.startsWith('/foundry/claim'),
    },
    {
      icon: '⚗️',
      label: 'Exchange',
      href: '/foundry/exchange',
      match: p => p.startsWith('/foundry/exchange'),
    },
    {
      icon: '📜',
      label: 'Reports',
      href: '/foundry/reports',
      match: p => p.startsWith('/foundry/reports'),
    },
    {
      icon: '🛒',
      label: 'Store',
      href: '/foundry/store',
      match: p => p.startsWith('/foundry/store'),
    },
  ];
}

export function GameNav({ forgeId }: GameNavProps) {
  const pathname = usePathname() ?? '';
  const items = buildItems(forgeId);

  return (
    <nav
      aria-label="Foundry navigation"
      style={{
        position: 'fixed',
        left: '50%',
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)',
        transform: 'translateX(-50%)',
        zIndex: 60,
        display: 'flex',
        gap: 2,
        padding: 5,
        background:
          'linear-gradient(180deg, rgba(30,42,18,0.94), rgba(8,13,5,0.94))',
        WebkitBackdropFilter: 'blur(10px)',
        backdropFilter: 'blur(10px)',
        border: `1px solid ${GOLD}33`,
        borderRadius: 999,
        boxShadow:
          '0 14px 40px rgba(0,0,0,0.65), inset 0 1px 0 rgba(255,255,255,0.05), inset 0 -1px 0 rgba(0,0,0,0.4)',
      }}
    >
      {items.map(item => {
        const active = item.match(pathname);
        return (
          <Link
            key={item.label}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              minWidth: 48,
              height: 44,
              padding: active ? '0 14px 0 12px' : '0 12px',
              borderRadius: 999,
              textDecoration: 'none',
              background: active
                ? 'linear-gradient(180deg, #4a3110, #1f1404)'
                : 'transparent',
              border: active
                ? `1px solid ${GOLD}66`
                : '1px solid transparent',
              boxShadow: active
                ? `0 0 18px ${GOLD}40, inset 0 1px 0 ${GOLD}22, inset 0 -1px 0 rgba(0,0,0,0.4)`
                : 'none',
              transition: 'all 0.18s ease',
            }}
          >
            <span
              style={{
                fontSize: 19,
                lineHeight: 1,
                opacity: active ? 1 : 0.55,
                filter: active ? 'none' : 'grayscale(0.45)',
                transform: active ? 'scale(1.08)' : 'scale(1)',
                transition: 'all 0.18s ease',
              }}
            >
              {item.icon}
            </span>
            {active && (
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  color: GOLD,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  textShadow: `0 0 10px ${GOLD}55`,
                  whiteSpace: 'nowrap',
                }}
              >
                {item.label}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
