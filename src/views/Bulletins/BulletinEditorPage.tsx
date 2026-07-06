import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, Save, Globe, Eye, EyeOff, Upload, Plus, Trash2,
  ChevronUp, ChevronDown, Type, Image, BarChart2, ListCollapse,
  PlusCircle, X, GripVertical, LayoutGrid, Send, Quote, Minus, Video, Tag, Link2,
} from 'lucide-react';
import { toast } from 'sonner';
import { bulletinService } from '@/services/bulletinService';
import { useAuth } from '@/hooks/useAuth';
import { BulletinShareModal } from './BulletinShareModal';
import type {
  Bulletin, BulletinSection, BulletinStatus,
  TextSection, ImageSection, StatsSection, AccordionSection, CardsSection,
  QuoteSection, DividerSection, VideoSection, LinksSection, LinkItem,
  StatItem, AccordionItem, CardItem,
} from '@/models/types/Bulletin';

// ── Inline preview renderer (shared with BulletinViewPage) ───────────────────
import { BulletinInlinePreview } from './BulletinInlinePreview';

const CATEGORIES = ['Bienestar', 'Cultura', 'Noticias', 'Formación', 'Sostenibilidad', 'Otro'];
const HERO_COLORS = [
  { label: 'Verde',   value: 'linear-gradient(135deg, #006330, #7BCB6A)' },
  { label: 'Azul',    value: 'linear-gradient(135deg, #1F8FBF, #5BB3D9)' },
  { label: 'Violeta', value: 'linear-gradient(135deg, #7C3AED, #C084FC)' },
  { label: 'Rojo',    value: 'linear-gradient(135deg, #DC2626, #F87171)' },
  { label: 'Naranja', value: 'linear-gradient(135deg, #D97706, #FCD34D)' },
  { label: 'Gris',    value: 'linear-gradient(135deg, #374151, #9CA3AF)' },
];

function uid() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }

// ── Section editors ────────────────────────────────────────────────────────────

const FONT_SIZES: { value: TextSection['fontSize']; label: string }[] = [
  { value: 'sm',   label: 'S'   },
  { value: 'base', label: 'M'   },
  { value: 'lg',   label: 'L'   },
  { value: 'xl',   label: 'XL'  },
  { value: '2xl',  label: 'XXL' },
];

function TextEditor({ section, onChange }: { section: TextSection; onChange: (s: TextSection) => void }) {
  const taRef = useRef<HTMLTextAreaElement>(null);

  const applyBold = () => {
    const ta = taRef.current; if (!ta) return;
    const { selectionStart: s, selectionEnd: e, value } = ta;
    const next = value.slice(0, s) + '**' + value.slice(s, e) + '**' + value.slice(e);
    onChange({ ...section, content: next });
    setTimeout(() => { ta.focus(); ta.setSelectionRange(s + 2, e + 2); }, 0);
  };

  const activeSize = section.fontSize || 'base';

  return (
    <div className="space-y-3">
      <input
        className="w-full border rounded-lg px-3 py-2 text-sm"
        placeholder="Título de la sección (opcional)"
        value={section.title || ''}
        onChange={e => onChange({ ...section, title: e.target.value })}
      />
      <div className="border rounded-lg overflow-hidden">
        <div className="flex items-center gap-1 px-2 py-1.5 bg-gray-50 border-b flex-wrap">
          <button type="button" onClick={applyBold} title="Negrilla (selecciona texto primero)"
            className="px-2 py-0.5 text-xs font-bold border rounded bg-white hover:bg-gray-100 text-gray-700 transition-colors">
            N
          </button>
          <span className="w-px h-4 bg-gray-200 mx-1" />
          {FONT_SIZES.map(sz => (
            <button
              key={sz.value}
              type="button"
              onClick={() => onChange({ ...section, fontSize: sz.value })}
              className={`px-2 py-0.5 text-xs rounded border transition-colors ${
                activeSize === sz.value
                  ? 'bg-[#008C3C] text-white border-[#008C3C]'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-100'
              }`}
            >
              {sz.label}
            </button>
          ))}
          <span className="text-[10px] text-gray-400 ml-1 hidden sm:inline">Tamaño de letra</span>
        </div>
        <textarea
          ref={taRef}
          className="w-full px-3 py-2 text-sm min-h-[120px] resize-y focus:outline-none"
          placeholder="Escribe el contenido aquí... usa **texto** para negrilla"
          value={section.content}
          onChange={e => onChange({ ...section, content: e.target.value })}
        />
      </div>
    </div>
  );
}

function ImageUploadField({
  value, onChange, onUpload, placeholder,
}: {
  value: string; onChange: (url: string) => void;
  onUpload: (file: File) => Promise<string>; placeholder: string;
}) {
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setUploading(true);
    try { onChange(await onUpload(file)); }
    catch { toast.error('Error subiendo imagen'); }
    finally { setUploading(false); e.target.value = ''; }
  };
  return (
    <div className="flex gap-2">
      <input className="flex-1 border rounded px-2 py-1.5 text-sm" placeholder={placeholder}
        value={value} onChange={e => onChange(e.target.value)} />
      <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
        className="px-2 py-1.5 border rounded text-sm text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50">
        <Upload className="w-4 h-4" />
      </button>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
    </div>
  );
}

function ImageEditor({ section, onChange, onUpload }: {
  section: ImageSection; onChange: (s: ImageSection) => void; onUpload: (file: File) => Promise<string>;
}) {
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setUploading(true);
    try { onChange({ ...section, imageUrl: await onUpload(file) }); }
    catch { toast.error('Error subiendo imagen'); }
    finally { setUploading(false); e.target.value = ''; }
  };
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input className="flex-1 border rounded-lg px-3 py-2 text-sm" placeholder="URL de la imagen"
          value={section.imageUrl} onChange={e => onChange({ ...section, imageUrl: e.target.value })} />
        <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
          className="flex items-center gap-1.5 px-3 py-2 border rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50">
          <Upload className="w-4 h-4" />{uploading ? 'Subiendo...' : 'Subir'}
        </button>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
      </div>
      {section.imageUrl && (
        <img src={section.imageUrl} alt="" className="w-full max-h-48 object-cover rounded-lg" />
      )}
      <input className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Pie de imagen (opcional)"
        value={section.caption || ''} onChange={e => onChange({ ...section, caption: e.target.value })} />
    </div>
  );
}

function StatsEditor({ section, onChange }: { section: StatsSection; onChange: (s: StatsSection) => void }) {
  const update = (i: number, stat: StatItem) => {
    const stats = [...section.stats]; stats[i] = stat; onChange({ ...section, stats });
  };
  return (
    <div className="space-y-3">
      <input className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Título (opcional)"
        value={section.title || ''} onChange={e => onChange({ ...section, title: e.target.value })} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {section.stats.map((stat, i) => (
          <div key={i} className="border rounded-lg p-3 space-y-2 relative">
            <button type="button" onClick={() => onChange({ ...section, stats: section.stats.filter((_, idx) => idx !== i) })}
              className="absolute top-2 right-2 text-gray-400 hover:text-red-500">
              <X className="w-3.5 h-3.5" />
            </button>
            <input className="w-full border rounded px-2 py-1.5 text-sm font-bold" placeholder="Valor (ej: 85%)"
              value={stat.value} onChange={e => update(i, { ...stat, value: e.target.value })} />
            <input className="w-full border rounded px-2 py-1.5 text-sm" placeholder="Etiqueta"
              value={stat.label} onChange={e => update(i, { ...stat, label: e.target.value })} />
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500">Color:</label>
              <input type="color" value={stat.color || '#008C3C'}
                onChange={e => update(i, { ...stat, color: e.target.value })}
                className="w-8 h-8 rounded cursor-pointer border" />
            </div>
          </div>
        ))}
      </div>
      <button type="button"
        onClick={() => onChange({ ...section, stats: [...section.stats, { value: '', label: '', color: '#008C3C' }] })}
        className="flex items-center gap-1.5 text-sm text-[#008C3C] hover:underline">
        <PlusCircle className="w-4 h-4" /> Añadir estadística
      </button>
    </div>
  );
}

function AccordionEditor({ section, onChange, onUpload }: {
  section: AccordionSection; onChange: (s: AccordionSection) => void; onUpload: (file: File) => Promise<string>;
}) {
  const [expandedItem, setExpandedItem] = useState<string | null>(null);
  const updateItem = (id: string, item: AccordionItem) =>
    onChange({ ...section, items: section.items.map(x => x.id === id ? item : x) });
  const addItem = () => {
    const item: AccordionItem = { id: uid(), title: '', content: '' };
    onChange({ ...section, items: [...section.items, item] });
    setExpandedItem(item.id);
  };
  return (
    <div className="space-y-3">
      <input className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Título (opcional)"
        value={section.title || ''} onChange={e => onChange({ ...section, title: e.target.value })} />
      <div className="space-y-2">
        {section.items.map(item => (
          <div key={item.id} className="border rounded-lg overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2.5 cursor-pointer bg-gray-50 hover:bg-gray-100 transition-colors"
              onClick={() => setExpandedItem(expandedItem === item.id ? null : item.id)}>
              <GripVertical className="w-4 h-4 text-gray-300 flex-shrink-0" />
              <span className="flex-1 text-sm font-medium text-gray-700">{item.title || 'Sin título'}</span>
              <button type="button" onClick={e => { e.stopPropagation(); onChange({ ...section, items: section.items.filter(x => x.id !== item.id) }); }}
                className="text-gray-400 hover:text-red-500 p-1"><X className="w-3.5 h-3.5" /></button>
            </div>
            {expandedItem === item.id && (
              <div className="p-3 space-y-2 border-t">
                <input className="w-full border rounded px-2 py-1.5 text-sm" placeholder="Título del elemento"
                  value={item.title} onChange={e => updateItem(item.id, { ...item, title: e.target.value })} />
                <textarea className="w-full border rounded px-2 py-1.5 text-sm min-h-[80px] resize-y" placeholder="Contenido..."
                  value={item.content} onChange={e => updateItem(item.id, { ...item, content: e.target.value })} />
                <ImageUploadField value={item.imageUrl || ''} onChange={url => updateItem(item.id, { ...item, imageUrl: url })}
                  onUpload={onUpload} placeholder="Imagen (opcional)" />
              </div>
            )}
          </div>
        ))}
      </div>
      <button type="button" onClick={addItem} className="flex items-center gap-1.5 text-sm text-[#008C3C] hover:underline">
        <PlusCircle className="w-4 h-4" /> Añadir elemento
      </button>
    </div>
  );
}

function CardsEditor({ section, onChange, onUpload }: {
  section: CardsSection; onChange: (s: CardsSection) => void; onUpload: (file: File) => Promise<string>;
}) {
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  const updateCard = (id: string, card: CardItem) =>
    onChange({ ...section, items: section.items.map(x => x.id === id ? card : x) });
  const addCard = () => {
    const card: CardItem = { id: uid(), title: '', description: '', emoji: '✨', color: '#008C3C' };
    onChange({ ...section, items: [...section.items, card] });
    setExpandedCard(card.id);
  };
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-gray-500 mb-1 block">Título (opcional)</label>
          <input className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Ej: Nuestros pilares"
            value={section.title || ''} onChange={e => onChange({ ...section, title: e.target.value })} />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-500 mb-1 block">Columnas</label>
          <select className="w-full border rounded-lg px-3 py-2 text-sm"
            value={section.columns || 3}
            onChange={e => onChange({ ...section, columns: Number(e.target.value) as 2 | 3 | 4 })}>
            <option value={2}>2 columnas</option>
            <option value={3}>3 columnas</option>
            <option value={4}>4 columnas</option>
          </select>
        </div>
      </div>
      <div>
        <label className="text-xs font-medium text-gray-500 mb-1 block">Estilo</label>
        <div className="flex gap-2">
          {(['minimal', 'colored', 'image'] as const).map(s => (
            <button key={s} type="button"
              onClick={() => onChange({ ...section, style: s })}
              className={`px-3 py-1.5 text-xs rounded-lg border font-medium transition-colors ${section.style === s || (!section.style && s === 'minimal') ? 'bg-[#008C3C] text-white border-[#008C3C]' : 'text-gray-600 hover:bg-gray-50'}`}>
              {s === 'minimal' ? 'Minimalista' : s === 'colored' ? 'Con color' : 'Con imagen'}
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        {section.items.map((card, i) => (
          <div key={card.id} className="border rounded-lg overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2.5 cursor-pointer bg-gray-50 hover:bg-gray-100 transition-colors"
              onClick={() => setExpandedCard(expandedCard === card.id ? null : card.id)}>
              <span className="text-lg">{card.emoji || '📌'}</span>
              <span className="flex-1 text-sm font-medium text-gray-700">{card.title || `Tarjeta ${i + 1}`}</span>
              <button type="button" onClick={e => { e.stopPropagation(); onChange({ ...section, items: section.items.filter(x => x.id !== card.id) }); }}
                className="text-gray-400 hover:text-red-500 p-1"><X className="w-3.5 h-3.5" /></button>
            </div>
            {expandedCard === card.id && (
              <div className="p-3 space-y-2 border-t">
                <div className="flex gap-2">
                  <div className="w-20">
                    <label className="text-xs text-gray-500 mb-1 block">Emoji</label>
                    <input className="w-full border rounded px-2 py-1.5 text-sm text-center" placeholder="✨"
                      value={card.emoji || ''} onChange={e => updateCard(card.id, { ...card, emoji: e.target.value })} />
                  </div>
                  <div className="flex-1">
                    <label className="text-xs text-gray-500 mb-1 block">Título</label>
                    <input className="w-full border rounded px-2 py-1.5 text-sm" placeholder="Título de la tarjeta"
                      value={card.title} onChange={e => updateCard(card.id, { ...card, title: e.target.value })} />
                  </div>
                  <div className="w-16">
                    <label className="text-xs text-gray-500 mb-1 block">Color</label>
                    <input type="color" value={card.color || '#008C3C'}
                      onChange={e => updateCard(card.id, { ...card, color: e.target.value })}
                      className="w-full h-9 rounded cursor-pointer border" />
                  </div>
                </div>
                <textarea className="w-full border rounded px-2 py-1.5 text-sm min-h-[70px] resize-y" placeholder="Descripción de la tarjeta..."
                  value={card.description} onChange={e => updateCard(card.id, { ...card, description: e.target.value })} />
                <ImageUploadField value={card.imageUrl || ''} onChange={url => updateCard(card.id, { ...card, imageUrl: url })}
                  onUpload={onUpload} placeholder="Foto (opcional)" />
              </div>
            )}
          </div>
        ))}
      </div>
      <button type="button" onClick={addCard} className="flex items-center gap-1.5 text-sm text-[#008C3C] hover:underline">
        <PlusCircle className="w-4 h-4" /> Añadir tarjeta
      </button>
    </div>
  );
}

function QuoteEditor({ section, onChange }: { section: QuoteSection; onChange: (s: QuoteSection) => void }) {
  return (
    <div className="space-y-3">
      <textarea
        className="w-full border rounded-lg px-3 py-2 text-sm min-h-[100px] resize-y"
        placeholder="Escribe la cita destacada..."
        value={section.text}
        onChange={e => onChange({ ...section, text: e.target.value })}
      />
      <input
        className="w-full border rounded-lg px-3 py-2 text-sm"
        placeholder="Autor / fuente (opcional)"
        value={section.author || ''}
        onChange={e => onChange({ ...section, author: e.target.value })}
      />
      <div className="flex items-center gap-2">
        <label className="text-xs text-gray-500">Color del borde:</label>
        <input type="color" value={section.color || '#008C3C'}
          onChange={e => onChange({ ...section, color: e.target.value })}
          className="w-8 h-8 rounded cursor-pointer border" />
      </div>
    </div>
  );
}

function DividerEditor({ section, onChange }: { section: DividerSection; onChange: (s: DividerSection) => void }) {
  return (
    <div>
      <label className="text-xs font-medium text-gray-500 mb-2 block">Estilo del separador</label>
      <div className="flex gap-3">
        {(['line', 'dots', 'wave'] as const).map(style => (
          <button key={style} type="button"
            onClick={() => onChange({ ...section, style })}
            className={`flex-1 py-3 rounded-lg border text-sm font-medium transition-colors ${section.style === style || (!section.style && style === 'line') ? 'bg-[#008C3C] text-white border-[#008C3C]' : 'text-gray-600 hover:bg-gray-50'}`}>
            {style === 'line' ? '— Línea' : style === 'dots' ? '··· Puntos' : '~ Onda'}
          </button>
        ))}
      </div>
    </div>
  );
}

function getVideoEmbedUrl(url: string): string | null {
  const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s]+)/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`;
  const vm = url.match(/vimeo\.com\/(\d+)/);
  if (vm) return `https://player.vimeo.com/video/${vm[1]}`;
  return null;
}

function VideoEditor({ section, onChange }: { section: VideoSection; onChange: (s: VideoSection) => void }) {
  const embedUrl = getVideoEmbedUrl(section.url);
  return (
    <div className="space-y-3">
      <input
        className="w-full border rounded-lg px-3 py-2 text-sm"
        placeholder="Título (opcional)"
        value={section.title || ''}
        onChange={e => onChange({ ...section, title: e.target.value })}
      />
      <input
        className="w-full border rounded-lg px-3 py-2 text-sm"
        placeholder="URL de YouTube o Vimeo (ej: https://youtu.be/...)"
        value={section.url}
        onChange={e => onChange({ ...section, url: e.target.value })}
      />
      {section.url && !embedUrl && (
        <p className="text-xs text-amber-600">⚠ URL no reconocida. Usa un link de YouTube o Vimeo.</p>
      )}
      {embedUrl && (
        <div className="rounded-xl overflow-hidden aspect-video bg-black">
          <iframe src={embedUrl} className="w-full h-full" allowFullScreen title="preview" />
        </div>
      )}
      <input
        className="w-full border rounded-lg px-3 py-2 text-sm"
        placeholder="Descripción del video (opcional)"
        value={section.caption || ''}
        onChange={e => onChange({ ...section, caption: e.target.value })}
      />
    </div>
  );
}

function LinksEditor({ section, onChange, onUpload }: {
  section: LinksSection; onChange: (s: LinksSection) => void; onUpload: (file: File) => Promise<string>;
}) {
  const [expandedItem, setExpandedItem] = useState<string | null>(null);
  const updateItem = (id: string, item: LinkItem) =>
    onChange({ ...section, items: section.items.map(x => x.id === id ? item : x) });
  const addItem = () => {
    const item: LinkItem = { id: uid(), label: '', url: '' };
    onChange({ ...section, items: [...section.items, item] });
    setExpandedItem(item.id);
  };
  return (
    <div className="space-y-3">
      <input className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Título de la sección (opcional)"
        value={section.title || ''} onChange={e => onChange({ ...section, title: e.target.value })} />
      <div className="space-y-2">
        {section.items.map(item => (
          <div key={item.id} className="border rounded-lg overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2.5 cursor-pointer bg-gray-50 hover:bg-gray-100 transition-colors"
              onClick={() => setExpandedItem(expandedItem === item.id ? null : item.id)}>
              <GripVertical className="w-4 h-4 text-gray-300 flex-shrink-0" />
              <span className="flex-1 text-sm font-medium text-gray-700 truncate">{item.label || 'Sin título'}</span>
              <button type="button" onClick={e => { e.stopPropagation(); onChange({ ...section, items: section.items.filter(x => x.id !== item.id) }); }}
                className="text-gray-400 hover:text-red-500 p-1"><X className="w-3.5 h-3.5" /></button>
            </div>
            {expandedItem === item.id && (
              <div className="p-3 space-y-2 border-t">
                <input className="w-full border rounded px-2 py-1.5 text-sm" placeholder="Texto del link *"
                  value={item.label} onChange={e => updateItem(item.id, { ...item, label: e.target.value })} />
                <input className="w-full border rounded px-2 py-1.5 text-sm" placeholder="URL (https://...) *"
                  value={item.url} onChange={e => updateItem(item.id, { ...item, url: e.target.value })} />
                <input className="w-full border rounded px-2 py-1.5 text-sm" placeholder="Descripción (opcional)"
                  value={item.description || ''} onChange={e => updateItem(item.id, { ...item, description: e.target.value })} />
                <ImageUploadField value={item.imageUrl || ''} onChange={url => updateItem(item.id, { ...item, imageUrl: url })}
                  onUpload={onUpload} placeholder="Imagen (opcional)" />
              </div>
            )}
          </div>
        ))}
      </div>
      <button type="button" onClick={addItem} className="flex items-center gap-1.5 text-sm text-[#008C3C] hover:underline">
        <PlusCircle className="w-4 h-4" /> Añadir link
      </button>
    </div>
  );
}

// ── Section block wrapper ─────────────────────────────────────────────────────

const SECTION_META = [
  { type: 'text',      label: 'Texto',         icon: Type },
  { type: 'image',     label: 'Imagen',        icon: Image },
  { type: 'stats',     label: 'Estadísticas',  icon: BarChart2 },
  { type: 'accordion', label: 'Acordeón',      icon: ListCollapse },
  { type: 'cards',     label: 'Tarjetas',      icon: LayoutGrid },
  { type: 'quote',     label: 'Cita',          icon: Quote },
  { type: 'divider',   label: 'Separador',     icon: Minus },
  { type: 'video',     label: 'Video',         icon: Video },
  { type: 'links',     label: 'Links',         icon: Link2 },
] as const;

const SECTION_ICONS = Object.fromEntries(SECTION_META.map(m => [m.type, m.icon]));
const SECTION_LABELS = Object.fromEntries(SECTION_META.map(m => [m.type, m.label]));

function SectionBlock({ section, index, total, onChange, onRemove, onMoveUp, onMoveDown, onUpload }: {
  section: BulletinSection; index: number; total: number;
  onChange: (s: BulletinSection) => void; onRemove: () => void;
  onMoveUp: () => void; onMoveDown: () => void; onUpload: (file: File) => Promise<string>;
}) {
  const Icon = SECTION_ICONS[section.type] || Type;
  return (
    <div className="border border-gray-200 rounded-xl bg-white overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 bg-gray-50 border-b">
        <Icon className="w-4 h-4 text-gray-400 flex-shrink-0" />
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex-1">
          {SECTION_LABELS[section.type]}
        </span>
        <select
          value={section.animation || ''}
          onChange={e => onChange({ ...section, animation: e.target.value })}
          className="text-[11px] border rounded px-1.5 py-0.5 text-gray-500 bg-white cursor-pointer"
          title="Animación de entrada"
        >
          <option value="fade-up">↑ Subir</option>
          <option value="fade-in">✦ Desvanecer</option>
          <option value="slide-left">← Izquierda</option>
          <option value="slide-right">→ Derecha</option>
          <option value="zoom">⊕ Zoom</option>
          <option value="">Sin animación</option>
        </select>
        <div className="flex items-center gap-1">
          <button type="button" onClick={onMoveUp} disabled={index === 0}
            className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30 rounded">
            <ChevronUp className="w-4 h-4" />
          </button>
          <button type="button" onClick={onMoveDown} disabled={index === total - 1}
            className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30 rounded">
            <ChevronDown className="w-4 h-4" />
          </button>
          <button type="button" onClick={onRemove} className="p-1 text-gray-400 hover:text-red-500 rounded">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
      <div className="p-4">
        {section.type === 'text'      && <TextEditor      section={section} onChange={s => onChange(s)} />}
        {section.type === 'image'     && <ImageEditor     section={section} onChange={s => onChange(s)} onUpload={onUpload} />}
        {section.type === 'stats'     && <StatsEditor     section={section} onChange={s => onChange(s)} />}
        {section.type === 'accordion' && <AccordionEditor section={section} onChange={s => onChange(s)} onUpload={onUpload} />}
        {section.type === 'cards'     && <CardsEditor     section={section} onChange={s => onChange(s)} onUpload={onUpload} />}
        {section.type === 'quote'     && <QuoteEditor     section={section} onChange={s => onChange(s)} />}
        {section.type === 'divider'   && <DividerEditor   section={section} onChange={s => onChange(s)} />}
        {section.type === 'video'     && <VideoEditor     section={section} onChange={s => onChange(s)} />}
        {section.type === 'links'     && <LinksEditor     section={section} onChange={s => onChange(s)} onUpload={onUpload} />}
      </div>
    </div>
  );
}

// ── Main editor ───────────────────────────────────────────────────────────────

export function BulletinEditorPage() {
  const { id }    = useParams<{ id?: string }>();
  const navigate  = useNavigate();
  const { user }  = useAuth();

  const [loading,      setLoading]      = useState(!!id);
  const [saving,       setSaving]       = useState(false);
  const [autoSaving,   setAutoSaving]   = useState(false);
  const [showPreview,  setShowPreview]  = useState(false);
  const [showShare,    setShowShare]    = useState(false);
  const [lastSaved,    setLastSaved]    = useState<Date | null>(null);
  const [isDirty,      setIsDirty]      = useState(false);
  const savedId = useRef<string | null>(id || null);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [title,        setTitle]        = useState('');
  const [subtitle,     setSubtitle]     = useState('');
  const [category,     setCategory]     = useState('');
  const [introText,    setIntroText]    = useState('');
  const [heroImageUrl, setHeroImageUrl] = useState('');
  const [heroColor,    setHeroColor]    = useState(HERO_COLORS[0].value);
  const [sections,     setSections]     = useState<BulletinSection[]>([]);
  const [tags,         setTags]         = useState<string[]>([]);
  const [tagInput,     setTagInput]     = useState('');
  const [heroUploading, setHeroUploading] = useState(false);
  const heroFileRef = useRef<HTMLInputElement>(null);

  const currentBulletin: Partial<Bulletin> = {
    title, subtitle, category, introText, heroImageUrl, heroColor, sections, tags,
  };

  useEffect(() => {
    if (!id) return;
    bulletinService.getById(id).then(b => {
      if (!b) { toast.error('Boletín no encontrado'); navigate('/boletines'); return; }
      setTitle(b.title); setSubtitle(b.subtitle || ''); setCategory(b.category || '');
      setIntroText(b.introText || ''); setHeroImageUrl(b.heroImageUrl || '');
      setHeroColor(b.heroColor || HERO_COLORS[0].value); setSections(b.sections || []);
      setTags(b.tags || []);
    }).finally(() => setLoading(false));
  }, [id]);

  // Auto-save draft after 5 seconds of inactivity
  const scheduleAutoSave = useCallback(() => {
    setIsDirty(true);
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(async () => {
      if (!title.trim()) return;
      setAutoSaving(true);
      try {
        const payload = {
          title: title.trim(), subtitle: subtitle.trim(), category,
          introText: introText.trim(), heroImageUrl, heroColor, sections, tags,
          status: 'draft' as const,
          createdBy: user?.email || '', createdByName: user?.email?.split('@')[0] || '',
        };
        if (savedId.current) {
          await bulletinService.update(savedId.current, payload);
        } else {
          const newId = await bulletinService.create(payload);
          savedId.current = newId;
          navigate(`/boletines/${newId}/editar`, { replace: true });
        }
        setLastSaved(new Date()); setIsDirty(false);
      } catch { /* silent fail for auto-save */ }
      finally { setAutoSaving(false); }
    }, 5000);
  }, [title, subtitle, category, introText, heroImageUrl, heroColor, sections, user, navigate]);

  useEffect(() => { if (!loading) scheduleAutoSave(); }, [title, subtitle, category, introText, heroImageUrl, heroColor, sections, tags]);
  useEffect(() => () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current); }, []);

  const pickColor = async (color: string) => {
    setHeroColor(color);
    if (!savedId.current) return;
    try {
      await bulletinService.update(savedId.current, { heroColor: color, heroImageUrl });
      setLastSaved(new Date()); setIsDirty(false);
    } catch {
      toast.error('No se pudo guardar el color, intenta con el botón Guardar');
    }
  };

  const uploadImage = async (file: File): Promise<string> => {
    return bulletinService.uploadImage(file, `${Date.now()}_${file.name.replace(/\s/g, '_')}`);
  };

  const handleHeroUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setHeroUploading(true);
    try { setHeroImageUrl(await uploadImage(file)); }
    catch { toast.error('Error subiendo imagen hero'); }
    finally { setHeroUploading(false); e.target.value = ''; }
  };

  const addSection = (type: BulletinSection['type']) => {
    const id = uid();
    let s: BulletinSection;
    if      (type === 'text')      s = { id, type, title: '', content: '' };
    else if (type === 'image')     s = { id, type, imageUrl: '', caption: '' };
    else if (type === 'stats')     s = { id, type, title: '', stats: [{ value: '', label: '', color: '#008C3C' }] };
    else if (type === 'accordion') s = { id, type, title: '', items: [{ id: uid(), title: '', content: '' }] };
    else if (type === 'cards')     s = { id, type, title: '', columns: 3, style: 'colored', items: [] };
    else if (type === 'quote')     s = { id, type, text: '', author: '', color: '#008C3C' };
    else if (type === 'divider')   s = { id, type, style: 'line' };
    else if (type === 'links')     s = { id, type, title: '', items: [] };
    else                           s = { id, type: 'video', title: '', url: '', caption: '' };
    setSections(prev => [...prev, s]);
  };

  const updateSection = (i: number, s: BulletinSection) =>
    setSections(prev => prev.map((x, idx) => idx === i ? s : x));
  const removeSection = (i: number) => setSections(prev => prev.filter((_, idx) => idx !== i));
  const moveSection = (i: number, dir: -1 | 1) => setSections(prev => {
    const arr = [...prev]; const t = i + dir;
    if (t < 0 || t >= arr.length) return arr;
    [arr[i], arr[t]] = [arr[t], arr[i]]; return arr;
  });

  const save = async (status: BulletinStatus) => {
    if (!title.trim()) { toast.error('El título es obligatorio'); return; }
    setSaving(true);
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    try {
      const payload = {
        title: title.trim(), subtitle: subtitle.trim(), category,
        introText: introText.trim(), heroImageUrl, heroColor, sections, tags, status,
        createdBy: user?.email || '', createdByName: user?.email?.split('@')[0] || '',
      };
      if (savedId.current) {
        await bulletinService.update(savedId.current, payload);
      } else {
        const newId = await bulletinService.create(payload);
        savedId.current = newId;
        navigate(`/boletines/${newId}/editar`, { replace: true });
      }
      setLastSaved(new Date()); setIsDirty(false);
      toast.success(status === 'published' ? 'Boletín publicado' : 'Borrador guardado');
    } catch { toast.error('Error guardando boletín'); }
    finally { setSaving(false); }
  };

  if (loading) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-4">
        {[1,2,3].map(i => <div key={i} className="h-24 bg-gray-100 animate-pulse rounded-xl" />)}
      </div>
    );
  }

  return (
    <div className={`flex h-full ${showPreview ? 'divide-x' : ''}`}>
      {/* ── Left: Editor ── */}
      <div className={`flex-1 overflow-y-auto p-6 ${showPreview ? 'max-w-[55%]' : 'max-w-4xl mx-auto'}`}>
        {/* Top bar */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/boletines')}
              className="flex items-center gap-2 text-gray-500 hover:text-gray-800 text-sm transition-colors">
              <ArrowLeft className="w-4 h-4" /> Volver
            </button>
            <div className="text-xs text-gray-400">
              {autoSaving ? (
                <span className="text-amber-500">Guardando borrador...</span>
              ) : isDirty ? (
                <span className="text-gray-400">Cambios sin guardar</span>
              ) : lastSaved ? (
                <span className="text-green-600">✓ Guardado {lastSaved.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}</span>
              ) : null}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={() => setShowPreview(v => !v)}
              className={`flex items-center gap-1.5 px-3 py-2 border rounded-lg text-sm transition-colors ${showPreview ? 'bg-gray-100 text-gray-800' : 'text-gray-600 hover:bg-gray-50'}`}>
              {showPreview ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              {showPreview ? 'Ocultar vista' : 'Vista previa'}
            </button>
            {savedId.current && (
              <button onClick={() => setShowShare(true)}
                className="flex items-center gap-1.5 px-3 py-2 border rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors">
                <Send className="w-4 h-4" /> Enviar
              </button>
            )}
            <button onClick={() => save('draft')} disabled={saving}
              className="flex items-center gap-1.5 px-3 py-2 border rounded-lg text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors">
              <Save className="w-4 h-4" />
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
            <button onClick={() => save('published')} disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 bg-[#008C3C] hover:bg-[#006C2F] text-white rounded-lg text-sm font-medium disabled:opacity-50 transition-colors">
              <Globe className="w-4 h-4" />
              {saving ? 'Publicando...' : 'Publicar'}
            </button>
          </div>
        </div>

        <div className="space-y-6">
          {/* Hero preview */}
          <div className="relative rounded-2xl overflow-hidden">
            {heroImageUrl ? (
              <img src={heroImageUrl} alt="" className="w-full block" />
            ) : (
              <div className="h-40"
                style={{ backgroundImage: heroColor || 'linear-gradient(135deg, #006330, #7BCB6A)' }} />
            )}
            <div className="absolute inset-0 bg-black/30" />
            <div className="absolute bottom-0 left-0 right-0 z-10 p-5 text-white">
              <p className="text-base font-bold">{title || 'Título del boletín'}</p>
              {subtitle && <p className="text-xs opacity-80">{subtitle}</p>}
            </div>
            <div className="absolute top-3 right-3 flex gap-2 z-10">
              <button type="button" onClick={() => heroFileRef.current?.click()} disabled={heroUploading}
                className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white/20 backdrop-blur-sm text-white text-xs rounded-lg hover:bg-white/30 border border-white/30">
                <Upload className="w-3 h-3" />{heroUploading ? 'Subiendo...' : 'Imagen'}
              </button>
              {heroImageUrl && (
                <button type="button" onClick={() => setHeroImageUrl('')}
                  className="px-2 py-1.5 bg-white/20 backdrop-blur-sm text-white text-xs rounded-lg hover:bg-white/30 border border-white/30">
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
            <input ref={heroFileRef} type="file" accept="image/*" className="hidden" onChange={handleHeroUpload} />
          </div>

          {/* Basic info */}
          <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4">
            <h2 className="text-sm font-semibold text-gray-700">Información general</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="text-xs font-medium text-gray-500 mb-1 block">Título *</label>
                <input className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#008C3C]/30"
                  placeholder="Ej: Bienestar Integral 2026" value={title} onChange={e => setTitle(e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Subtítulo</label>
                <input className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#008C3C]/30"
                  placeholder="Frase complementaria" value={subtitle} onChange={e => setSubtitle(e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Categoría</label>
                <select className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#008C3C]/30"
                  value={category} onChange={e => setCategory(e.target.value)}>
                  <option value="">Sin categoría</option>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
            {!heroImageUrl && (
              <div>
                <label className="text-xs font-medium text-gray-500 mb-2 block">Color de fondo</label>
                <div className="flex gap-2 flex-wrap">
                  {HERO_COLORS.map(c => (
                    <button key={c.value} type="button" onClick={() => pickColor(c.value)}
                      className={`w-8 h-8 rounded-full border-2 transition-all ${heroColor === c.value ? 'border-gray-700 scale-110' : 'border-transparent hover:scale-105'}`}
                      style={{ background: c.value }} title={c.label} />
                  ))}
                </div>
              </div>
            )}
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Texto de introducción</label>
              <textarea className="w-full border rounded-lg px-3 py-2 text-sm min-h-[80px] resize-y focus:outline-none focus:ring-2 focus:ring-[#008C3C]/30"
                placeholder="Descripción general del boletín..." value={introText} onChange={e => setIntroText(e.target.value)} />
            </div>

            {/* Tags */}
            <div>
              <label className="text-xs font-medium text-gray-500 mb-2 block flex items-center gap-1">
                <Tag className="w-3 h-3" /> Etiquetas
              </label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {tags.map(tag => (
                  <span key={tag} className="flex items-center gap-1 bg-[#008C3C]/10 text-[#008C3C] text-xs px-2.5 py-1 rounded-full font-medium">
                    #{tag}
                    <button type="button" onClick={() => setTags(prev => prev.filter(t => t !== tag))}
                      className="hover:text-red-500 transition-colors ml-0.5"><X className="w-3 h-3" /></button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  className="flex-1 border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#008C3C]/30"
                  placeholder="Nueva etiqueta (ej: bienestar)"
                  value={tagInput}
                  onChange={e => setTagInput(e.target.value.toLowerCase().replace(/\s+/g, '-'))}
                  onKeyDown={e => {
                    if ((e.key === 'Enter' || e.key === ',') && tagInput.trim()) {
                      e.preventDefault();
                      const t = tagInput.trim();
                      if (!tags.includes(t)) setTags(prev => [...prev, t]);
                      setTagInput('');
                    }
                  }}
                />
                <button type="button"
                  onClick={() => {
                    const t = tagInput.trim();
                    if (t && !tags.includes(t)) setTags(prev => [...prev, t]);
                    setTagInput('');
                  }}
                  className="px-3 py-1.5 border rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors">
                  <Plus className="w-4 h-4" />
                </button>
              </div>
              <p className="text-[11px] text-gray-400 mt-1">Presiona Enter o coma para agregar</p>
            </div>
          </div>

          {/* Sections */}
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-gray-700">Secciones de contenido</h2>
            {sections.length === 0 && (
              <div className="border-2 border-dashed border-gray-200 rounded-xl py-12 text-center text-gray-400 text-sm">
                Añade secciones abajo para construir el boletín
              </div>
            )}
            {sections.map((section, i) => (
              <SectionBlock key={section.id} section={section} index={i} total={sections.length}
                onChange={s => updateSection(i, s)} onRemove={() => removeSection(i)}
                onMoveUp={() => moveSection(i, -1)} onMoveDown={() => moveSection(i, 1)} onUpload={uploadImage} />
            ))}
            <div className="flex flex-wrap gap-2">
              {SECTION_META.map(({ type, label, icon: Icon }) => (
                <button key={type} type="button" onClick={() => addSection(type)}
                  className="flex items-center gap-1.5 px-3 py-2 border border-dashed border-gray-300 rounded-lg text-sm text-gray-600 hover:border-[#008C3C] hover:text-[#008C3C] transition-colors">
                  <Plus className="w-3.5 h-3.5" /><Icon className="w-3.5 h-3.5" />{label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Right: Live preview ── */}
      {showPreview && (
        <div className="w-[45%] flex-shrink-0 overflow-y-auto bg-gray-50">
          <div className="sticky top-0 z-10 bg-gray-100 border-b px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Vista previa en tiempo real
          </div>
          <BulletinInlinePreview bulletin={currentBulletin as any} />
        </div>
      )}

      {/* Share modal */}
      {showShare && savedId.current && (
        <BulletinShareModal
          bulletin={{ ...currentBulletin, id: savedId.current } as Bulletin}
          open={showShare}
          onClose={() => setShowShare(false)}
        />
      )}
    </div>
  );
}
