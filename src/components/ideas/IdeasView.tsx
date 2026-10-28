import { useId, useState, type FormEvent } from 'react'
import { addIdea } from '../../data'
import { formatIdeaMonth, groupIdeas } from '../../lib/ideas'
import { PLATFORM_LABELS, PLATFORMS } from '../../lib/platforms'
import type { ISODate, Idea, Platform } from '../../types'
import { cx } from '../cx'
import { PlatformIcon } from '../PlatformIcon'

// The Ideas area: one column per platform, side by side on wider screens
// and one at a time at phone width.
export function IdeasView({
  ideas,
  today,
  onOpenIdea,
  onMakeProject,
  className,
}: {
  ideas: Idea[] | undefined
  today: ISODate
  onOpenIdea: (ideaId: string) => void
  onMakeProject: (ideaId: string) => void
  className?: string
}) {
  const [shown, setShown] = useState<Platform>('youtube')

  return (
    <section aria-label="Ideas" className={cx('min-h-0 min-w-0 flex-1 overflow-auto p-4 max-md:p-3', className)}>
      <div role="group" aria-label="Platform" className="mb-3 flex rounded-md border border-stone-300 p-0.5 md:hidden">
        {PLATFORMS.map((platform) => (
          <button
            key={platform}
            type="button"
            aria-pressed={shown === platform}
            onClick={() => setShown(platform)}
            className={cx(
              'flex flex-1 items-center justify-center gap-1.5 rounded py-2 text-sm',
              shown === platform ? 'bg-stone-200 font-medium' : 'text-stone-600',
            )}
          >
            <PlatformIcon platform={platform} className="size-4" />
            {PLATFORM_LABELS[platform]}
          </button>
        ))}
      </div>
      <div className="mx-auto grid max-w-5xl gap-6 md:grid-cols-2">
        {PLATFORMS.map((platform) => (
          <IdeaColumn
            key={platform}
            platform={platform}
            ideas={ideas}
            today={today}
            onOpenIdea={onOpenIdea}
            onMakeProject={onMakeProject}
            className={platform === shown ? undefined : 'max-md:hidden'}
          />
        ))}
      </div>
    </section>
  )
}

function IdeaColumn({
  platform,
  ideas,
  today,
  onOpenIdea,
  onMakeProject,
  className,
}: {
  platform: Platform
  ideas: Idea[] | undefined
  today: ISODate
  onOpenIdea: (ideaId: string) => void
  onMakeProject: (ideaId: string) => void
  className?: string
}) {
  const groups = groupIdeas(ideas ?? [], platform, today)
  const count = groups.reduce((sum, group) => sum + group.ideas.length, 0)
  const label = PLATFORM_LABELS[platform]

  return (
    <section aria-label={`${label} ideas`} className={cx('flex min-w-0 flex-col gap-3', className)}>
      <h2 className="flex items-center gap-1.5 text-sm font-medium text-stone-500 max-md:hidden">
        <PlatformIcon platform={platform} className="size-4" />
        {label} · {count}
      </h2>
      <QuickAdd platform={platform} />
      {ideas && count === 0 && <p className="text-sm text-stone-500">No {label} ideas yet.</p>}
      {groups.map((group) => (
        <div key={group.month ?? 'none'} className="flex flex-col gap-2">
          <h3 className={cx('mt-1 text-xs font-medium tracking-wide uppercase', group.past ? 'text-stone-400' : 'text-stone-500')}>
            {group.month ? formatIdeaMonth(group.month) : 'No month'}
            {group.past && <span className="font-normal normal-case"> · past</span>}
          </h3>
          <ul className="flex flex-col gap-2">
            {group.ideas.map((idea) => (
              <li key={idea.id}>
                <IdeaItem
                  idea={idea}
                  onOpen={() => onOpenIdea(idea.id)}
                  onMakeProject={() => onMakeProject(idea.id)}
                />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  )
}

// Type a title and press Enter; the field clears for the next one.
function QuickAdd({ platform }: { platform: Platform }) {
  const [title, setTitle] = useState('')
  const id = useId()

  function submit(event: FormEvent) {
    event.preventDefault()
    if (!title.trim()) return
    void addIdea({ title, platform })
    setTitle('')
  }

  return (
    <form onSubmit={submit} className="flex gap-2">
      <label htmlFor={id} className="sr-only">
        New {PLATFORM_LABELS[platform]} idea
      </label>
      <input
        id={id}
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="Add an idea…"
        enterKeyHint="done"
        className="min-w-0 flex-1 rounded-md border border-stone-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none max-md:text-base"
      />
      <button
        type="submit"
        disabled={!title.trim()}
        className="rounded-md border border-blue-500 bg-blue-50 px-3 text-sm font-medium text-blue-900 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Add
      </button>
    </form>
  )
}

function IdeaItem({
  idea,
  onOpen,
  onMakeProject,
}: {
  idea: Idea
  onOpen: () => void
  onMakeProject: () => void
}) {
  return (
    // The title button stretches over the whole card, so clicking anywhere
    // but Make project opens the idea.
    <article className="relative flex flex-col gap-1 rounded-lg border border-stone-200 bg-white px-3 py-2.5 shadow-xs hover:border-stone-300 hover:shadow-sm">
      <button
        type="button"
        onClick={onOpen}
        className="text-left text-sm leading-snug font-semibold after:absolute after:inset-0 after:rounded-lg"
      >
        {idea.title}
      </button>
      {idea.description && (
        <p className="line-clamp-3 text-xs whitespace-pre-line text-stone-500">{idea.description}</p>
      )}
      <div className="mt-1 flex justify-end">
        <button
          type="button"
          onClick={onMakeProject}
          className="relative rounded-md border border-stone-300 bg-white px-2.5 py-1 text-xs font-medium text-stone-700 hover:bg-stone-50 max-md:px-3 max-md:py-2 max-md:text-sm"
        >
          Make project
        </button>
      </div>
    </article>
  )
}
