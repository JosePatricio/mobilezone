import type { Id, Money } from '@/shared/types/api';
import { fromCents, multiplyMoney } from '@/shared/utils/money';

/** A sale line. Units are taken from an inventory row (product + branch of the sale). */
export interface CartLine {
  inventoryId: Id;
  productId: Id;
  sku: string;
  nombre: string;
  imagenUrl: string | null;
  precio: Money;
  /** Stock available in the branch */
  stock: number;
  cantidad: number;
}

export type CartProduct = Omit<CartLine, 'cantidad'>;

export type CartAction =
  | { type: 'add'; product: CartProduct }
  | { type: 'increment'; inventoryId: Id }
  | { type: 'decrement'; inventoryId: Id }
  | { type: 'setQuantity'; inventoryId: Id; cantidad: number }
  | { type: 'remove'; inventoryId: Id }
  | { type: 'updateStock'; productId: Id; stock: number }
  | { type: 'clear' };

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

function withQuantity(line: CartLine, cantidad: number): CartLine {
  return { ...line, cantidad: clamp(Math.floor(cantidad) || 1, 1, Math.max(line.stock, 1)) };
}

/**
 * Pure cart reducer. The UI prevents selling more than the stock of the branch
 * whenever possible; the backend remains the final source of truth.
 */
export function cartReducer(lines: CartLine[], action: CartAction): CartLine[] {
  switch (action.type) {
    case 'add': {
      const { product } = action;
      if (product.stock <= 0) return lines;
      const existing = lines.find((l) => l.inventoryId === product.inventoryId);
      if (existing) {
        return lines.map((l) =>
          l.inventoryId === product.inventoryId ? withQuantity({ ...l, stock: product.stock }, l.cantidad + 1) : l,
        );
      }
      return [...lines, { ...product, cantidad: 1 }];
    }
    case 'increment':
      return lines.map((l) => (l.inventoryId === action.inventoryId ? withQuantity(l, l.cantidad + 1) : l));
    case 'decrement':
      return lines.map((l) => (l.inventoryId === action.inventoryId ? withQuantity(l, l.cantidad - 1) : l));
    case 'setQuantity':
      return lines.map((l) => (l.inventoryId === action.inventoryId ? withQuantity(l, action.cantidad) : l));
    case 'remove':
      return lines.filter((l) => l.inventoryId !== action.inventoryId);
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
