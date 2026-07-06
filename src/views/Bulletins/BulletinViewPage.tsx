import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Share2, Check, ChevronDown, ChevronUp, Globe, Clock, Pencil, Send, List, Tag, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { bulletinService } from '@/services/bulletinService';
import { useAuth } from '@/hooks/useAuth';
import { BulletinShareModal } from './BulletinShareModal';
import type { Bulletin, BulletinSection, CardsSection, QuoteSection, DividerSection, VideoSection, LinksSection } from '@/models/types/Bulletin';

function fmtDate(d: any) {
  if (!d) return '';
  const dt = d instanceof Date ? d : new Date(d);
  return dt.toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' });
}

const CATEGORY_COLORS: Record<string, string> = {
  'Bienestar':      'bg-emerald-100 text-emerald-700',
  'Cultura':        'bg-purple-100  text-purple-700',
  'Noticias':       'bg-blue-100    text-blue-700',
  'Formación':      'bg-orange-100  text-orange-700',
  'Sostenibilidad': 'bg-teal-100    text-teal-700',
};

// ── Inline bold/italic renderer ───────────────────────────────────────────────

function renderInline(text: string): React.ReactNode {
  return text.split(/(\*\*[\s\S]*?\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') && part.length > 4
      ? <strong key={i} className="font-bold">{part.slice(2, -2)}</strong>
      : part
  );
}

// ── Scroll-triggered animation wrapper ────────────────────────────────────────

const ANIM_CSS: Record<string, string> = {
  'fade-up':    'bulletin-fade-up',
  'fade-in':    'bulletin-fade-in',
  'slide-left': 'bulletin-slide-left',
  'slide-right':'bulletin-slide-right',
  'zoom':       'bulletin-zoom',
};

function FadeIn({ children, delay = 0, className, type = 'fade-up' }: {
  children: React.ReactNode; delay?: number; className?: string; type?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const noAnim = !type;

  useLayoutEffect(() => {
    if (noAnim) return;
    const el = ref.current;
    if (!el) return;
    const cssName = ANIM_CSS[type] || 'bulletin-fade-up';
    el.style.opacity = '0';
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        el.style.animation = 'none';
        void el.offsetWidth; // force reflow so CSS sees a new animation
        el.style.opacity = '';
        el.style.animation = `${cssName} 0.55s ease ${delay}ms both`;
      } else {
        el.style.animation = 'none';
        el.style.opacity = '0';
      }
    }, { threshold: 0.07, rootMargin: '0px 0px -30px 0px' });
    obs.observe(el);
    return () => obs.disconnect();
  }, [noAnim, type, delay]);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}

// ── Section renderers ──────────────────────────────────────────────────────────

const FONT_SIZE_CLASS: Record<string, string> = {
  sm:   'text-sm',
  base: 'text-base',
  lg:   'text-lg',
  xl:   'text-xl',
  '2xl':'text-2xl',
};

function TextRenderer({ section }: { section: Extract<BulletinSection, { type: 'text' }> }) {
  const sizeClass = FONT_SIZE_CLASS[section.fontSize || 'base'] || 'text-base';
  return (
    <div className="max-w-3xl mx-auto">
      {section.title && (
        <h2 className="text-xl sm:text-2xl font-bold text-gray-800 mb-3 sm:mb-4">{section.title}</h2>
      )}
      <div className="prose prose-gray max-w-none">
        {section.content.split('\n').map((p, i) =>
          p.trim() ? (
            <p key={i} className={`text-gray-600 leading-relaxed mb-3 ${sizeClass}`}>{renderInline(p)}</p>
          ) : (
            <br key={i} />
          )
        )}
      </div>
    </div>
  );
}

function ImageRenderer({ section }: { section: Extract<BulletinSection, { type: 'image' }> }) {
  if (!section.imageUrl) return null;
  return (
    <div className="max-w-3xl mx-auto">
      <figure>
        <img
          src={section.imageUrl}
          alt={section.caption || ''}
          className="w-full rounded-2xl shadow-md"
        />
        {section.caption && (
          <figcaption className="text-center text-sm text-gray-400 mt-3 italic">
            {section.caption}
          </figcaption>
        )}
      </figure>
    </div>
  );
}

function StatsRenderer({ section }: { section: Extract<BulletinSection, { type: 'stats' }> }) {
  return (
    <div className="max-w-4xl mx-auto">
      {section.title && (
        <h2 className="text-xl sm:text-2xl font-bold text-gray-800 mb-4 sm:mb-6 text-center">{section.title}</h2>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
        {section.stats.map((stat, i) => (
          <FadeIn key={i} delay={i * 90}>
            <div
              className="rounded-2xl p-3 sm:p-5 text-center shadow-sm border border-gray-100 h-full"
              style={{ background: `${stat.color || '#008C3C'}15`, borderColor: `${stat.color || '#008C3C'}30` }}
            >
              <p
                className="text-3xl sm:text-4xl font-extrabold leading-none mb-1 sm:mb-2"
                style={{ color: stat.color || '#008C3C' }}
              >
                {stat.value}
              </p>
              <p className="text-xs sm:text-sm text-gray-600 font-medium">{stat.label}</p>
            </div>
          </FadeIn>
        ))}
      </div>
    </div>
  );
}

function AccordionRenderer({ section }: { section: Extract<BulletinSection, { type: 'accordion' }> }) {
  const [open, setOpen] = useState<string | null>(null);

  return (
    <div className="max-w-3xl mx-auto">
      {section.title && (
        <h2 className="text-xl sm:text-2xl font-bold text-gray-800 mb-4 sm:mb-6">{section.title}</h2>
      )}
      <div className="space-y-3">
        {section.items.map(item => (
          <div
            key={item.id}
            className="border border-gray-200 rounded-2xl overflow-hidden"
          >
            <button
              className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-50 transition-colors"
              onClick={() => setOpen(open === item.id ? null : item.id)}
            >
              <span className="font-semibold text-gray-800">{item.title}</span>
              {open === item.id
                ? <ChevronUp className="w-5 h-5 text-gray-400 flex-shrink-0" />
                : <ChevronDown className="w-5 h-5 text-gray-400 flex-shrink-0" />}
            </button>
            {open === item.id && (
              <div className="px-5 pb-5 pt-0 border-t bg-gray-50">
                {item.imageUrl && (
                  <img
                    src={item.imageUrl}
                    alt={item.title}
                    className="w-full rounded-xl object-cover max-h-60 mb-4 mt-4"
                  />
                )}
                {item.content.split('\n').map((p, i) =>
                  p.trim() ? (
                    <p key={i} className="text-gray-600 leading-relaxed mb-2">{renderInline(p)}</p>
                  ) : (
                    <br key={i} />
                  )
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function CardsRenderer({ section }: { section: CardsSection }) {
  const cols = section.columns || 3;
  const gridClass = cols === 2 ? 'sm:grid-cols-2' : cols === 4 ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3';
  const style = section.style || 'colored';

  return (
    <div className="max-w-4xl mx-auto">
      {section.title && (
        <h2 className="text-xl sm:text-2xl font-bold text-gray-800 mb-4 sm:mb-6 text-center">{section.title}</h2>
      )}
      <div className={`grid ${gridClass} gap-4 sm:gap-5`}>
        {section.items.map((card, i) => (
          <FadeIn key={card.id} delay={i * 75}>
          <div className={`rounded-2xl overflow-hidden shadow-sm transition-shadow hover:shadow-md h-full ${style === 'minimal' ? 'border border-gray-200' : ''}`}
            style={style === 'colored' ? {
              background: `${card.color || '#008C3C'}12`,
              border: `1px solid ${card.color || '#008C3C'}25`,
            } : undefined}>
            {card.imageUrl && (
              <div className="bg-gray-100 overflow-hidden">
                <img src={card.imageUrl} alt={card.title} className="w-full h-auto block" />
              </div>
            )}
            <div className="p-4 sm:p-5">
              {card.emoji && (
                <span className="text-2xl sm:text-3xl block mb-2 sm:mb-3">{card.emoji}</span>
              )}
              <h3 className="font-bold text-gray-800 mb-1 sm:mb-2 text-sm sm:text-base"
                style={style === 'colored' ? { color: card.color || '#008C3C' } : {}}>
                {card.title}
              </h3>
              <div className="text-sm text-gray-600 leading-relaxed">
                {card.description.split('\n').map((line, i) =>
                  line.trim() ? <p key={i} className="mb-1">{renderInline(line)}</p> : <br key={i} />
                )}
              </div>
            </div>
          </div>
          </FadeIn>
        ))}
      </div>
    </div>
  );
}

function QuoteRenderer({ section }: { section: QuoteSection }) {
  return (
    <div className="max-w-3xl mx-auto">
      <blockquote
        className="border-l-4 pl-4 sm:pl-6 py-2"
        style={{ borderColor: section.color || '#008C3C' }}
      >
        <p className="text-base sm:text-xl italic font-light text-gray-700 leading-relaxed">"{renderInline(section.text)}"</p>
        {section.author && (
          <footer className="mt-2 sm:mt-3 text-sm font-semibold" style={{ color: section.color || '#008C3C' }}>
            — {section.author}
          </footer>
        )}
      </blockquote>
    </div>
  );
}

function DividerRenderer({ section }: { section: DividerSection }) {
  const style = section.style || 'line';
  if (style === 'dots') {
    return (
      <div className="max-w-3xl mx-auto text-center text-gray-300 tracking-[0.5em] text-xl select-none">
        ···
      </div>
    );
  }
  if (style === 'wave') {
    return (
      <div className="max-w-3xl mx-auto overflow-hidden leading-none text-gray-200 text-center select-none">
        <svg viewBox="0 0 200 20" className="w-full h-5" preserveAspectRatio="none">
          <path d="M0,10 C40,0 80,20 120,10 S180,0 200,10" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </div>
    );
  }
  return <div className="max-w-3xl mx-auto"><hr className="border-gray-100" /></div>;
}

function getVideoEmbedUrl(url: string): string | null {
  const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s]+)/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`;
  const vm = url.match(/vimeo\.com\/(\d+)/);
  if (vm) return `https://player.vimeo.com/video/${vm[1]}`;
  return null;
}

function VideoRenderer({ section }: { section: VideoSection }) {
  const embedUrl = getVideoEmbedUrl(section.url);
  if (!embedUrl) return null;
  return (
    <div className="max-w-3xl mx-auto">
      {section.title && <h2 className="text-xl sm:text-2xl font-bold text-gray-800 mb-3 sm:mb-4">{section.title}</h2>}
      <div className="rounded-2xl overflow-hidden aspect-video shadow-md">
        <iframe src={embedUrl} className="w-full h-full" allowFullScreen title={section.title || 'Video'} />
      </div>
      {section.caption && (
        <p className="text-center text-sm text-gray-400 mt-3 italic">{section.caption}</p>
      )}
    </div>
  );
}

function LinksRenderer({ section }: { section: LinksSection }) {
  return (
    <div className="max-w-3xl mx-auto">
      {section.title && (
        <h2 className="text-xl sm:text-2xl font-bold text-gray-800 mb-4">{section.title}</h2>
      )}
      <div className="space-y-3">
        {section.items.filter(item => item.label && item.url).map((item, i) => (
          <FadeIn key={item.id} delay={i * 60}>
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-4 p-4 rounded-2xl border border-gray-100 bg-white hover:shadow-md hover:border-[#008C3C]/30 transition-all group"
            >
              {item.imageUrl && (
                <div className="flex-shrink-0 w-14 h-14 rounded-xl overflow-hidden bg-gray-100">
                  <img src={item.imageUrl} alt={item.label} className="w-full h-full object-cover" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-800 group-hover:text-[#008C3C] transition-colors">{item.label}</p>
                {item.description && (
                  <p className="text-sm text-gray-500 mt-0.5 line-clamp-2">{item.description}</p>
                )}
                <p className="text-xs text-gray-400 mt-1 truncate">{item.url}</p>
              </div>
              <ExternalLink className="w-4 h-4 text-gray-300 group-hover:text-[#008C3C] flex-shrink-0 transition-colors" />
            </a>
          </FadeIn>
        ))}
      </div>
    </div>
  );
}

function SectionRenderer({ section, idx }: { section: BulletinSection; idx: number }) {
  const id = `section-${idx}`;
  return (
    <div id={id}>
      {section.type === 'text'      && <TextRenderer      section={section} />}
      {section.type === 'image'     && <ImageRenderer     section={section} />}
      {section.type === 'stats'     && <StatsRenderer     section={section} />}
      {section.type === 'accordion' && <AccordionRenderer section={section} />}
      {section.type === 'cards'     && <CardsRenderer     section={section} />}
      {section.type === 'quote'     && <QuoteRenderer     section={section} />}
      {section.type === 'divider'   && <DividerRenderer   section={section} />}
      {section.type === 'video'     && <VideoRenderer     section={section} />}
      {section.type === 'links'     && <LinksRenderer     section={section} />}
    </div>
  );
}

// ── Main view ─────────────────────────────────────────────────────────────────

export function BulletinViewPage() {
  const { id }            = useParams<{ id: string }>();
  const navigate          = useNavigate();
  const [searchParams]    = useSearchParams();
  const { user }          = useAuth();
  const viewLoggedRef     = useRef(false);
  const [bulletin, setBulletin]   = useState<Bulletin | null>(null);
  const [loading,  setLoading]    = useState(true);
  const [copied,   setCopied]     = useState(false);
  const [showShare, setShowShare] = useState(false);

  useEffect(() => {
    if (!id) return;
    let done = false;
    const timeout = setTimeout(() => {
      if (!done) { done = true; setLoading(false); }
    }, 8000);

    bulletinService.getById(id)
      .then(b => {
        if (!b) { setBulletin(null); }
        else {
          setBulletin(b);
          bulletinService.incrementViews(id).catch(() => {});
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!done) { done = true; setLoading(false); }
        clearTimeout(timeout);
      });

    return () => { done = true; clearTimeout(timeout); };
  }, [id]);

  // Log who viewed the bulletin
  useEffect(() => {
    if (!id || !bulletin || viewLoggedRef.current) return;
    const r = searchParams.get('r');
    if (r) {
      try {
        const email = atob(r.replace(/-/g, '+').replace(/_/g, '/'));
        viewLoggedRef.current = true;
        bulletinService.logView(id, { email, source: 'email' }).catch(() => {});
      } catch {}
      return;
    }
    if (user?.email) {
      viewLoggedRef.current = true;
      bulletinService.logView(id, { email: user.email, source: 'auth' }).catch(() => {});
    }
  }, [id, bulletin, user, searchParams]);

  const handleShare = async () => {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success('Enlace copiado al portapapeles');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('No se pudo copiar el enlace');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-gray-400">Cargando boletín...</div>
      </div>
    );
  }

  if (!bulletin) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center gap-3 text-center px-4">
        <p className="text-gray-500 font-medium">No se pudo cargar el boletín</p>
        <p className="text-sm text-gray-400">El enlace puede ser inválido o no tener acceso.</p>
      </div>
    );
  }

  const isPublished = bulletin.status === 'published';

  return (
    <div className="min-h-screen bg-white">
      {/* Sticky top bar */}
      <div className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-gray-100 px-4 sm:px-6 py-3 flex items-center justify-between gap-2"
        style={{ animation: 'bulletin-slide-down 0.4s ease both' }}>
        <button
          onClick={() => navigate('/boletines')}
          className="flex items-center gap-1.5 text-gray-500 hover:text-gray-800 text-sm transition-colors shrink-0"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="hidden sm:inline">Boletines</span>
        </button>
        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
          {!isPublished && (
            <span className="hidden sm:flex items-center gap-1 text-xs font-medium text-amber-600 bg-amber-50 px-2.5 py-1 rounded-full border border-amber-200 shrink-0">
              <Clock className="w-3.5 h-3.5" /> Borrador
            </span>
          )}
          {isPublished && (
            <span className="hidden sm:flex items-center gap-1 text-xs font-medium text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200 shrink-0">
              <Globe className="w-3.5 h-3.5" /> Publicado
            </span>
          )}
          {user && (
            <>
              <button
                onClick={() => navigate(`/boletines/${id}/editar`)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 border rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors"
                title="Editar"
              >
                <Pencil className="w-4 h-4" />
                <span className="hidden sm:inline">Editar</span>
              </button>
              <button
                onClick={() => setShowShare(true)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 border rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors"
                title="Enviar"
              >
                <Send className="w-4 h-4" />
                <span className="hidden sm:inline">Enviar</span>
              </button>
            </>
          )}
          <button
            onClick={handleShare}
            className="flex items-center gap-1.5 px-2.5 py-1.5 border rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors"
            title="Copiar enlace"
          >
            {copied ? <Check className="w-4 h-4 text-green-500" /> : <Share2 className="w-4 h-4" />}
            <span className="hidden sm:inline">{copied ? 'Copiado' : 'Enlace'}</span>
          </button>
        </div>
      </div>

      {/* Hero */}
      <div className="relative w-full">
        {bulletin.heroImageUrl ? (
          <img src={bulletin.heroImageUrl} alt="" className="w-full block" />
        ) : (
          <div
            className="h-56 sm:h-80 lg:h-[420px]"
            style={{ backgroundImage: bulletin.heroColor || 'linear-gradient(135deg, #006330, #7BCB6A)' }}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent"
          style={{ animation: 'bulletin-fade-in 1s ease both' }} />
        <div className="absolute bottom-0 left-0 right-0 z-10 px-4 sm:px-8 pb-6 sm:pb-10">
          <div className="max-w-4xl mx-auto">
            {bulletin.category && (
              <span className={`inline-block text-xs font-bold px-3 py-1 rounded-full mb-2 sm:mb-3 ${CATEGORY_COLORS[bulletin.category] || 'bg-white/20 text-white'}`}
                style={{ animation: 'bulletin-fade-up 0.5s ease 0.2s both' }}>
                {bulletin.category}
              </span>
            )}
            <h1 className="text-2xl sm:text-4xl lg:text-5xl font-extrabold text-white leading-tight mb-1 sm:mb-2"
              style={{ animation: 'bulletin-fade-up 0.65s ease 0.35s both' }}>
              {bulletin.title}
            </h1>
            {bulletin.subtitle && (
              <p className="text-white/80 text-sm sm:text-lg"
                style={{ animation: 'bulletin-fade-up 0.55s ease 0.5s both' }}>
                {bulletin.subtitle}
              </p>
            )}
            <div className="mt-2 sm:mt-4 text-white/60 text-xs sm:text-sm"
              style={{ animation: 'bulletin-fade-in 0.5s ease 0.65s both' }}>
              {isPublished && bulletin.publishedAt
                ? `Publicado el ${fmtDate(bulletin.publishedAt)}`
                : `Actualizado el ${fmtDate(bulletin.updatedAt)}`}
              {bulletin.createdByName && ` · ${bulletin.createdByName}`}
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="px-4 sm:px-6 py-8 sm:py-12 space-y-10 sm:space-y-14">

        {/* Table of Contents */}
        {(() => {
          const tocItems = bulletin.sections
            .map((s, i) => {
              const title = (s as any).title;
              return title ? { idx: i, title } : null;
            })
            .filter(Boolean) as { idx: number; title: string }[];
          if (tocItems.length < 2) return null;
          return (
            <FadeIn className="max-w-3xl mx-auto">
              <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4 sm:p-5">
                <div className="flex items-center gap-2 mb-3">
                  <List className="w-4 h-4 text-[#008C3C]" />
                  <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide">Contenido</h3>
                </div>
                <ol className="space-y-1.5">
                  {tocItems.map((item, n) => (
                    <li key={item.idx}>
                      <a
                        href={`#section-${item.idx}`}
                        className="flex items-center gap-2 text-sm text-gray-600 hover:text-[#008C3C] transition-colors group"
                      >
                        <span className="text-[11px] font-bold text-[#008C3C]/60 w-5">{n + 1}.</span>
                        <span className="group-hover:underline">{item.title}</span>
                      </a>
                    </li>
                  ))}
                </ol>
              </div>
            </FadeIn>
          );
        })()}

        {/* Intro */}
        {bulletin.introText && (
          <FadeIn className="max-w-3xl mx-auto">
            <p className="text-base sm:text-xl text-gray-600 leading-relaxed font-light border-l-4 border-[#008C3C] pl-4 sm:pl-6">
              {bulletin.introText}
            </p>
          </FadeIn>
        )}

        {/* Sections */}
        {bulletin.sections.map((section, i) => (
          <FadeIn key={section.id} type={section.animation ?? 'fade-up'}>
            <SectionRenderer section={section} idx={i} />
            {section.type !== 'divider' && i < bulletin.sections.length - 1 && bulletin.sections[i + 1]?.type !== 'divider' && (
              <div className="max-w-3xl mx-auto mt-10 sm:mt-14">
                <hr className="border-gray-100" />
              </div>
            )}
          </FadeIn>
        ))}

        {/* Tags */}
        {bulletin.tags && bulletin.tags.length > 0 && (
          <div className="max-w-3xl mx-auto">
            <div className="flex flex-wrap gap-2">
              {bulletin.tags.map(tag => (
                <span key={tag} className="flex items-center gap-1 bg-gray-100 text-gray-500 text-xs px-3 py-1 rounded-full">
                  <Tag className="w-3 h-3" />#{tag}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="max-w-3xl mx-auto pt-6 sm:pt-8 border-t border-gray-100 text-center">
          <p className="text-xs text-gray-400">
            Boletín interno · {isPublished ? fmtDate(bulletin.publishedAt) : 'Borrador'}
            {bulletin.createdByName && ` · Creado por ${bulletin.createdByName}`}
            {bulletin.views != null && bulletin.views > 0 && ` · ${bulletin.views} vista${bulletin.views > 1 ? 's' : ''}`}
          </p>
        </div>
      </div>

      {/* Share modal */}
      {showShare && (
        <BulletinShareModal
          bulletin={bulletin}
          open={showShare}
          onClose={() => setShowShare(false)}
        />
      )}
    </div>
  );
}
