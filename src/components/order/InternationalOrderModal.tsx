'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useAuthState } from '@/components/providers/AppProviders';
import { SIZES, kitUnits, sizeLabel, normalizeSizeId } from '@/lib/products';
import { Button } from '@/components/ui/button';
import { FormStatus } from '@/components/ui/form';
import { XMarkIcon } from '@heroicons/react/24/outline';

// Base64 inflates files by ~33%; keep attachments well under the 4.5 MB request limit.
const MAX_LABEL_BYTES = 3 * 1024 * 1024;

const row = 'grid gap-1.5 text-sm font-bold';
const control =
  'w-full rounded-lg border border-line-strong bg-field px-3 py-2.5 font-medium text-fg focus:border-brand focus:outline-2 focus:outline-brand-light';

type OrderType = '' | 'kit' | 'bulk';
type Action = 'request' | 'reserve';

const readAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

interface Props {
  open: boolean;
  onClose: () => void;
  isInStock: (sizeId: string) => boolean;
}

export function InternationalOrderModal({ open, onClose, isInStock }: Props) {
  const { getToken } = useAuthState();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [orderType, setOrderType] = useState<OrderType>('');
  const [submitting, setSubmitting] = useState<Action | null>(null);
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  // Drive the native <dialog> from the `open` prop (gives focus trap + Escape for free).
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const reset = () => {
    formRef.current?.reset();
    setOrderType('');
    setMessage(null);
  };

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const action = ((e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null)?.value as Action | undefined;
    if (action !== 'request' && action !== 'reserve') return;

    const form = new FormData(e.currentTarget);
    const sizeId = normalizeSizeId(form.get('size'));
    const type = form.get('order_type') as 'kit' | 'bulk';
    const label = sizeLabel(sizeId);

    let quantity: number;
    let units: number;
    let display: string;
    if (type === 'kit') {
      quantity = parseInt(String(form.get('kit_quantity')), 10) || 1;
      units = quantity * kitUnits(sizeId);
      display = `${quantity} Ship Kit${quantity > 1 ? 's' : ''} — ${label} (${units} dowels)`;
    } else {
      quantity = parseInt(String(form.get('bulk_quantity')), 10) || 5000;
      units = quantity;
      display = `${quantity.toLocaleString()} dowels — ${label} (Bulk)`;
    }

    setSubmitting(action);
    setMessage(null);
    try {
      const payload: Record<string, unknown> = {
        action,
        size: sizeId,
        order_type: type,
        quantity,
        units,
        display,
        business_name: form.get('business_name'),
        contact_name: form.get('contact_name'),
        email: form.get('email'),
        phone: form.get('phone'),
        shipping_address: form.get('shipping_address'),
        tax_id: form.get('tax_id'),
        comments: form.get('comments') || '',
      };

      const file = form.get('shipping_label');
      if (file instanceof File && file.size > 0) {
        if (file.size > MAX_LABEL_BYTES) throw new Error('Shipping label must be smaller than 3 MB.');
        payload.shipping_label = { filename: file.name, content: await readAsDataUrl(file), type: file.type };
      }

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const token = await getToken().catch(() => null);
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await fetch('/api/international-order', { method: 'POST', headers, body: JSON.stringify(payload) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || data.error || 'Failed to submit request');

      if (action === 'reserve') {
        if (!data.checkoutUrl) throw new Error('Failed to create checkout session. Please try again or contact us directly.');
        window.location.assign(data.checkoutUrl);
        return;
      }
      setMessage({
        kind: 'success',
        text: 'Your international order request has been submitted. Our team will contact you within 1–3 business days with shipping rates and a payment link.',
      });
      formRef.current?.reset();
      setOrderType('');
    } catch (err) {
      setMessage({ kind: 'error', text: err instanceof Error ? err.message : 'Something went wrong' });
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      className="m-auto max-h-[90vh] w-[min(600px,calc(100vw-32px))] overflow-y-auto rounded-xl border border-line bg-card p-0 text-fg shadow-[0_20px_60px_rgb(0_0_0/0.3)] backdrop:bg-black/60 max-[640px]:max-h-screen max-[640px]:w-[calc(100vw-16px)]"
      aria-labelledby="intl-title"
      onClose={() => {
        reset();
        onClose();
      }}
      onClick={(e) => {
        // Clicking the backdrop (the dialog element itself) closes it.
        if (e.target === dialogRef.current) dialogRef.current?.close();
      }}
    >
      <div className="sticky top-0 z-[1] flex items-center justify-between bg-brand px-6 py-[18px]">
        <h2 id="intl-title" className="m-0 text-[22px] text-white">International Order Request</h2>
        <button type="button" className="grid size-9 place-items-center rounded-md border-0 bg-transparent p-0 text-white hover:bg-white/20" aria-label="Close" onClick={() => dialogRef.current?.close()}>
          <XMarkIcon aria-hidden="true" className="size-6" />
        </button>
      </div>

      <form ref={formRef} className="grid gap-4 p-6 max-[640px]:p-4" onSubmit={onSubmit}>
        <label className={row}>
          <span>Dowel Size *</span>
          <select className={control} name="size" required defaultValue={SIZES[0].id}>
            {SIZES.map((s) => {
              const inStock = isInStock(s.id);
              return (
                <option key={s.id} value={s.id} disabled={!inStock}>
                  {s.label}{inStock ? '' : ' (Out of Stock)'}
                </option>
              );
            })}
          </select>
        </label>

        <label className={row}>
          <span>Order Type *</span>
          <select className={control} name="order_type" required value={orderType} onChange={(e) => setOrderType(e.target.value as OrderType)}>
            <option value="">Select order type…</option>
            <option value="kit">Ship Kit (300 dowels each)</option>
            <option value="bulk">Bulk Order (5,000+ dowels)</option>
          </select>
        </label>

        {orderType === 'kit' && (
          <label className={row}>
            <span>Number of Ship Kits *</span>
            <input className={control} type="number" name="kit_quantity" min={1} max={100} required placeholder="e.g., 5 kits = 1,500 dowels" />
          </label>
        )}
        {orderType === 'bulk' && (
          <label className={row}>
            <span>Bulk Quantity (units) *</span>
            <input className={control} type="number" name="bulk_quantity" min={5000} max={960000} step={5000} required placeholder="e.g., 35000" />
          </label>
        )}

        <label className={row}>
          <span>Official Business Name *</span>
          <input className={control} type="text" name="business_name" required autoComplete="organization" />
        </label>
        <label className={row}>
          <span>Contact Name *</span>
          <input className={control} type="text" name="contact_name" required autoComplete="name" />
        </label>
        <label className={row}>
          <span>Email Address *</span>
          <input className={control} type="email" name="email" required autoComplete="email" />
        </label>
        <label className={row}>
          <span>Valid Phone Number *</span>
          <input className={control} type="tel" name="phone" required autoComplete="tel" placeholder="+1 234 567 8900" />
        </label>
        <label className={row}>
          <span>Official Shipping Address *</span>
          <textarea className={control} name="shipping_address" rows={4} required placeholder={'Street Address\nCity, State/Province\nPostal/Zip Code\nCountry'} />
        </label>
        <label className={row}>
          <span>Shipping Label (Optional)</span>
          <input className="text-sm font-medium" type="file" name="shipping_label" accept="image/*,.pdf" />
          <small className="text-xs font-normal text-fg-muted">Upload an image or PDF of your shipping label if available (max 3 MB)</small>
        </label>
        <label className={row}>
          <span>Business Tax ID Number *</span>
          <input className={control} type="text" name="tax_id" required placeholder="e.g., VAT, GST, or EIN" />
        </label>
        <label className={row}>
          <span>Additional Comments (Optional)</span>
          <textarea className={control} name="comments" rows={3} placeholder="Any special requirements or notes..." />
        </label>

        <div className="rounded-sm border-l-4 border-l-[#f59e0b] bg-[#fef3c7] px-4 py-3 text-[13px] text-[#92400e]">
          For international orders, we use a third-party shipper. Requests for international rates can take up to
          1–3 business days.
        </div>

        {message && (
          <FormStatus role="alert" kind={message.kind}>{message.text}</FormStatus>
        )}

        <div className="flex justify-end gap-3 border-t border-line pt-4 max-[640px]:flex-col [&>*]:max-w-[250px] [&>*]:flex-1 max-[640px]:[&>*]:max-w-none">
          <Button type="submit" value="request" variant="primary" disabled={submitting !== null}>
            {submitting === 'request' ? 'Processing…' : 'Submit Request'}
          </Button>
          <Button type="submit" value="reserve" variant="accent" disabled={submitting !== null}>
            {submitting === 'reserve' ? 'Processing…' : 'Reserve Stock & Request Rates'}
          </Button>
        </div>
      </form>
    </dialog>
  );
}
