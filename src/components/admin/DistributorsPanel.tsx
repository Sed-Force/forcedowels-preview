'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { adminFetch, useAdminData } from './adminApi';
import { Modal } from './Modal';
import { Field, FormNote, Input, Select, Textarea } from '@/components/ui/form';
import { Actions, AdminButton, AdminCard, Badge, Filters, FormGrid, Meta, MetaList, ModalActions, Notice, Spacer, StateMessage, adminControl } from './ui';

interface Distributor {
  id: number; company_name: string; contact_name: string | null; email: string; phone: string | null;
  territory: string | null; status: 'pending' | 'approved' | 'rejected'; notes: string | null; created_at: string;
}

/** Application details are JSON in `notes`; admin-entered rows hold free text. */
function readNotes(notes: string | null): { details: Record<string, string> | null; text: string } {
  if (!notes) return { details: null, text: '' };
  try {
    const parsed = JSON.parse(notes);
    if (parsed && typeof parsed === 'object') return { details: parsed, text: '' };
  } catch { /* fall through to plain text */ }
  return { details: null, text: notes };
}

export function DistributorsPanel() {
  const { data, loading, error, reload } = useAdminData<{ distributors: Distributor[] }>('/api/admin/distributors');
  const [filter, setFilter] = useState<'all' | Distributor['status']>('all');
  const [editing, setEditing] = useState<Distributor | 'new' | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const list = useMemo(() => (data?.distributors ?? []).filter((d) => filter === 'all' || d.status === filter), [data, filter]);

  const save = async (payload: Partial<Distributor>, method: 'POST' | 'PUT', success: string) => {
    setBusy(true);
    setMessage(null);
    try {
      await adminFetch('/api/admin/distributors', { method, body: JSON.stringify(payload) });
      setMessage(success);
      reload();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  const setStatus = (d: Distributor, status: Distributor['status']) => save({ ...d, status }, 'PUT', `${d.company_name} marked ${status}.`);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const current = editing;
    setEditing(null);
    const payload = {
      company_name: String(f.get('company_name')), contact_name: String(f.get('contact_name')), email: String(f.get('email')),
      phone: String(f.get('phone')), territory: String(f.get('territory')), status: f.get('status') as Distributor['status'],
      notes: String(f.get('notes')),
    };
    if (current && current !== 'new') await save({ id: current.id, ...payload }, 'PUT', 'Distributor updated.');
    else await save(payload, 'POST', 'Distributor added.');
  };

  const editingRow = editing && editing !== 'new' ? editing : null;

  return (
    <>
      <Filters>
        <label htmlFor="dist-filter">Status:</label>
        <select id="dist-filter" className={adminControl} value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
          <option value="all">All</option><option value="pending">Pending</option>
          <option value="approved">Approved</option><option value="rejected">Rejected</option>
        </select>
        <Spacer />
        <AdminButton variant="primary" onClick={() => setEditing('new')}>+ Add Distributor</AdminButton>
      </Filters>

      {message && <Notice>{message}</Notice>}
      {loading && <StateMessage>Loading distributors…</StateMessage>}
      {error && <StateMessage tone="error">{error}</StateMessage>}
      {!loading && !error && list.length === 0 && <StateMessage>No distributors.</StateMessage>}

      {list.map((d) => {
        const { details, text } = readNotes(d.notes);
        const location = details ? [details.city, details.state, details.zip, details.country].filter(Boolean).join(', ') : '';
        return (
          <AdminCard key={d.id} title={d.company_name} aside={<Badge status={d.status} />}>
            <MetaList>
              <Meta label="Contact">{d.contact_name || '—'}</Meta>
              <Meta label="Email">{d.email}</Meta>
              <Meta label="Phone">{d.phone || '—'}</Meta>
              <Meta label="Territory">{d.territory || '—'}</Meta>
              <Meta label="Applied">{d.created_at}</Meta>
              {location && <Meta label="Location">{location}</Meta>}
              {details?.business_type && <Meta label="Business type">{details.business_type}</Meta>}
              {details?.monthly_volume && <Meta label="Monthly volume">{details.monthly_volume}</Meta>}
              {details?.website && <Meta label="Website">{details.website}</Meta>}
              {(details?.additional_notes || text) && <Meta label="Notes">{details?.additional_notes || text}</Meta>}
            </MetaList>
            <Actions>
              {d.status !== 'approved' && <AdminButton variant="primary" disabled={busy} onClick={() => setStatus(d, 'approved')}>Approve</AdminButton>}
              {d.status !== 'rejected' && <AdminButton variant="danger" disabled={busy} onClick={() => setStatus(d, 'rejected')}>Reject</AdminButton>}
              <AdminButton onClick={() => setEditing(d)}>Edit</AdminButton>
            </Actions>
          </AdminCard>
        );
      })}

      <Modal open={editing !== null} title={editingRow ? 'Edit Distributor' : 'Add Distributor'} onClose={() => setEditing(null)}>
        <FormGrid onSubmit={onSubmit}>
          <Field label="Company Name" required><Input name="company_name" required defaultValue={editingRow?.company_name} /></Field>
          <Field label="Contact Name"><Input name="contact_name" defaultValue={editingRow?.contact_name ?? ''} /></Field>
          <Field label="Email" required><Input name="email" type="email" required defaultValue={editingRow?.email} /></Field>
          <Field label="Phone"><Input name="phone" defaultValue={editingRow?.phone ?? ''} /></Field>
          <Field label="Territory"><Input name="territory" defaultValue={editingRow?.territory ?? ''} /></Field>
          <Field label="Status">
            <Select name="status" defaultValue={editingRow?.status ?? 'pending'}>
              <option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option>
            </Select>
          </Field>
          <Field label="Notes">
            <Textarea name="notes" rows={4} defaultValue={editingRow?.notes ?? ''} />
            <FormNote>Approved distributors appear on the public finder using the city / ZIP stored in these details.</FormNote>
          </Field>
          <ModalActions>
            <AdminButton onClick={() => setEditing(null)}>Cancel</AdminButton>
            <AdminButton type="submit" variant="primary">Save</AdminButton>
          </ModalActions>
        </FormGrid>
      </Modal>
    </>
  );
}
