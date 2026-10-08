import { useLayoutEffect, useRef, type ReactNode } from 'react';
import '@/styles/tabNavbar.scss';

interface TabOption<T extends string> {
  value: T;
  label: string;
  icon?: ReactNode;
}

interface TabNavbarProps<T extends string> {
  active: T;
  options: TabOption<T>[];
  onChange: (value: T) => void;
  ariaLabel: string;
  className: string;
  navigation?: boolean;
}

export default function TabNavbar<T extends string>({
  active, options, onChange, ariaLabel, className, navigation = false,
}: TabNavbarProps<T>) {
  const navRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const updateIndicator = () => {
      const selected = nav.querySelector<HTMLButtonElement>('.is-active');
      nav.style.setProperty('--category-indicator-opacity', selected ? '1' : '0');
      if (!selected) return;
      nav.style.setProperty('--category-indicator-x', `${selected.offsetLeft}px`);
      nav.style.setProperty('--category-indicator-width', `${selected.offsetWidth}px`);
    };
    updateIndicator();
    const observer = new ResizeObserver(updateIndicator);
    observer.observe(nav);
    nav.querySelectorAll('button').forEach((button) => observer.observe(button));
    return () => observer.disconnect();
  }, [active, options]);

  return (
    <div
      ref={navRef}
      className={`${className} video-tab-navbar`}
      role={navigation ? 'navigation' : 'tablist'}
      aria-label={ariaLabel}
    >
      {options.map(({ value, label, icon }) => (
        <button
          key={value}
          type="button"
          data-tab-navbar-button
          role={navigation ? undefined : 'tab'}
          aria-current={navigation && active === value ? 'page' : undefined}
          aria-selected={navigation ? undefined : active === value}
          tabIndex={navigation || active === value ? 0 : -1}
          className={active === value ? 'is-active' : ''}
          onClick={() => onChange(value)}
          onKeyDown={(event) => {
            if (navigation) return;
            const index = options.findIndex((option) => option.value === value);
            let next: number;
            if (event.key === 'ArrowRight') next = (index + 1) % options.length;
            else if (event.key === 'ArrowLeft') next = (index - 1 + options.length) % options.length;
            else if (event.key === 'Home') next = 0;
            else if (event.key === 'End') next = options.length - 1;
            else return;
            event.preventDefault();
            navRef.current?.querySelectorAll('button')[next]?.focus();
            onChange(options[next].value);
          }}
        >
          {icon}
          <span>{label}</span>
        </button>
      ))}
    </div>
  );
}
