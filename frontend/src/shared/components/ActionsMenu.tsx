import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';

export interface MenuAction {
  label: string;
  onClick: () => void;
  danger?: boolean;
}

interface ActionsMenuProps {
  actions: MenuAction[];
  /** Accessible name of the trigger, e.g. "Acciones de Cargador USB-C". */
  label?: string;
}

/**
 * Row actions in a single dropdown (saves space in wide tables).
 * The menu is positioned "fixed" under the trigger, so the scroll container of the table does not clip it.
 */
export function ActionsMenu({ actions, label = 'Acciones' }: ActionsMenuProps) {
  const id = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [style, setStyle] = useState<CSSProperties>({});

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const menuHeight = menuRef.current?.offsetHeight ?? 0;
    // Opens upwards when there is no room below (last rows of the table).
    const below = rect.bottom + 4 + menuHeight <= window.innerHeight;
    setStyle({
      position: 'fixed',
      right: Math.max(window.innerWidth - rect.right, 8),
      top: below ? rect.bottom + 4 : Math.max(rect.top - 4 - menuHeight, 8),
    });
    menuRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!menuRef.current?.contains(target) && !triggerRef.current?.contains(target)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        close();
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    // A fixed menu would stay in place while the page scrolls: close it instead.
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  if (actions.length === 0) return null;

  const moveFocus = (step: number) => {
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('button') ?? []);
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    items[(index + step + items.length) % items.length]?.focus();
  };

  return (
    <div className="actions-menu">
      <button
        ref={triggerRef}
        type="button"
        className="btn btn-secondary btn-sm"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? `${id}-menu` : undefined}
        aria-label={label}
        onClick={() => setOpen((v) => !v)}
      >
        Acciones <span aria-hidden>▾</span>
      </button>
      {open && (
        <ul
          ref={menuRef}
          id={`${id}-menu`}
          role="menu"
          className="actions-menu-list"
          style={style}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault();
              moveFocus(e.key === 'ArrowDown' ? 1 : -1);
            }
          }}
        >
          {actions.map((action) => (
            <li key={action.label} role="none">
              <button
                type="button"
                role="menuitem"
                className={action.danger ? 'text-danger' : ''}
                onClick={() => {
                  setOpen(false);
                  action.onClick();
                }}
              >
                {action.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
