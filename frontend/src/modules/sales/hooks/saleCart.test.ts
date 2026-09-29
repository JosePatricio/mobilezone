import { canConfirm, cartReducer, cartTotal, lineExceedsStock, type CartLine } from './saleCart';

const productA = { id: 1, nombre: 'Producto A', precio: '10.00', stock: 15 };
const productB = { id: 2, nombre: 'Producto B', precio: '25.00', stock: 1 };

describe('sale cart', () => {
  it('adds several products and computes subtotals and total', () => {
    let cart: CartLine[] = [];
    cart = cartReducer(cart, { type: 'add', product: productA });
    cart = cartReducer(cart, { type: 'add', product: productA });
    cart = cartReducer(cart, { type: 'add', product: productB });
    expect(cart).toHaveLength(2);
    expect(cart[0].cantidad).toBe(2);
    expect(cartTotal(cart)).toBe('45.00');
  });

  it('prevents selling more than the available stock', () => {
    let cart = cartReducer([], { type: 'add', product: productB });
    cart = cartReducer(cart, { type: 'add', product: productB });
    expect(cart[0].cantidad).toBe(1);
    cart = cartReducer(cart, { type: 'setQuantity', productId: 2, cantidad: 10 });
    expect(cart[0].cantidad).toBe(1);
  });

  it('does not add products without stock', () => {
    expect(cartReducer([], { type: 'add', product: { ...productA, stock: 0 } })).toEqual([]);
  });

  it('flags lines when the backend reports less stock', () => {
    let cart = cartReducer([], { type: 'add', product: productA });
    cart = cartReducer(cart, { type: 'setQuantity', productId: 1, cantidad: 5 });
    cart = cartReducer(cart, { type: 'updateStock', productId: 1, stock: 3 });
    expect(lineExceedsStock(cart[0])).toBe(true);
    expect(canConfirm(cart)).toBe(false);
  });

  it('removes products', () => {
    let cart = cartReducer([], { type: 'add', product: productA });
    cart = cartReducer(cart, { type: 'remove', productId: 1 });
    expect(cart).toEqual([]);
    expect(canConfirm(cart)).toBe(false);
  });
});
