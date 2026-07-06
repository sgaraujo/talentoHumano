import { useState } from 'react';
import { ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';
import type {
  Bulletin, BulletinSection, TextSection, ImageSection,
  StatsSection, AccordionSection, CardsSection, QuoteSection, DividerSection, VideoSection, LinksSection,
} from '@/models/types/Bulletin';

function renderInline(text: string): React.ReactNode {
  return text.split(/(\*\*[\s\S]*?\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') && part.length > 4
      ? <strong key={i} className="font-bold">{part.slice(2, -2)}</strong>
      : part
  );
}

const CATEGORY_COLORS: Record<string, string> = {
  'Bienestar':      'bg-emerald-100 text-emerald-700',
  'Cultura':        'bg-purple-100  text-purple-700',
  'Noticias':       'bg-blue-100    text-blue-700',
  'Formación':      'bg-orange-100  text-orange-700',
  'Sostenibilidad': 'bg-teal-100    text-teal-700',
};

const FONT_SIZE_CLASS: Record<string, string> = {
  sm:   'text-xs',
  base: 'text-sm',
  lg:   'text-base',
  xl:   'text-lg',
  '2xl':'text-xl',
};

function TextRenderer({ s }: { s: TextSection }) {
  const sizeClass = FONT_SIZE_CLASS[s.fontSize || 'base'] || 'text-sm';
  return (
    <div>
      {s.title && <h2 className="text-xl font-bold text-gray-800 mb-3">{s.title}</h2>}
      {s.content.split('\n').map((p, i) =>
        p.trim()
          ? <p key={i} className={`text-gray-600 leading-relaxed mb-2 ${sizeClass}`}>{renderInline(p)}</p>
          : <br key={i} />
      )}
    </div>
  );
}

function ImageRenderer({ s }: { s: ImageSection }) {
  if (!s.imageUrl) return null;
  return (
    <figure>
      <img src={s.imageUrl} alt={s.caption || ''} className="w-full rounded-xl shadow-sm" />
      {s.caption && <figcaption className="text-center text-xs text-gray-400 mt-2 italic">{s.caption}</figcaption>}
    </figure>
  );
}

function StatsRenderer({ s }: { s: StatsSection }) {
  if (!s.stats.length) return null;
  return (
    <div>
      {s.title && <h2 className="text-xl font-bold text-gray-800 mb-4 text-center">{s.title}</h2>}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {s.stats.map((stat, i) => (
          <div key={i} className="rounded-xl p-4 text-center"
            style={{ background: `${stat.color || '#008C3C'}15`, border: `1px solid ${stat.color || '#008C3C'}30` }}>
            <p className="text-3xl font-extrabold leading-none mb-1" style={{ color: stat.color || '#008C3C' }}>{stat.value}</p>
            <p className="text-xs text-gray-600 font-medium">{stat.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function AccordionRenderer({ s }: { s: AccordionSection }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div>
      {s.title && <h2 className="text-xl font-bold text-gray-800 mb-4">{s.title}</h2>}
      <div className="space-y-2">
        {s.items.map(item => (
          <div key={item.id} className="border border-gray-200 rounded-xl overflow-hidden">
            <button className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 transition-colors"
              onClick={() => setOpen(open === item.id ? null : item.id)}>
              <span className="font-semibold text-gray-800 text-sm">{item.title}</span>
              {open === item.id ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
            </button>
            {open === item.id && (
              <div className="px-4 pb-4 border-t bg-gray-50">
                {item.imageUrl && <img src={item.imageUrl} alt={item.title} className="w-full rounded-lg object-cover max-h-40 mb-3 mt-3" />}
                {item.content.split('\n').map((p, i) =>
                  p.trim() ? <p key={i} className="text-gray-600 text-sm leading-relaxed mb-1">{renderInline(p)}</p> : <br key={i} />
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function CardsRenderer({ s }: { s: CardsSection }) {
  const cols = s.columns || 3;
  const gridClass = cols === 2 ? 'grid-cols-2' : cols === 4 ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-2 sm:grid-cols-3';
  const style = s.style || 'colored';

  return (
    <div>
      {s.title && <h2 className="text-xl font-bold text-gray-800 mb-4 text-center">{s.title}</h2>}
      <div className={`grid ${gridClass} gap-3`}>
        {s.items.map(card => (
          <div key={card.id} className={`rounded-xl overflow-hidden ${style === 'minimal' ? 'border border-gray-200 p-4' : ''}`}
            style={style === 'colored' ? { background: `${card.color || '#008C3C'}15`, border: `1px solid ${card.color || '#008C3C'}25`, padding: '1rem' } : undefined}>
            {card.imageUrl && (
              <div className="bg-gray-100 overflow-hidden">
                <img src={card.imageUrl} alt={card.title} className="w-full h-auto block" />
              </div>
            )}
            <div className={style === 'image' ? 'p-3' : ''}>
              {card.emoji && (
                <span className="text-2xl block mb-2">{card.emoji}</span>
              )}
              <p className="font-bold text-gray-800 text-sm mb-1" style={style === 'colored' ? { color: card.color || '#008C3C' } : {}}>{card.title}</p>
              <div className="text-xs text-gray-600 leading-relaxed">
                {card.description.split('\n').map((line, i) =>
                  line.trim() ? <p key={i} className="mb-0.5">{renderInline(line)}</p> : <br key={i} />
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function QuoteRenderer({ s }: { s: QuoteSection }) {
  return (
    <blockquote className="border-l-4 pl-4 py-1" style={{ borderColor: s.color || '#008C3C' }}>
      <p className="text-base italic font-light text-gray-700">"{s.text}"</p>
      {s.author && <footer className="mt-1 text-xs font-semibold" style={{ color: s.color || '#008C3C' }}>— {s.author}</footer>}
    </blockquote>
  );
}

function DividerRenderer({ s }: { s: DividerSection }) {
  if (s.style === 'dots') return <div className="text-center text-gray-300 tracking-[0.5em]">···</div>;
  if (s.style === 'wave') return (
    <div className="overflow-hidden text-gray-200">
      <svg viewBox="0 0 200 20" className="w-full h-4" preserveAspectRatio="none">
        <path d="M0,10 C40,0 80,20 120,10 S180,0 200,10" fill="none" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    </div>
  );
  return <hr className="border-gray-100" />;
}

function VideoRenderer({ s }: { s: VideoSection }) {
  const yt = s.url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s]+)/);
  const vm = s.url.match(/vimeo\.com\/(\d+)/);
  const embedUrl = yt ? `https://www.youtube.com/embed/${yt[1]}` : vm ? `https://player.vimeo.com/video/${vm[1]}` : null;
  if (!embedUrl) return (
    <div className="rounded-lg bg-gray-100 h-24 flex items-center justify-center text-xs text-gray-400">
      Pega un link de YouTube o Vimeo
    </div>
  );
  return (
    <div className="rounded-xl overflow-hidden aspect-video">
      <iframe src={embedUrl} className="w-full h-full" allowFullScreen title="video" />
    </div>
  );
}

function LinksRenderer({ s }: { s: LinksSection }) {
  return (
    <div>
      {s.title && <h2 className="text-base font-bold text-gray-800 mb-2">{s.title}</h2>}
      <div className="space-y-2">
        {s.items.filter(item => item.label && item.url).map(item => (
          <div key={item.id} className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 bg-gray-50 group">
            {item.imageUrl && (
              <div className="flex-shrink-0 w-10 h-10 rounded-lg overflow-hidden bg-gray-200">
                <img src={item.imageUrl} alt={item.label} className="w-full h-full object-cover" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-[#008C3C] truncate">{item.label}</p>
              {item.description && <p className="text-xs text-gray-400 truncate">{item.description}</p>}
            </div>
            <ExternalLink className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}

function SectionRenderer({ section }: { section: BulletinSection }) {
  if (section.type === 'text')      return <TextRenderer      s={section} />;
  if (section.type === 'image')     return <ImageRenderer     s={section} />;
  if (section.type === 'stats')     return <StatsRenderer     s={section} />;
  if (section.type === 'accordion') return <AccordionRenderer s={section} />;
  if (section.type === 'cards')     return <CardsRenderer     s={section} />;
  if (section.type === 'quote')     return <QuoteRenderer     s={section} />;
  if (section.type === 'divider')   return <DividerRenderer   s={section} />;
  if (section.type === 'video')     return <VideoRenderer     s={section} />;
  if (section.type === 'links')     return <LinksRenderer     s={section} />;
  return null;
}

interface Props {
  bulletin: Partial<Bulletin>;
}

export function BulletinInlinePreview({ bulletin }: Props) {
  const { title, subtitle, category, heroImageUrl, heroColor, introText, sections = [] } = bulletin;

  return (
    <div className="bg-white min-h-full">
      {/* Mini hero */}
      <div className="relative w-full">
        {heroImageUrl ? (
          <img src={heroImageUrl} alt="" className="w-full block" />
        ) : (
          <div className="h-40"
            style={{ backgroundImage: heroColor || 'linear-gradient(135deg, #006330, #7BCB6A)' }} />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 z-10 p-4 w-full">
          {category && (
            <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full mb-1 ${CATEGORY_COLORS[category] || 'bg-white/20 text-white'}`}>
              {category}
            </span>
          )}
          <h1 className="text-base font-extrabold text-white leading-tight">{title || 'Título del boletín'}</h1>
          {subtitle && <p className="text-white/75 text-xs mt-0.5">{subtitle}</p>}
        </div>
      </div>

      {/* Content */}
      <div className="px-5 py-6 space-y-8">
        {introText && (
          <p className="text-gray-600 text-sm leading-relaxed border-l-4 border-[#008C3C] pl-4 font-light">
            {introText}
          </p>
        )}
        {sections.map(section => (
          <div key={section.id}>
            <SectionRenderer section={section} />
          </div>
        ))}
        {!introText && sections.length === 0 && (
          <div className="text-center text-gray-300 py-12 text-sm">
            El contenido aparecerá aquí en tiempo real
          </div>
        )}
      </div>
    </div>
  );
}
