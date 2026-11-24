import Button from './Button';

export interface MenuItem {
  id: string;
  label: string;
  onSelect: () => void;
}

/** A vertical list of menu entries. Labels come from the copy module. */
export default function MenuList({ items }: { items: readonly MenuItem[] }) {
  return (
    <ul className="kit-menu" role="menu">
      {items.map((item) => (
        <li key={item.id} role="none">
          <Button role="menuitem" className="kit-menu-item" onClick={item.onSelect}>
            {item.label}
          </Button>
        </li>
      ))}
    </ul>
  );
}
