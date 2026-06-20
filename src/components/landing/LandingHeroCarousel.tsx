import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { LandingSponsor } from '@/hooks/useLandingSponsors'
import { AdvertiseVacantBillboard } from '@/components/landing/AdvertiseVacantBillboard'

const FUELBOT_SLIDES = [
  { src: '/landing-carousel/fuelbot-1.png', captionKey: 'landing.heroCarousel1' },
  { src: '/landing-carousel/fuelbot-2.png', captionKey: 'landing.heroCarousel2' },
  { src: '/landing-carousel/fuelbot-3.png', captionKey: 'landing.heroCarousel3' },
] as const

const FUELBOT_MS = 18_000
const SPONSOR_MS = 10_000

type HeroSlide =
  | { kind: 'fuelbot'; src: string; captionKey: string }
  | { kind: 'sponsor'; sponsor: LandingSponsor; caption: string }
  | { kind: 'vacant' }

function buildInterleavedSlides(sponsors: LandingSponsor[], lang: 'en' | 'my'): HeroSlide[] {
  const slides: HeroSlide[] = []
  let sponsorIdx = 0

  for (let i = 0; i < FUELBOT_SLIDES.length; i++) {
    const fb = FUELBOT_SLIDES[i]
    slides.push({ kind: 'fuelbot', src: fb.src, captionKey: fb.captionKey })

    if (sponsors.length === 0) {
      slides.push({ kind: 'vacant' })
    } else {
      const sponsor = sponsors[sponsorIdx % sponsors.length]
      sponsorIdx += 1
      const caption =
        (lang === 'my' ? sponsor.caption_my : sponsor.caption_en)?.trim() ||
        sponsor.company_name?.trim() ||
        ''
      slides.push({ kind: 'sponsor', sponsor, caption })
    }
  }

  return slides
}

function slideDurationMs(slide: HeroSlide): number {
  return slide.kind === 'fuelbot' ? FUELBOT_MS : SPONSOR_MS
}

interface LandingHeroCarouselProps {
  sponsors: LandingSponsor[]
}

export function LandingHeroCarousel({ sponsors }: LandingHeroCarouselProps) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language === 'my' ? 'my' : 'en'
  const slides = useMemo(() => buildInterleavedSlides(sponsors, lang), [sponsors, lang])
  const [index, setIndex] = useState(0)
  const activeIndex = slides.length > 0 ? index % slides.length : 0
  const current = slides[activeIndex] ?? slides[0]

  useEffect(() => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (reduceMotion.matches || slides.length === 0) return

    const slide = slides[activeIndex]
    if (!slide) return

    const timer = window.setTimeout(() => {
      setIndex((prev) => prev + 1)
    }, slideDurationMs(slide))

    return () => window.clearTimeout(timer)
  }, [activeIndex, slides])

  function captionForSlide(slide: HeroSlide): string {
    switch (slide.kind) {
      case 'fuelbot':
        return t(slide.captionKey)
      case 'sponsor':
        return slide.caption
      case 'vacant':
        return t('landing.advertiseVacantCaption', { email: t('landing.contactEmail') })
      default: {
        const exhaustive: never = slide
        return exhaustive
      }
    }
  }

  function renderSlideImage(slide: HeroSlide, slideKey: string, isCurrent: boolean) {
    const fadeClass = `absolute inset-0 h-full w-full transition-opacity duration-700 ${isCurrent ? 'opacity-100' : 'opacity-0'}`
    const imageClass = `${fadeClass} object-cover`

    if (slide.kind === 'fuelbot') {
      return (
        <img
          key={slideKey}
          src={slide.src}
          alt=""
          aria-hidden={!isCurrent}
          className={imageClass}
        />
      )
    }

    if (slide.kind === 'sponsor') {
      if (slide.sponsor.link_url?.trim()) {
        return (
          <a
            key={slideKey}
            href={slide.sponsor.link_url.trim()}
            target="_blank"
            rel="noopener noreferrer"
            className={`${fadeClass} block ${isCurrent ? 'z-[1]' : 'z-0 pointer-events-none'}`}
            aria-hidden={!isCurrent}
            tabIndex={isCurrent ? 0 : -1}
          >
            <img
              src={slide.sponsor.image_url ?? ''}
              alt={slide.sponsor.company_name ?? ''}
              className="h-full w-full object-cover"
            />
          </a>
        )
      }
      return (
        <img
          key={slideKey}
          src={slide.sponsor.image_url ?? ''}
          alt={slide.sponsor.company_name ?? ''}
          aria-hidden={!isCurrent}
          className={imageClass}
        />
      )
    }

    return (
      <Link
        key={slideKey}
        to="/advertise"
        className={`${fadeClass} block overflow-hidden ${isCurrent ? 'z-[1]' : 'z-0 pointer-events-none'}`}
        aria-label={t('landing.advertiseVacantHeadline')}
        aria-hidden={!isCurrent}
        tabIndex={isCurrent ? 0 : -1}
      >
        <AdvertiseVacantBillboard variant="carousel" />
      </Link>
    )
  }

  return (
    <section
      className="relative overflow-hidden rounded-2xl bg-white shadow-sm"
      role="region"
      aria-roledescription="carousel"
      aria-label={t('landing.heroCarouselAriaLabel')}
    >
      <div className="relative aspect-[16/7] w-full bg-gray-100">
        {slides.map((slide, idx) => renderSlideImage(slide, `slide-${idx}`, idx === activeIndex))}

        {current?.kind === 'sponsor' && (
          <span className="absolute right-3 top-3 z-10 rounded-full bg-black/50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white sm:text-xs">
            {t('landing.sponsoredLabel')}
          </span>
        )}

        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[2] bg-gradient-to-t from-black/80 via-black/45 to-transparent px-3 pb-12 pt-14 sm:px-6 sm:pb-14 sm:pt-16">
          <p
            id="landing-hero-carousel-caption"
            aria-live="polite"
            aria-atomic="true"
            className="mx-auto max-w-3xl text-center text-base font-medium leading-snug text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] sm:text-lg"
          >
            {current ? captionForSlide(current) : ''}
          </p>
        </div>
      </div>
      <div className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/40 px-2 py-1">
        {slides.map((_, idx) => {
          const total = slides.length
          const isCurrent = idx === activeIndex
          return (
            <button
              key={idx}
              type="button"
              aria-label={
                isCurrent
                  ? t('landing.heroCarouselGoToSlideCurrent', { n: idx + 1, total })
                  : t('landing.heroCarouselGoToSlide', { n: idx + 1, total })
              }
              aria-current={isCurrent ? 'true' : undefined}
              onClick={() => setIndex(idx)}
              className={`h-2.5 w-2.5 rounded-full transition-colors ${isCurrent ? 'bg-white' : 'bg-white/55 hover:bg-white/80'}`}
            />
          )
        })}
      </div>
    </section>
  )
}
