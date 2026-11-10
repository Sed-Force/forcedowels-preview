'use client';

import { useMemo, useState } from 'react';
import { useAdminData } from './adminApi';
import { cn } from '@/lib/cn';
import { AdminButton, AdminCard, Badge, Filters, Meta, MetaList, StateMessage, TableWrap, Td, adminControl } from './ui';

interface Customer {
  email: string; name: string; phone: string | null; order_count: number; total_spent: string;
  first_order_date: string; last_order_date: string;
  orders: Array<{ order_id: string; invoice_number: number; date: string; amount: string; status: string; items: string }>;
}

export function CustomersPanel() {
  const { data, loading, error } = useAdminData<{ customers: Customer[] }>('/api/admin/customers');
  const [search, setSearch] = useState('');
  const [openEmail, setOpenEmail] = useState<string | null>(null);

  const customers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data?.customers ?? []).filter((c) => !q || [c.name, c.email].some((v) => v?.toLowerCase().includes(q)));
  }, [data, search]);

  return (
    <>
      <Filters>
        <label htmlFor="search-customers">Search:</label>
        <input id="search-customers" type="search" className={cn(adminControl, 'min-w-60 max-[720px]:min-w-0')} placeholder="Name or email..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </Filters>
      {loading && <StateMessage>Loading customers…</StateMessage>}
      {error && <StateMessage tone="error">{error}</StateMessage>}
      {!loading && !error && customers.length === 0 && <StateMessage>No customers found.</StateMessage>}

      {customers.map((c) => {
        const open = openEmail === c.email;
        return (
          <AdminCard key={c.email} title={c.name || c.email} aside={<strong className="text-lg">{c.total_spent}</strong>}>
            <MetaList>
              <Meta label="Email">{c.email}</Meta>
              {c.phone && <Meta label="Phone">{c.phone}</Meta>}
              <Meta label="Orders">{c.order_count}</Meta>
              <Meta label="First order">{c.first_order_date}</Meta>
              <Meta label="Last order">{c.last_order_date}</Meta>
            </MetaList>
            <AdminButton aria-expanded={open} onClick={() => setOpenEmail(open ? null : c.email)}>
              {open ? 'Hide orders' : `View ${c.orders.length} order${c.orders.length === 1 ? '' : 's'}`}
            </AdminButton>
            {open && (
              <TableWrap className="mt-3">
                <thead><tr><th>Order</th><th>Date</th><th>Items</th><th>Status</th><th className="num">Amount</th></tr></thead>
                <tbody>
                  {c.orders.map((o) => (
                    <tr key={o.invoice_number}>
                      <Td label="Order">{o.order_id}</Td><Td label="Date">{o.date}</Td><Td label="Items">{o.items}</Td>
                      <Td label="Status"><Badge status={o.status} /></Td>
                      <Td label="Amount" className="num">{o.amount}</Td>
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
            )}
          </AdminCard>
        );
      })}
    </>
  );
}
