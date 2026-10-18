import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Layers, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { Badge, Button, Card, Field, Input, Modal, Select, Spinner, Switch, Textarea, useUi } from '@/components/ui';
import { useCatalog, useSaveCatalog } from '@/lib/api';
import { catalogStats, cloneCatalog } from '@/lib/catalog';
import { inr, makeId } from '@/lib/format';
import type { CatalogCategory, CatalogItem, CatalogSubcategory, PricingType } from '@/lib/types';

type ModalState =
  | { kind: 'category'; category?: CatalogCategory }
  | { kind: 'subcategory'; categoryId: string; subcategory?: CatalogSubcategory }
  | { kind: 'service'; categoryId: string; subcategoryId: string; service?: CatalogItem }
  | null;

const PRICING: Record<PricingType, string> = { perPerson: 'Per guest (per plate)', fixed: 'Fixed price', perUnit: 'Per unit (with quantity)' };
const unitLabel = (t: PricingType) => (t === 'perPerson' ? '/ guest' : t === 'perUnit' ? '/ unit' : 'fixed');

function ServiceForm({ state, onSave, onClose }: { state: Extract<ModalState, { kind: 'service' }>; onSave: (s: CatalogItem) => void; onClose: () => void }) {
  const s = state.service;
  const [name, setName] = useState(s?.name ?? '');
  const [description, setDescription] = useState(s?.description ?? '');
  const [price, setPrice] = useState(String(s?.price ?? ''));
  const [type, setType] = useState<PricingType>(s?.pricingType ?? 'fixed');
  const [min, setMin] = useState(String(s?.minQuantity ?? 1));
  const [max, setMax] = useState(String(s?.maxQuantity ?? 10));
  const [error, setError] = useState('');

  const submit = () => {
    const p = Number(price);
    if (!name.trim()) return setError('Enter a service name.');
    if (!Number.isFinite(p) || p < 0) return setError('Enter a valid price.');
    const lo = Math.max(1, Math.floor(Number(min) || 1));
    const hi = Math.max(lo, Math.floor(Number(max) || lo));
    onSave({
      id: s?.id ?? makeId('svc', name), name: name.trim(), description: description.trim(), categoryId: state.categoryId, subcategoryId: state.subcategoryId,
      price: p, pricingType: type, active: s?.active ?? true, minQuantity: type === 'perUnit' ? lo : 1, maxQuantity: type === 'perUnit' ? hi : 1,
    });
  };
  return (
    <Modal title={s ? 'Edit service' : 'Add service'} eyebrow="Catalog" onClose={onClose} footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button variant="gold" onClick={submit}>Save service</Button></>}>
      <div className="space-y-4">
        <Field label="Service name" required><Input value={name} onChange={(e) => setName(e.target.value)} autoFocus /></Field>
        <Field label="Description"><Textarea value={description} onChange={(e) => setDescription(e.target.value)} className="min-h-20" /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Price (₹)" required><Input type="number" min={0} value={price} onChange={(e) => setPrice(e.target.value)} /></Field>
          <Field label="Pricing type"><Select value={type} onChange={(e) => setType(e.target.value as PricingType)}>{(Object.keys(PRICING) as PricingType[]).map((k) => <option key={k} value={k}>{PRICING[k]}</option>)}</Select></Field>
        </div>
        {type === 'perUnit' && <div className="grid grid-cols-2 gap-4"><Field label="Minimum quantity"><Input type="number" min={1} value={min} onChange={(e) => setMin(e.target.value)} /></Field><Field label="Maximum quantity"><Input type="number" min={1} value={max} onChange={(e) => setMax(e.target.value)} /></Field></div>}
        {error && <p role="alert" className="text-sm text-error">{error}</p>}
      </div>
    </Modal>
  );
}

function NameForm({ title, eyebrow, name: initial, description: initialDesc, withDescription, onSave, onClose }: { title: string; eyebrow: string; name: string; description?: string; withDescription?: boolean; onSave: (name: string, description: string) => void; onClose: () => void }) {
  const [name, setName] = useState(initial);
  const [description, setDescription] = useState(initialDesc ?? '');
  return (
    <Modal title={title} eyebrow={eyebrow} onClose={onClose} width="max-w-md" footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button variant="gold" disabled={!name.trim()} onClick={() => onSave(name.trim(), description.trim())}>Save</Button></>}>
      <div className="space-y-4">
        <Field label="Name" required><Input value={name} onChange={(e) => setName(e.target.value)} autoFocus /></Field>
        {withDescription && <Field label="Description"><Textarea value={description} onChange={(e) => setDescription(e.target.value)} className="min-h-20" /></Field>}
      </div>
    </Modal>
  );
}

export function CatalogPage() {
  const { data, isLoading } = useCatalog();
  const save = useSaveCatalog();
  const { toast, confirm } = useUi();
  const [catalog, setCatalog] = useState<CatalogCategory[]>([]);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [modal, setModal] = useState<ModalState>(null);

  useEffect(() => { if (data && !save.isPending) setCatalog(data); }, [data, save.isPending]);

  const commit = (next: CatalogCategory[]) => {
    setCatalog(next);
    save.mutate(next, { onSuccess: () => toast('Catalog saved.'), onError: (e) => toast(e.message, 'error') });
  };
  const patchCat = (id: string, fn: (c: CatalogCategory) => CatalogCategory) => commit(catalog.map((c) => (c.id === id ? fn(c) : c)));
  const move = (id: string, dir: -1 | 1) => {
    const i = catalog.findIndex((c) => c.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= catalog.length) return;
    const next = [...catalog];
    [next[i], next[j]] = [next[j], next[i]];
    commit(next);
  };

  if (isLoading) return <Spinner label="Loading catalog" />;
  const stats = catalogStats(catalog);

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h2 className="font-display text-2xl font-semibold text-text">Service catalog</h2>
          <p className="mt-1 text-sm text-text-secondary">{stats.categories} categories · {stats.services} services · {stats.active} active. Changes appear in the estimator immediately.</p>
        </div>
        <div className="flex gap-3">
          <Button variant="ghost" onClick={async () => { if (await confirm({ title: 'Restore the starter catalog?', text: 'This replaces your whole catalog with the default Eventora menu. Saved bills are not changed.', confirmLabel: 'Restore', danger: true })) commit(cloneCatalog()); }}><RotateCcw size={15} /> Restore defaults</Button>
          <Button variant="gold" onClick={() => setModal({ kind: 'category' })}><Plus size={16} /> Add category</Button>
        </div>
      </div>

      <div className="space-y-4">
        {catalog.map((cat, ci) => {
          const isOpen = open[cat.id] ?? false;
          return (
            <Card key={cat.id}>
              <div className="flex items-center gap-3 p-4 sm:p-5">
                <button type="button" onClick={() => setOpen((o) => ({ ...o, [cat.id]: !isOpen }))} aria-label={isOpen ? 'Collapse' : 'Expand'} aria-expanded={isOpen} className="grid size-10 shrink-0 place-items-center rounded-xl bg-input text-gold">{isOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />}</button>
                <div className="min-w-0 flex-1"><h3 className="truncate text-base font-semibold text-text">{cat.name}</h3><p className="truncate text-xs text-text-secondary">{cat.description || 'No description'} · {cat.subcategories.reduce((a, s) => a + s.items.length, 0)} services</p></div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" disabled={ci === 0} onClick={() => move(cat.id, -1)} aria-label="Move up"><ArrowUp size={14} /></Button>
                  <Button variant="ghost" size="sm" disabled={ci === catalog.length - 1} onClick={() => move(cat.id, 1)} aria-label="Move down"><ArrowDown size={14} /></Button>
                  <Button variant="ghost" size="sm" onClick={() => setModal({ kind: 'category', category: cat })} aria-label="Edit category"><Pencil size={14} /></Button>
                  <Button variant="ghost" size="sm" onClick={async () => { if (await confirm({ title: `Delete ${cat.name}?`, text: 'All of its sub-categories and services are removed from the catalog.', confirmLabel: 'Delete', danger: true })) commit(catalog.filter((c) => c.id !== cat.id)); }} aria-label="Delete category"><Trash2 size={14} className="text-error" /></Button>
                </div>
              </div>
              {isOpen && (
                <div className="space-y-4 border-t border-border/70 p-4 sm:p-5">
                  {cat.subcategories.map((sub) => (
                    <div key={sub.id} className="rounded-xl border border-border bg-input/40">
                      <div className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-3">
                        <h4 className="text-sm font-semibold text-text">{sub.name}</h4>
                        <div className="flex items-center gap-1">
                          <Button variant="soft" size="sm" onClick={() => setModal({ kind: 'service', categoryId: cat.id, subcategoryId: sub.id })}><Plus size={13} /> Service</Button>
                          <Button variant="ghost" size="sm" onClick={() => setModal({ kind: 'subcategory', categoryId: cat.id, subcategory: sub })} aria-label="Rename"><Pencil size={13} /></Button>
                          <Button variant="ghost" size="sm" onClick={async () => { if (await confirm({ title: `Delete ${sub.name}?`, text: 'Its services are removed from the catalog.', confirmLabel: 'Delete', danger: true })) patchCat(cat.id, (c) => ({ ...c, subcategories: c.subcategories.filter((s) => s.id !== sub.id) })); }} aria-label="Delete sub-category"><Trash2 size={13} className="text-error" /></Button>
                        </div>
                      </div>
                      {sub.items.length === 0 ? <p className="px-4 py-4 text-sm text-text-secondary">No services yet.</p> : (
                        <ul className="divide-y divide-border/50">
                          {sub.items.map((svc) => (
                            <li key={svc.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                              <div className="min-w-0 flex-1"><p className={`truncate text-sm font-medium ${svc.active ? 'text-text' : 'text-text-disabled line-through'}`}>{svc.name}</p><p className="truncate text-xs text-text-secondary">{svc.description}</p></div>
                              <Badge>{inr(svc.price)} {unitLabel(svc.pricingType)}</Badge>
                              <div className="w-28"><Switch checked={svc.active} onChange={(v) => patchCat(cat.id, (c) => ({ ...c, subcategories: c.subcategories.map((s) => (s.id === sub.id ? { ...s, items: s.items.map((i) => (i.id === svc.id ? { ...i, active: v } : i)) } : s)) }))} label={svc.active ? 'Active' : 'Hidden'} /></div>
                              <Button variant="ghost" size="sm" onClick={() => setModal({ kind: 'service', categoryId: cat.id, subcategoryId: sub.id, service: svc })} aria-label="Edit service"><Pencil size={13} /></Button>
                              <Button variant="ghost" size="sm" onClick={async () => { if (await confirm({ title: `Delete ${svc.name}?`, confirmLabel: 'Delete', danger: true })) patchCat(cat.id, (c) => ({ ...c, subcategories: c.subcategories.map((s) => (s.id === sub.id ? { ...s, items: s.items.filter((i) => i.id !== svc.id) } : s)) })); }} aria-label="Delete service"><Trash2 size={13} className="text-error" /></Button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                  <Button variant="outline" size="sm" onClick={() => setModal({ kind: 'subcategory', categoryId: cat.id })}><Plus size={14} /> Add sub-category</Button>
                </div>
              )}
            </Card>
          );
        })}
        {catalog.length === 0 && <Card className="p-12 text-center"><Layers className="mx-auto text-gold" /><p className="mt-3 text-text">Your catalog is empty.</p></Card>}
      </div>

      {modal?.kind === 'category' && <NameForm title={modal.category ? 'Edit category' : 'Add category'} eyebrow="Catalog" name={modal.category?.name ?? ''} description={modal.category?.description} withDescription onClose={() => setModal(null)}
        onSave={(name, description) => { if (modal.category) commit(catalog.map((c) => (c.id === modal.category?.id ? { ...c, name, description } : c))); else commit([...catalog, { id: makeId('cat', name), name, description, subcategories: [] }]); setModal(null); }} />}
      {modal?.kind === 'subcategory' && <NameForm title={modal.subcategory ? 'Rename sub-category' : 'Add sub-category'} eyebrow="Catalog" name={modal.subcategory?.name ?? ''} onClose={() => setModal(null)}
        onSave={(name) => { patchCat(modal.categoryId, (c) => ({ ...c, subcategories: modal.subcategory ? c.subcategories.map((s) => (s.id === modal.subcategory?.id ? { ...s, name } : s)) : [...c.subcategories, { id: makeId('sub', name), name, items: [] }] })); setModal(null); }} />}
      {modal?.kind === 'service' && <ServiceForm state={modal} onClose={() => setModal(null)}
        onSave={(svc) => { patchCat(modal.categoryId, (c) => ({ ...c, subcategories: c.subcategories.map((s) => (s.id === modal.subcategoryId ? { ...s, items: modal.service ? s.items.map((i) => (i.id === svc.id ? svc : i)) : [...s.items, svc] } : s)) })); setModal(null); }} />}
    </div>
  );
}
