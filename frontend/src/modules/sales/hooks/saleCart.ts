import type { Id, Money } from '@/shared/types/api';
import { fromCents, multiplyMoney } from '@/shared/utils/money';

export interface CartLine {
  productId: Id;
  nombre: string;
  precio: Money;
  stock: number;
  cantidad: number;
}

export interface CartProduct {
  id: Id;
  nombre: string;
  precio: Money;
  stock: number;
}

export type CartAction =
  | { type: 'add'; product: CartProduct }
  | { type: 'setQuantity'; productId: Id; cantidad: number }
  | { type: 'remove'; productId: Id }
  | { type: 'updateStock'; productId: Id; stock: number }
  | { type: 'clear' };

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

/**
 * Pure cart reducer. The UI prevents selling more than the available stock
 * whenever possible; the backend remains the final source of truth.
 */
export function cartReducer(lines: CartLine[], action: CartAction): CartLine[] {
  switch (action.type) {
    case 'add': {
      const { product } = action;
      if (product.stock <= 0) return lines;
      const existing = lines.find((l) => l.productId === product.id);
      if (existing) {
        return lines.map((l) =>
          l.productId === product.id ? { ...l, stock: product.stock, cantidad: clamp(l.cantidad + 1, 1, product.stock) } : l,
        );
      }
      return [
        ...lines,
        { productId: product.id, nombre: product.nombre, precio: product.precio, stock: product.stock, cantidad: 1 },
      ];
    }
    case 'setQuantity':
      return lines.map((l) =>
        l.productId === action.productId
          ? { ...l, cantidad: clamp(Math.floor(action.cantidad) || 1, 1, Math.max(l.stock, 1)) }
          : l,
      );
    case 'remove':
      return lines.filter((l) => l.productId !== action.productId);
    case 'updateStock':
      return lines.map((l) => (l.productId === action.productId ? { ...l, stock: action.stock } : l));
    case 'clear':
      return [];
    default:
      return lines;
  }
}

export function lineSubtotalCents(line: CartLine): number {
  return multiplyMoney(line.precio, line.cantidad);
}

export function cartTotal(lines: CartLine[]): Money {
  return fromCents(lines.reduce((sum, l) => sum + lineSubtotalCents(l), 0));
}

export function lineExceedsStock(line: CartLine): boolean {
  return line.cantidad > line.stock;
}

export function canConfirm(lines: CartLine[]): boolean {
  return lines.length > 0 && lines.every((l) => l.cantidad > 0 && !lineExceedsStock(l));
}
