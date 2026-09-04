/** A transient bottom-centre notice. */
export interface ToastProps {
  /** Null hides it. */
  msg?: string | null
}
export function Toast(props: ToastProps): JSX.Element | null

/** Toast state + a flash(msg) that clears itself after 4s. */
export function useFlash(): { toast: string | null; flash: (msg: string) => void }

export interface UndoBarProps {
  message: string
  onUndo?: () => void
}
export function UndoBar(props: UndoBarProps): JSX.Element
