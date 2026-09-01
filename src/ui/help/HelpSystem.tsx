import { useEffect, useMemo, useState, type CSSProperties } from 'react'

import type { WorkbenchTab } from '../../app/uiState'
import { GUIDE_STEPS, helpArticleFor, type GuidePath, type HelpArticle } from './helpContent'

export type HelpEntryPoint = 'inspect' | 'getting-started' | null

interface HelpToolbarProps {
  entryPoint: HelpEntryPoint
  onChange: (entryPoint: HelpEntryPoint) => void
}

interface HelpSystemProps {
  activeTab: WorkbenchTab
  entryPoint: HelpEntryPoint
  onChangeTab: (tab: WorkbenchTab) => void
  onClose: () => void
}

interface HelpRect {
  bottom: number
  height: number
  left: number
  right: number
  top: number
  width: number
}

interface HelpSelection {
  article: HelpArticle
  element: Element
  rect: HelpRect
}

type HelpView =
  | { kind: 'inspect' }
  | { kind: 'article' }
  | { kind: 'guide-choice' }
  | { index: number; kind: 'guide'; path: GuidePath }
  | { kind: 'complete'; path: GuidePath }
  | null

const INSPECTABLE_SELECTOR = [
  'button',
  'select',
  '[role="slider"]',
  '.parameter-control',
  '.select-control',
  '.header-preset-control',
  '.detailed-oscillator-waveform',
  '.detailed-oscillator-editor',
  '.envelope-plot',
  '.envelope-panel',
  '.lfo-plot',
  '.lfo-panel',
  '[data-effect-id]',
  '.variant-comparison-card',
  '.variant-spectrum',
  '.variant-comparison',
  '.sidebar-transfer',
].join(', ')

function QuestionIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="8.5" />
    <path d="M9.8 9.4a2.4 2.4 0 0 1 4.6 1c0 1.8-2.4 2-2.4 3.6" />
    <path d="M12 17.2h.01" />
  </svg>
}

function PlayIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m9 7 8 5-8 5Z" /></svg>
}

function SynthIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 8h16M7 5v6M4 16h16M16 13v6" /></svg>
}

export function HelpToolbar({ entryPoint, onChange }: HelpToolbarProps) {
  return <div aria-label="Help and onboarding" className="workbench-assistance" role="group">
    <button
      aria-label="Explain a component"
      aria-pressed={entryPoint === 'inspect'}
      className="toolbar-icon-button help-select-button"
      data-testid="help-select-button"
      onClick={() => onChange(entryPoint === 'inspect' ? null : 'inspect')}
      title="Explain a component"
      type="button"
    >
      <QuestionIcon />
    </button>
    <button
      aria-pressed={entryPoint === 'getting-started'}
      className="getting-started-button"
      data-testid="getting-started-button"
      onClick={() => onChange(entryPoint === 'getting-started' ? null : 'getting-started')}
      type="button"
    >
      <span>Getting started</span>
      <i aria-hidden="true">-&gt;</i>
    </button>
  </div>
}

function visibleRect(element: Element): HelpRect {
  const bounds = element.getBoundingClientRect()
  const padding = 4
  const left = Math.max(6, bounds.left - padding)
  const right = Math.min(window.innerWidth - 6, bounds.right + padding)
  const top = Math.max(6, bounds.top - padding)
  const bottom = Math.min(window.innerHeight - 6, bounds.bottom + padding)
  return {
    bottom,
    height: Math.max(8, bottom - top),
    left,
    right,
    top,
    width: Math.max(8, right - left),
  }
}

function inspectableElement(target: EventTarget | null): Element | null {
  if (!(target instanceof Element)) return null
  if (target.closest('.help-system, .workbench-assistance')) return null

  const keyboard = target.closest('.note-keyboard')
  if (keyboard) return keyboard
  const variantCard = target.closest('.variant-comparison-card')
  if (variantCard) return variantCard
  const titledSelect = target.closest('.select-control, .header-preset-control')
  if (titledSelect) return titledSelect
  const effectHandle = target.closest('.fx-module-drag-handle')
  const closest = effectHandle?.closest('[data-effect-id]') ?? target.closest(INSPECTABLE_SELECTOR)
  if (!closest) return null

  const article = helpArticleFor(closest)
  let combined = closest
  let ancestor = closest.parentElement
  while (ancestor) {
    if (ancestor.matches(INSPECTABLE_SELECTOR)) {
      const ancestorArticle = helpArticleFor(ancestor)
      if (
        ancestorArticle.body === article.body
        && ancestorArticle.eyebrow === article.eyebrow
        && ancestorArticle.tip === article.tip
        && ancestorArticle.title === article.title
      ) {
        combined = ancestor
      }
    }
    ancestor = ancestor.parentElement
  }
  return combined
}

function targetStyle(rect: HelpRect): CSSProperties {
  return { height: rect.height, left: rect.left, top: rect.top, width: rect.width }
}

function cardStyle(rect: HelpRect): CSSProperties {
  const width = Math.min(360, window.innerWidth - 20)
  const estimatedHeight = Math.min(390, window.innerHeight - 20)
  const gap = 14
  let left = rect.right + gap
  let top = rect.top

  if (window.innerWidth <= 600) {
    left = 10
    top = rect.top > window.innerHeight / 2
      ? 10
      : Math.max(10, window.innerHeight - estimatedHeight - 10)
  } else if (left + width > window.innerWidth - 10) {
    left = rect.left - width - gap
  }
  if (left < 10) {
    left = Math.max(10, Math.min(window.innerWidth - width - 10, rect.left))
    top = rect.bottom + gap
    if (top + estimatedHeight > window.innerHeight - 10) top = rect.top - estimatedHeight - gap
  }
  return {
    left: Math.max(10, Math.min(left, window.innerWidth - width - 10)),
    top: Math.max(10, Math.min(top, window.innerHeight - estimatedHeight - 10)),
  }
}

function TargetBox({ modal = false, rect, title }: { modal?: boolean; rect: HelpRect; title: string }) {
  return <div
    aria-hidden="true"
    className={`help-target-box${modal ? ' help-target-box-modal' : ''}`}
    data-help-target={title}
    data-testid="help-target-box"
    style={targetStyle(rect)}
  />
}

function InteractiveSpotlight({ rect }: { rect: HelpRect }) {
  const regions: Array<CSSProperties> = [
    { height: rect.top, left: 0, right: 0, top: 0 },
    { bottom: 0, left: 0, right: 0, top: rect.bottom },
    { height: rect.height, left: 0, top: rect.top, width: rect.left },
    { height: rect.height, left: rect.right, right: 0, top: rect.top },
  ]
  return <div aria-hidden="true" className="help-spotlight-shields" data-testid="help-spotlight-shields">
    {regions.map((style, index) => <div className="help-spotlight-shield" key={index} style={style} />)}
  </div>
}

function CloseButton({ onClose }: { onClose: () => void }) {
  return <button aria-label="Close help" className="help-close-button" onClick={onClose} type="button">
    <span aria-hidden="true">x</span>
  </button>
}

function HelpArticleCard({ article, onBack, onClose, rect }: { article: HelpArticle; onBack: () => void; onClose: () => void; rect: HelpRect }) {
  return <section aria-labelledby="help-article-title" className="help-card help-article-card" role="dialog" style={cardStyle(rect)}>
    <header className="help-card-header">
      <span>{article.eyebrow}</span>
      <CloseButton onClose={onClose} />
    </header>
    <h2 id="help-article-title">{article.title}</h2>
    <p>{article.body}</p>
    {article.tip ? <div className="help-tip"><strong>Tip</strong><span>{article.tip}</span></div> : null}
    <footer className="help-card-actions">
      <button className="help-text-button" onClick={onBack} type="button">Select another</button>
      <button className="help-primary-button" onClick={onClose} type="button">Got it</button>
    </footer>
  </section>
}

function GuideChoice({ onClose, onSelect }: { onClose: () => void; onSelect: (path: GuidePath) => void }) {
  return <div className="help-modal-backdrop">
    <section aria-labelledby="getting-started-title" aria-modal="true" className="help-choice-dialog" role="dialog">
      <h2 id="getting-started-title">Getting started</h2>
      <p className="help-choice-intro">Take a short, highlighted tour. Nothing in your patch changes while the guide is running.</p>
      <p className="help-kicker help-route-kicker">Choose your route</p>
      <div className="help-route-grid">
        <button data-testid="guide-just-play" onClick={() => onSelect('just-play')} type="button">
          <i><PlayIcon /></i>
          <strong>Just play</strong>
          <span>Hear presets, use the keyboard, and compare two sounds.</span>
          <small>{GUIDE_STEPS['just-play'].length} stops <b aria-hidden="true">-&gt;</b></small>
        </button>
        <button data-testid="guide-create-synth" onClick={() => onSelect('create-synth')} type="button">
          <i><SynthIcon /></i>
          <strong>Create synth</strong>
          <span>Build a tone, shape it, add effects, and export to Vital.</span>
          <small>{GUIDE_STEPS['create-synth'].length} stops <b aria-hidden="true">-&gt;</b></small>
        </button>
      </div>
      <p className="help-choice-note">Press Escape at any point to leave the guide.</p>
      <div className="help-choice-close"><CloseButton onClose={onClose} /></div>
    </section>
  </div>
}

function GuideCard({ index, onBack, onClose, onNext, path, rect }: { index: number; onBack: () => void; onClose: () => void; onNext: () => void; path: GuidePath; rect: HelpRect }) {
  const steps = GUIDE_STEPS[path]
  const step = steps[index]
  const isLast = index === steps.length - 1
  const routeName = path === 'just-play' ? 'Just play' : 'Create synth'
  return <section aria-keyshortcuts="Enter ArrowLeft ArrowRight" aria-labelledby="guide-step-title" className="help-card help-guide-card" data-testid="guide-step" role="dialog" style={cardStyle(rect)}>
    <header className="help-card-header">
      <span>{routeName}</span>
      <CloseButton onClose={onClose} />
    </header>
    <div className="help-guide-progress">
      <span><b>{String(index + 1).padStart(2, '0')}</b> / {String(steps.length).padStart(2, '0')}</span>
      <i><b style={{ width: `${((index + 1) / steps.length) * 100}%` }} /></i>
    </div>
    <h2 id="guide-step-title">{step.title}</h2>
    <p>{step.body}</p>
    {step.tip ? <div className="help-tip"><strong>Tip</strong><span>{step.tip}</span></div> : null}
    <footer className="help-card-actions">
      <button className="help-text-button" disabled={index === 0} onClick={onBack} type="button">Back</button>
      <button className="help-primary-button" onClick={onNext} type="button">{isLast ? 'Finish' : 'Next'}</button>
    </footer>
  </section>
}

function GuideComplete({ onClose, onRestart, path }: { onClose: () => void; onRestart: () => void; path: GuidePath }) {
  const routeName = path === 'just-play' ? 'Just play' : 'Create synth'
  return <div className="help-modal-backdrop">
    <section aria-labelledby="guide-complete-title" aria-modal="true" className="help-complete-dialog" role="dialog">
      <header className="help-card-header"><span>{routeName} complete</span></header>
      <h2 id="guide-complete-title">You are ready to make some noise.</h2>
      <p>Use the question mark whenever you want a quick explanation of a control without leaving the workbench.</p>
      <div className="help-card-actions">
        <button className="help-text-button" onClick={onRestart} type="button">Choose another route</button>
        <button className="help-primary-button" onClick={onClose} type="button">Start working</button>
      </div>
    </section>
  </div>
}

export function HelpSystem({ activeTab, entryPoint, onChangeTab, onClose }: HelpSystemProps) {
  const [view, setView] = useState<HelpView>(null)
  const [hovered, setHovered] = useState<HelpSelection | null>(null)
  const [selected, setSelected] = useState<HelpSelection | null>(null)
  const [guideRect, setGuideRect] = useState<HelpRect | null>(null)

  useEffect(() => {
    if (entryPoint === 'inspect') setView({ kind: 'inspect' })
    if (entryPoint === 'getting-started') setView({ kind: 'guide-choice' })
    if (entryPoint === null) setView(null)
    setHovered(null)
    setSelected(null)
    setGuideRect(null)
  }, [entryPoint])

  useEffect(() => {
    if (!view) return
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      onClose()
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [onClose, view])

  useEffect(() => {
    if (view?.kind !== 'guide') return
    const handleGuideNavigation = (event: KeyboardEvent) => {
      if (!['Enter', 'ArrowLeft', 'ArrowRight'].includes(event.key) || event.repeat) return
      const target = event.target
      if (target instanceof Element) {
        if (event.key === 'Enter' && target.closest('.help-card button, input, select, textarea, [contenteditable]:not([contenteditable="false"])')) return
        if (event.key !== 'Enter' && target.closest('input, select, textarea, [role="slider"], [contenteditable]:not([contenteditable="false"])')) return
      }
      event.preventDefault()
      setView((current) => {
        if (current?.kind !== 'guide') return current
        if (event.key === 'ArrowLeft') return { ...current, index: Math.max(0, current.index - 1) }
        return current.index === GUIDE_STEPS[current.path].length - 1
          ? { kind: 'complete', path: current.path }
          : { ...current, index: current.index + 1 }
      })
    }
    window.addEventListener('keydown', handleGuideNavigation)
    return () => window.removeEventListener('keydown', handleGuideNavigation)
  }, [view?.kind])

  useEffect(() => {
    if (view?.kind !== 'inspect') {
      document.body.classList.remove('is-choosing-help-target')
      return
    }
    document.body.classList.add('is-choosing-help-target')
    const handlePointerMove = (event: PointerEvent) => {
      const element = inspectableElement(event.target)
      setHovered(element ? { article: helpArticleFor(element), element, rect: visibleRect(element) } : null)
    }
    const blockSelectionGesture = (event: PointerEvent) => {
      if (!inspectableElement(event.target)) return
      event.preventDefault()
      event.stopPropagation()
    }
    const handleClick = (event: MouseEvent) => {
      const element = inspectableElement(event.target)
      if (!element) return
      event.preventDefault()
      event.stopPropagation()
      const selection = { article: helpArticleFor(element), element, rect: visibleRect(element) }
      setSelected(selection)
      setHovered(null)
      setView({ kind: 'article' })
    }
    document.addEventListener('pointerdown', blockSelectionGesture, true)
    document.addEventListener('pointermove', handlePointerMove, true)
    document.addEventListener('click', handleClick, true)
    return () => {
      document.body.classList.remove('is-choosing-help-target')
      document.removeEventListener('pointerdown', blockSelectionGesture, true)
      document.removeEventListener('pointermove', handlePointerMove, true)
      document.removeEventListener('click', handleClick, true)
    }
  }, [view?.kind])

  useEffect(() => {
    if (view?.kind !== 'article' || !selected) return
    const update = () => setSelected((current) => current ? { ...current, rect: visibleRect(current.element) } : null)
    const observer = new ResizeObserver(update)
    observer.observe(selected.element)
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [selected?.element, view?.kind])

  const guideStep = useMemo(() => view?.kind === 'guide' ? GUIDE_STEPS[view.path][view.index] : null, [view])
  useEffect(() => {
    if (view?.kind !== 'guide' || !guideStep) return
    if (guideStep.tab && activeTab !== guideStep.tab) {
      onChangeTab(guideStep.tab)
      return
    }

    let observer: ResizeObserver | null = null
    let frame = 0
    const update = () => {
      const target = document.querySelector(guideStep.selector)
      if (!target) {
        setGuideRect(null)
        return
      }
      const bounds = target.getBoundingClientRect()
      if (bounds.bottom < 8 || bounds.top > window.innerHeight - 8) target.scrollIntoView({ block: 'center', inline: 'nearest' })
      setGuideRect(visibleRect(target))
    }
    frame = window.requestAnimationFrame(() => {
      update()
      const target = document.querySelector(guideStep.selector)
      if (target) {
        observer = new ResizeObserver(update)
        observer.observe(target)
      }
    })
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.cancelAnimationFrame(frame)
      observer?.disconnect()
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [activeTab, guideStep, onChangeTab, view])

  if (!view) return null
  return <div className="help-system">
    {view.kind === 'inspect' ? <>
      {hovered ? <TargetBox rect={hovered.rect} title={hovered.article.title} /> : null}
      <div className="help-picker-banner" data-testid="help-picker-banner" role="status">
        <QuestionIcon />
        <span><strong>Select anything</strong><small>Hover to preview, then click for an explanation</small></span>
        <kbd>Esc</kbd>
      </div>
    </> : null}

    {view.kind === 'article' && selected ? <>
      <InteractiveSpotlight rect={selected.rect} />
      <TargetBox modal rect={selected.rect} title={selected.article.title} />
      <HelpArticleCard article={selected.article} onBack={() => setView({ kind: 'inspect' })} onClose={onClose} rect={selected.rect} />
    </> : null}

    {view.kind === 'guide-choice' ? <GuideChoice onClose={onClose} onSelect={(path) => setView({ index: 0, kind: 'guide', path })} /> : null}

    {view.kind === 'guide' && guideStep && guideRect ? <>
      <InteractiveSpotlight rect={guideRect} />
      <TargetBox modal rect={guideRect} title={guideStep.title} />
      <GuideCard
        index={view.index}
        onBack={() => setView({ ...view, index: Math.max(0, view.index - 1) })}
        onClose={onClose}
        onNext={() => view.index === GUIDE_STEPS[view.path].length - 1
          ? setView({ kind: 'complete', path: view.path })
          : setView({ ...view, index: view.index + 1 })}
        path={view.path}
        rect={guideRect}
      />
    </> : null}

    {view.kind === 'guide' && !guideRect ? <div className="help-guide-loading" role="status">Finding this part of the workbench...</div> : null}
    {view.kind === 'complete' ? <GuideComplete onClose={onClose} onRestart={() => setView({ kind: 'guide-choice' })} path={view.path} /> : null}
  </div>
}
