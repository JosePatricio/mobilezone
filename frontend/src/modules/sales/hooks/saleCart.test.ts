import { canConfirm, cartReducer, cartTotal, lineExceedsStock, type CartLine, type CartProduct } from './saleCart';

const item = (inventoryId: number, precio: string, stock: number): CartProduct => ({
  inventoryId,
  productId: inventoryId * 10,
  sku: `SKU-${inventoryId}`,
  nombre: `Producto ${inventoryId}`,
  imagenUrl: null,
  precio,
  stock,
});
const productA = item(1, '10.00', 15);
const productB = item(2, '25.00', 1);

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

  it('increments and decrements with the - and + buttons within the stock', () => {
    let cart = cartReducer([], { type: 'add', product: item(3, '5.00', 2) });
    cart = cartReducer(cart, { type: 'increment', inventoryId: 3 });
    cart = cartReducer(cart, { type: 'increment', inventoryId: 3 });
    expect(cart[0].cantidad).toBe(2);
    cart = cartReducer(cart, { type: 'decrement', inventoryId: 3 });
    cart = cartReducer(cart, { type: 'decrement', inventoryId: 3 });
    expect(cart[0].cantidad).toBe(1);
  });

  it('prevents selling more than the available stock', () => {
    let cart = cartReducer([], { type: 'add', product: productB });
    cart = cartReducer(cart, { type: 'add', product: productB });
    expect(cart[0].cantidad).toBe(1);
    cart = cartReducer(cart, { type: 'setQuantity', inventoryId: 2, cantidad: 10 });
    expect(cart[0].cantidad).toBe(1);
  });

  it('does not add products without stock', () => {
    expect(cartReducer([], { type: 'add', product: { ...productA, stock: 0 } })).toEqual([]);
  });

  it('flags lines when the backend reports less stock', () => {
    let cart = cartReducer([], { type: 'add', product: productA });
    cart = cartReducer(cart, { type: 'setQuantity', inventoryId: 1, cantidad: 5 });
    cart = cartReducer(cart, { type: 'updateStock', productId: productA.productId, stock: 3 });
    expect(lineExceedsStock(cart[0])).toBe(true);
    expect(canConfirm(cart)).toBe(false);
  });

  it('removes products', () => {
    let cart = cartReducer([], { type: 'add', product: productA });
    cart = cartReducer(cart, { type: 'remove', inventoryId: 1 });
    expect(cart).toEqual([]);
    expect(canConfirm(cart)).toBe(false);
  });
});
