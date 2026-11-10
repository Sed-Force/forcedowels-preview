'use client';

import { useState } from 'react';
import { adminFetch, useAdminData } from './adminApi';
import { Badge, Notice, StateMessage, Switch, TableWrap, Td } from './ui';

interface Product { id: string; label: string; sku: string; inStock: boolean }

/** Per-size stock switches; the storefront Order page and checkout both honour these. */
export function ProductsPanel() {
  const { data, loading, error, reload } = useAdminData<{ products: Product[] }>('/api/admin/product-availability');
  const [pending, setPending] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const toggle = async (product: Product, inStock: boolean) => {
    setPending(product.id);
    setMessage(null);
    try {
      await adminFetch('/api/admin/product-availability', { method: 'POST', body: JSON.stringify({ sizeId: product.id, inStock }) });
      setMessage(`${product.label} is now ${inStock ? 'in stock' : 'out of stock'}.`);
      reload();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setPending(null);
    }
  };

  return (
    <>
      {message && <Notice>{message}</Notice>}
      {loading && <StateMessage>Loading products…</StateMessage>}
      {error && <StateMessage tone="error">{error}</StateMessage>}
      <TableWrap>
        <thead><tr><th>Size</th><th>SKU</th><th>Availability</th></tr></thead>
        <tbody>
          {data?.products.map((p) => (
            <tr key={p.id}>
              <Td label="Size"><strong>{p.label}</strong></Td>
              <Td label="SKU">{p.sku}</Td>
              <Td label="Availability">
                <Switch checked={p.inStock} disabled={pending === p.id} onChange={(next) => toggle(p, next)}>
                  <Badge status={p.inStock ? 'instock' : 'outstock'}>{p.inStock ? 'In stock' : 'Out of stock'}</Badge>
                </Switch>
              </Td>
            </tr>
          ))}
        </tbody>
      </TableWrap>
    </>
  );
}
