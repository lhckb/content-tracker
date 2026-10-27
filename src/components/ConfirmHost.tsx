import { useEffect, useState } from 'react'
import { registerConfirmHost, type Question } from './ask'
import { cx } from './cx'
import { Modal } from './panels/Modal'

// Shows the questions asked with ask(), one at a time, above any open card.
export function ConfirmHost() {
  const [question, setQuestion] = useState<Question | null>(null)
  useEffect(() => registerConfirmHost(setQuestion), [])

  if (!question) return null
  const answer = (yes: boolean) => {
    setQuestion(null)
    question.answer(yes)
  }

  return (
    <Modal label="Confirm" size="alert" focus="[data-confirm]" onClose={() => answer(false)}>
      <div className="flex flex-col gap-5 p-6">
        <p className="text-sm leading-relaxed whitespace-pre-line">{question.message}</p>
        <footer className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => answer(false)}
            className="rounded-md border border-stone-300 px-4 py-2 text-sm hover:bg-stone-50"
          >
            Cancel
          </button>
          <button
            type="button"
            data-confirm
            onClick={() => answer(true)}
            className={cx(
              'rounded-md border px-4 py-2 text-sm font-semibold',
              question.danger
                ? 'border-red-600 bg-red-600 text-white hover:bg-red-700'
                : 'border-blue-500 bg-blue-50 text-blue-900 hover:bg-blue-100',
            )}
          >
            {question.confirmLabel}
          </button>
        </footer>
      </div>
    </Modal>
  )
}
