'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { adminFetch, useAdminData } from './adminApi';
import { Modal } from './Modal';
import { Field, FormNote, Input, Select } from '@/components/ui/form';
import { cn } from '@/lib/cn';
import { Actions, AdminButton, AdminCard, Badge, Filters, FormGrid, Meta, MetaList, ModalActions, Notice, Spacer, StateMessage, adminButtonStyles, adminControl } from './ui';

interface Order {
  session_id: string; invoice_number: number; order_id: string; order_date: string;
  customer_name: string; customer_email: string; customer_phone: string;
  billing_address: string; shipping_address: string; items_summary: string; quantity: number;
  amount: string; subtotal: string; shipping: string; status: string; carrier: string;
  tracking_number: string; shipping_method: string; shipped_date: string | null;
}

/** Stored addresses are either Stripe-style JSON or already-formatted text. */
function formatAddress(raw: string): string {
  if (!raw) return '';
  if (!raw.trim().startsWith('{')) return raw;
  try {
    const a = JSON.parse(raw);
    const cityState = [a.city, a.state].filter(Boolean).join(', ');
    return [a.name, a.line1, a.line2, [cityState, a.postal_code].filter(Boolean).join(' '),
      a.country && String(a.country).toUpperCase() !== 'US' ? a.country : ''].filter(Boolean).join('\n');
  } catch {
    return raw;
  }
}

const CARRIERS = ['UPS', 'USPS', 'TQL Freight'];

type StatusFilter = 'all' | 'pending' | 'shipped' | 'cancelled';

/** Orders are "pending" until fulfilled; legacy rows may read paid/completed, which count as fulfilled. */
const FULFILLED = ['shipped', 'completed', 'paid'];
const matchesFilter = (status: string, filter: StatusFilter) =>
  filter === 'all' || (filter === 'shipped' ? FULFILLED.includes(status) : status === filter);

export function OrdersPanel() {
  const { data, error, loading, reload } = useAdminData<{ orders: Order[] }>('/api/admin/orders');
  const [filter, setFilter] = useState<StatusFilter>('pending');
  const [search, setSearch] = useState('');
  const [shipping, setShipping] = useState<Order | null>(null);
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const orders = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data?.orders ?? []).filter((o) =>
      matchesFilter(o.status, filter) &&
      (!q || [o.customer_name, o.customer_email, o.order_id].some((v) => v?.toLowerCase().includes(q))));
  }, [data, filter, search]);

  const run = async (action: () => Promise<unknown>, success: string) => {
    setBusy(true);
    setMessage(null);
    try {
      await action();
      setMessage(success);
      reload();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  const setStatus = (order: Order, status: string) =>
    run(() => adminFetch('/api/admin/update-order-status', { method: 'POST', body: JSON.stringify({ invoice_number: order.invoice_number, status }) }),
      `Order ${order.order_id} marked ${status}.`);

  const submitShip = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!shipping) return;
    const form = new FormData(e.currentTarget);
    const order = shipping;
    setShipping(null);
    await run(() => adminFetch('/api/admin/ship-order', {
      method: 'POST',
      body: JSON.stringify({
        invoice_number: order.invoice_number, session_id: order.session_id,
        carrier: form.get('carrier'), tracking_number: String(form.get('tracking') || '').trim(),
      }),
    }), `Order ${order.order_id} shipped and customer notified.`);
  };

  const submitInvoice = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setInvoiceOpen(false);
    await run(() => adminFetch('/api/admin/add-invoice', {
      method: 'POST',
      body: JSON.stringify({
        customer_name: f.get('customer_name'), customer_email: f.get('customer_email'),
        billing_address: f.get('billing_address'), shipping_address: f.get('shipping_address'),
        quantity: Number(f.get('quantity')), amount_cents: Math.round(Number(f.get('amount')) * 100),
        order_date: f.get('order_date'), carrier: f.get('carrier'), tracking_number: f.get('tracking_number'),
        status: f.get('status'), shipped_date: f.get('shipped_date') || undefined,
      }),
    }), 'Manual invoice added.');
  };

  return (
    <>
      <Filters>
        <label htmlFor="filter-status">Filter:</label>
        <select id="filter-status" className={adminControl} value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
          <option value="all">All Orders</option>
          <option value="pending">Pending Only</option>
          <option value="shipped">Shipped / Completed</option>
          <option value="cancelled">Cancelled Only</option>
        </select>
        <label htmlFor="search-orders">Search:</label>
        <input id="search-orders" type="search" className={cn(adminControl, 'min-w-60 max-[720px]:min-w-0')} placeholder="Customer email or name..." value={search} onChange={(e) => setSearch(e.target.value)} />
        <Spacer />
        <AdminButton variant="primary" onClick={() => setInvoiceOpen(true)}>+ Add Manual Invoice</AdminButton>
      </Filters>

      {message && <Notice>{message}</Notice>}
      {loading && <StateMessage>Loading orders…</StateMessage>}
      {error && <StateMessage tone="error">{error}</StateMessage>}
      {!loading && !error && orders.length === 0 && <StateMessage>No orders match.</StateMessage>}

      {orders.map((order) => (
        <AdminCard
          key={order.invoice_number}
          title={<>{order.order_id} · {order.customer_name || order.customer_email}</>}
          aside={<Badge status={order.status} />}
        >
          <MetaList>
            <Meta label="Date">{order.order_date}</Meta>
            <Meta label="Email">{order.customer_email}</Meta>
            {order.customer_phone && <Meta label="Phone">{order.customer_phone}</Meta>}
            <Meta label="Items">{order.items_summary} ({order.quantity?.toLocaleString()} units)</Meta>
            <Meta label="Total">{order.amount} (subtotal {order.subtotal} + shipping {order.shipping})</Meta>
            <Meta label="Shipping method">{order.shipping_method || '—'}</Meta>
            <Meta label="Ship to">{formatAddress(order.shipping_address) || '—'}</Meta>
            {order.billing_address && <Meta label="Bill to">{formatAddress(order.billing_address)}</Meta>}
            {order.tracking_number || order.shipped_date ? (
              <Meta label="Shipment">{order.carrier} {order.tracking_number} {order.shipped_date && `· ${order.shipped_date}`}</Meta>
            ) : null}
          </MetaList>
          <Actions>
            {order.status === 'pending' && (
              <AdminButton variant="primary" disabled={busy} onClick={() => setShipping(order)}>Mark Shipped</AdminButton>
            )}
            {order.status !== 'pending' && (
              <AdminButton disabled={busy} onClick={() => setStatus(order, 'pending')}>Set Pending</AdminButton>
            )}
            {order.status !== 'cancelled' && (
              <AdminButton variant="danger" disabled={busy} onClick={() => confirm(`Cancel order ${order.order_id}?`) && setStatus(order, 'cancelled')}>Cancel Order</AdminButton>
            )}
            {/^cs_/.test(order.session_id) && (
              <a className={adminButtonStyles()} href={`/api/order-print?session=${encodeURIComponent(order.session_id)}`} target="_blank" rel="noopener noreferrer">Print / PDF</a>
            )}
          </Actions>
        </AdminCard>
      ))}

      <Modal open={!!shipping} title={`Ship ${shipping?.order_id ?? ''}`} onClose={() => setShipping(null)}>
        <FormGrid onSubmit={submitShip}>
          <Field label="Carrier" required>
            <Select name="carrier" required defaultValue={shipping?.carrier || ''}>
              <option value="" disabled>Select carrier…</option>
              {CARRIERS.map((c) => <option key={c}>{c}</option>)}
            </Select>
          </Field>
          <Field label="Tracking Number">
            <Input name="tracking" />
            <FormNote>Optional. The customer is e-mailed when you confirm.</FormNote>
          </Field>
          <ModalActions>
            <AdminButton onClick={() => setShipping(null)}>Cancel</AdminButton>
            <AdminButton type="submit" variant="primary">Mark Shipped &amp; Notify</AdminButton>
          </ModalActions>
        </FormGrid>
      </Modal>

      <Modal open={invoiceOpen} title="Add Manual Invoice" onClose={() => setInvoiceOpen(false)}>
        <FormGrid onSubmit={submitInvoice}>
          <Field label="Customer Name" required><Input name="customer_name" required /></Field>
          <Field label="Customer Email" required><Input name="customer_email" type="email" required /></Field>
          <Field label="Billing Address"><Input name="billing_address" placeholder="123 Main St, City, ST 12345, USA" /></Field>
          <Field label="Shipping Address"><Input name="shipping_address" placeholder="123 Main St, City, ST 12345, USA" /></Field>
          <Field label="Quantity (Units)" required><Input name="quantity" type="number" min={1} required /></Field>
          <Field label="Amount (USD)" required>
            <Input name="amount" type="number" step="0.01" min={0} required />
            <FormNote>e.g., 382.98</FormNote>
          </Field>
          <Field label="Order Date" required><Input name="order_date" type="date" required /></Field>
          <Field label="Carrier" required>
            <Select name="carrier" required defaultValue="">
              <option value="" disabled>Select carrier…</option>
              {CARRIERS.map((c) => <option key={c}>{c}</option>)}
            </Select>
          </Field>
          <Field label="Tracking Number"><Input name="tracking_number" /></Field>
          <Field label="Status" required>
            <Select name="status" required defaultValue="shipped"><option value="shipped">Shipped</option><option value="pending">Pending</option></Select>
          </Field>
          <Field label="Shipped Date">
            <Input name="shipped_date" type="date" />
            <FormNote>Leave blank if pending</FormNote>
          </Field>
          <ModalActions>
            <AdminButton onClick={() => setInvoiceOpen(false)}>Cancel</AdminButton>
            <AdminButton type="submit" variant="primary">Add Invoice</AdminButton>
          </ModalActions>
        </FormGrid>
      </Modal>
    </>
  );
}
